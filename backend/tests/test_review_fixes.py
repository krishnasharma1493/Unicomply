"""Regression tests for the review of #15–#22: index cache lifetime and escalation rules."""

from typing import Any, Callable, Dict

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.fixtures import load_fixture
from app.matching.normalize import load_abbreviations, load_district_aliases
from app.modules.alerts.models import Alert
from app.modules.engine import service as engine_service

Headers = Callable[[str], Dict[str, str]]


@pytest.fixture(autouse=True)
def clean_indexes() -> Any:
    engine_service.reset_indexes()
    yield
    engine_service.reset_indexes()


def test_index_is_cached_per_engine_and_reset_drops_it(seeded_engine) -> None:
    with Session(seeded_engine) as session:
        first = engine_service.current_index(session)
        assert first is not None and engine_service.current_index(session) is first
        engine_service.reset_indexes()
        assert engine_service.current_index(session) is not first


def test_demo_reset_drops_the_index(seeded_client: TestClient, auth_headers: Headers, seeded_engine) -> None:
    with Session(seeded_engine) as session:
        engine_service.current_index(session)
    assert len(engine_service._INDEXES) >= 1
    assert seeded_client.post("/api/v1/demo/reset", headers=auth_headers("senior@aicte.example")).status_code == 200
    assert len(engine_service._INDEXES) == 0


def test_failed_intake_drops_the_index_so_no_phantom_case_survives(
    seeded_client: TestClient, auth_headers: Headers, monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(*_: Any, **__: Any) -> None:
        raise RuntimeError("engine failure")

    monkeypatch.setattr(engine_service, "apply_overlaps", boom)
    body = load_fixture("requests/post_cases")
    res = seeded_client.post("/api/v1/cases", json=body, headers=auth_headers("intake@aicte.example"))
    assert res.status_code == 500
    assert len(engine_service._INDEXES) == 0  # resolve_for_intake had put the new case into it


def escalate(client: TestClient, headers: Dict[str, str], case_id: int) -> Any:
    return client.post(f"/api/v1/cases/{case_id}/actions", headers=headers,
                       json={"action_type": "escalate", "remarks": "No response from the institution"})


def test_escalation_alerts_are_critical_for_senior_and_the_receiving_head(
    seeded_client: TestClient, auth_headers: Headers, seeded_engine
) -> None:
    assert escalate(seeded_client, auth_headers("pgrc.head@aicte.example"), 101).status_code == 200
    with Session(seeded_engine) as session:
        alerts = session.exec(select(Alert).where(Alert.type == "escalation", Alert.case_id == 101)).all()
    assert {a.recipient_id for a in alerts} == {1, 2}  # senior and the PGRC head
    assert {a.severity.value for a in alerts} == {"critical"}


def test_ro_officer_may_escalate_a_case_at_its_own_office(seeded_client: TestClient, auth_headers: Headers) -> None:
    assert escalate(seeded_client, auth_headers("ro.central@aicte.example"), 103).status_code == 200
    assert escalate(seeded_client, auth_headers("ro.central@aicte.example"), 102).status_code in (403, 404)  # not its case


def test_district_aliases_come_from_the_seed_file() -> None:
    assert load_district_aliases()["JBP"] == "JABALPUR"
    assert load_abbreviations()["JBP"] == "JABALPUR" and load_abbreviations()["ENGG"] == "ENGINEERING"
