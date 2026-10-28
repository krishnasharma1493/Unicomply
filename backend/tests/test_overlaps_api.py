from typing import Callable, Dict

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.modules.audit.models import AuditLog
from app.modules.overlaps.models import OverlapGroup, OverlapPair
from app.modules.alerts.models import Alert

Headers = Callable[[str], Dict[str, str]]
SENIOR = "senior@aicte.example"
PGRC = "pgrc.head@aicte.example"
RB = "rb.head@aicte.example"
INTAKE = "intake@aicte.example"


def test_overlap_list_and_detail_are_scoped_and_explained(seeded_client: TestClient, auth_headers: Headers):
    response = seeded_client.get("/api/v1/overlaps?tier=probable", headers=auth_headers(PGRC))
    assert response.status_code == 200
    assert response.json()["pagination"]["total"] == 1
    detail = seeded_client.get("/api/v1/overlaps/1", headers=auth_headers(PGRC))
    assert detail.status_code == 200
    data = detail.json()["data"]
    assert data["group"]["banner"] == "Potential Overlapping Cases – Coordination Required"
    assert {case["case_ref"] for case in data["cases"]} >= {"PGRC/2026/00412", "RB/2026/00087"}
    hidden = seeded_client.get("/api/v1/overlaps/4", headers=auth_headers(RB))
    assert hidden.status_code == 404


def test_confirm_notifies_involved_bureau_heads_and_records_audit(seeded_client, auth_headers, seeded_engine):
    response = seeded_client.post("/api/v1/overlaps/1/decision", headers=auth_headers(PGRC),
                                  json={"decision": "confirm", "coordinator_id": 6, "remark": "Coordinate actions"})
    assert response.status_code == 200, response.text
    assert response.json()["data"]["group"]["status"] == "confirmed"
    with Session(seeded_engine) as session:
        recipients = set(session.exec(select(Alert.recipient_id).where(Alert.group_id == 1)).all())
        assert {1, 2, 3, 4}.issubset(recipients)
        assert session.exec(select(AuditLog).where(AuditLog.entity == "overlap_group", AuditLog.entity_id == "1")).all()
    # a confirmed group can be dismissed no more, but it can still be resolved...
    dismiss = seeded_client.post("/api/v1/overlaps/1/decision", headers=auth_headers(PGRC),
                                 json={"decision": "dismiss", "remark": "Changed my mind"})
    assert dismiss.status_code == 409 and dismiss.json()["error"]["code"] == "ALREADY_DECIDED"
    resolved = seeded_client.post("/api/v1/overlaps/1/decision", headers=auth_headers(PGRC),
                                  json={"decision": "resolve", "remark": "Done"})
    assert resolved.status_code == 200 and resolved.json()["data"]["group"]["status"] == "resolved"
    # ...and a resolved one is final.
    again = seeded_client.post("/api/v1/overlaps/1/decision", headers=auth_headers(PGRC),
                               json={"decision": "resolve", "remark": "Done again"})
    assert again.status_code == 409 and again.json()["error"]["code"] == "ALREADY_DECIDED"


def test_dismiss_requires_remark_and_suppresses_pair(seeded_client, auth_headers, seeded_engine):
    missing = seeded_client.post("/api/v1/overlaps/4/decision", headers=auth_headers(PGRC),
                                 json={"decision": "dismiss"})
    assert missing.status_code == 400 and missing.json()["error"]["code"] == "REMARKS_REQUIRED"
    accepted = seeded_client.post("/api/v1/overlaps/4/decision", headers=auth_headers(PGRC),
                                  json={"decision": "dismiss", "remark": "Different issues"})
    assert accepted.status_code == 200
    with Session(seeded_engine) as session:
        group = session.get(OverlapGroup, 4)
        assert group.status.value == "dismissed"
        assert all(pair.decision.value == "dismissed" for pair in session.exec(select(OverlapPair).where(
            OverlapPair.case_a_id.in_([110, 111]), OverlapPair.case_b_id.in_([110, 111])
        )).all())


def test_ineligible_actor_cannot_decide(seeded_client, auth_headers):
    response = seeded_client.post("/api/v1/overlaps/1/decision", headers=auth_headers(INTAKE),
                                  json={"decision": "confirm", "coordinator_id": 6})
    assert response.status_code == 403


def test_a_head_of_an_involved_bureau_can_coordinate_but_other_users_cannot(seeded_client, auth_headers):
    """The contract's own example confirms with the PGRC head (user 2) as coordinator."""
    for coordinator, ok in ((2, True),):
        res = seeded_client.post("/api/v1/overlaps/1/decision", headers=auth_headers(PGRC),
                                 json={"decision": "confirm", "coordinator_id": coordinator, "remark": "PGRC leads"})
        assert (res.status_code == 200) is ok, res.text
        assert res.json()["data"]["group"]["coordinator_name"] == "Anil Deshmukh"


def test_the_coordinator_must_work_in_an_involved_bureau(seeded_client, auth_headers):
    for coordinator in (5, 1, 9, 999):  # intake operator, senior officer, an Approval Bureau officer, nobody
        res = seeded_client.post("/api/v1/overlaps/1/decision", headers=auth_headers(PGRC),
                                 json={"decision": "confirm", "coordinator_id": coordinator})
        assert res.status_code == 400 and "coordinator_id" in res.json()["error"]["fields"], coordinator
