"""Workflow state machine and its HTTP transaction boundary (issue #15)."""

from datetime import date
from typing import Callable, Dict

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.enums import ActionType, CaseStatus
from app.modules.audit.models import AuditLog
from app.modules.cases.models import Case, CaseAction

Headers = Callable[[str], Dict[str, str]]
SENIOR = "senior@aicte.example"
PGRC = "pgrc.head@aicte.example"
RB = "rb.head@aicte.example"


def act(client: TestClient, headers: Dict[str, str], case_id: int, **body):
    return client.post(f"/api/v1/cases/{case_id}/actions", headers=headers, json={"action_type": "remark", **body})


def test_assign_changes_status_and_writes_action_and_audit(seeded_client, auth_headers, seeded_engine):
    response = act(seeded_client, auth_headers(PGRC), 112, action_type="assign", to_officer_id=6, remarks="Take ownership")
    assert response.status_code == 200, response.text
    assert response.json()["data"]["case"]["status"] == "under_process"
    assert response.json()["data"]["action"]["actor_name"] == "Anil Deshmukh"
    with Session(seeded_engine) as session:
        assert session.exec(select(CaseAction).where(CaseAction.case_id == 112).order_by(CaseAction.id.desc())).first().action_type == ActionType.assign
        assert session.exec(select(AuditLog).where(AuditLog.entity_id == "112", AuditLog.field == "status")).all()


def test_transfer_keeps_sla_clears_officer_and_records_source(seeded_client, auth_headers, seeded_engine):
    with Session(seeded_engine) as session:
        due = session.get(Case, 101).sla_due_on
    response = act(seeded_client, auth_headers(PGRC), 101, action_type="transfer", to_bureau_id=1, remarks="Transfer for RB review")
    assert response.status_code == 200, response.text
    with Session(seeded_engine) as session:
        case = session.get(Case, 101)
        entry = session.exec(select(CaseAction).where(CaseAction.case_id == 101).order_by(CaseAction.id.desc())).first()
        assert case.status == CaseStatus.transferred and case.current_bureau_id == 1
        assert case.assigned_officer_id is None and case.sla_due_on == due
        assert entry.from_bureau_id == 2 and entry.to_bureau_id == 1


def test_interim_reply_requires_date(seeded_client, auth_headers):
    missing = act(seeded_client, auth_headers(PGRC), 101, action_type="interim_reply")
    assert missing.status_code == 400 and missing.json()["error"]["fields"]["expected_disposal_date"]
    ok = act(seeded_client, auth_headers(PGRC), 101, action_type="interim_reply", expected_disposal_date="2026-12-01")
    assert ok.status_code == 200 and ok.json()["data"]["case"]["expected_disposal_date"] == "2026-12-01"


def test_escalate_raises_alert(seeded_client, auth_headers, seeded_engine):
    response = act(seeded_client, auth_headers(PGRC), 101, action_type="escalate", remarks="Need senior review")
    assert response.status_code == 200 and response.json()["data"]["case"]["escalation_level"] == 1
    from app.modules.alerts.models import Alert
    with Session(seeded_engine) as session:
        recipients = session.exec(select(Alert.recipient_id).where(Alert.type == "escalation", Alert.case_id == 101)).all()
        assert {1, 2}.issubset(set(recipients))


def test_dispose_requires_outcome_and_open_overlap_confirmation(seeded_client, auth_headers, seeded_engine):
    missing = act(seeded_client, auth_headers(PGRC), 101, action_type="dispose", remarks="Completed")
    assert missing.status_code == 400 and "outcome" in missing.json()["error"]["fields"]
    blocked = act(seeded_client, auth_headers(PGRC), 101, action_type="dispose", outcome="redressed", remarks="Completed")
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "OPEN_OVERLAP"
    assert blocked.json()["error"]["details"]["linked_case_refs"]
    done = act(seeded_client, auth_headers(PGRC), 101, action_type="dispose", outcome="redressed", remarks="Completed", confirm_open_overlap=True)
    assert done.status_code == 200 and done.json()["data"]["case"]["status"] == "disposed"


def test_reopen_requires_disposed_case_remarks_and_resets_sla(seeded_client, auth_headers, seeded_engine, monkeypatch):
    from app.modules.cases import workflow
    monkeypatch.setattr(workflow, "today", lambda: date(2026, 11, 20))
    missing = act(seeded_client, auth_headers(SENIOR), 107, action_type="reopen")
    assert missing.status_code == 400 and missing.json()["error"]["code"] == "REMARKS_REQUIRED"
    response = act(seeded_client, auth_headers(SENIOR), 107, action_type="reopen", remarks="New evidence received")
    assert response.status_code == 200
    assert response.json()["data"]["case"]["status"] == "reopened"
    assert response.json()["data"]["case"]["reopen_count"] == 1
    assert response.json()["data"]["case"]["sla_due_on"] == "2026-12-11"


@pytest.mark.parametrize("action_type", ["assign", "transfer", "escalate", "interim_reply", "dispose"])
def test_invalid_transition_is_rejected_without_writes(seeded_client, auth_headers, seeded_engine, action_type):
    # Case 107 is disposed; only remark and reopen are permitted.
    with Session(seeded_engine) as session:
        before = len(session.exec(select(CaseAction).where(CaseAction.case_id == 107)).all())
    response = act(seeded_client, auth_headers(SENIOR), 107, action_type=action_type, remarks="Test", to_officer_id=6,
                   to_bureau_id=1, expected_disposal_date="2026-12-01", outcome="redressed", confirm_open_overlap=True)
    assert response.status_code == 400 and response.json()["error"]["code"] == "INVALID_TRANSITION"
    with Session(seeded_engine) as session:
        after = len(session.exec(select(CaseAction).where(CaseAction.case_id == 107)).all())
        assert after == before


def test_remarks_required_and_scope_checked(seeded_client, auth_headers):
    missing = act(seeded_client, auth_headers(PGRC), 101, action_type="transfer", to_bureau_id=1)
    assert missing.status_code == 400 and missing.json()["error"]["code"] == "REMARKS_REQUIRED"
    wrong_bureau = act(seeded_client, auth_headers(RB), 101, action_type="remark", remarks="no")
    assert wrong_bureau.status_code == 404


def test_remark_is_allowed_after_disposal(seeded_client, auth_headers):
    response = act(seeded_client, auth_headers(SENIOR), 107, action_type="remark", remarks="Follow-up note")
    assert response.status_code == 200 and response.json()["data"]["case"]["status"] == "disposed"
