"""Alerts service and bell endpoints (#13, PRD §4.6) over the seeded demo world."""

from typing import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, func, select

from app.core.enums import AlertSeverity, AlertType, Region
from app.modules.alerts import service
from app.modules.alerts.models import Alert
from app.modules.users.models import User
from tests.conftest import DEMO_PASSWORD


@pytest.fixture(name="db")
def seeded_session(seeded_engine) -> Iterator[Session]:
    with Session(seeded_engine) as session:
        yield session


def user(db: Session, email: str) -> User:
    return db.exec(select(User).where(User.email == email)).one()


def count(db: Session) -> int:
    return db.exec(select(func.count()).select_from(Alert)).one()


def login(client: TestClient, email: str) -> dict:
    token = client.post("/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD}).json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ── create_alert ─────────────────────────────────────────────────────────


def raise_sla(db: Session, who: User, case_id: int = 101):
    return service.create_alert(
        db, AlertType.sla_warning, AlertSeverity.warning, [who], title="SLA warning", body="Day 19 of 21", case_id=case_id
    )


def test_same_alert_twice_in_a_day_creates_one_row_and_the_transaction_still_commits(db: Session) -> None:
    head = user(db, "pgrc.head@aicte.example")
    before = count(db)
    assert len(raise_sla(db, head)) == 1
    assert raise_sla(db, head) == []  # duplicate: swallowed
    assert count(db) == before + 1
    db.commit()  # the outer transaction survived the duplicate
    assert count(db) == before + 1
    assert len(raise_sla(db, head, case_id=102)) == 1  # another entity is a new alert


def test_dedupe_key_is_type_recipient_entity_day(db: Session) -> None:
    head = user(db, "pgrc.head@aicte.example")
    [alert] = raise_sla(db, head)
    assert alert.dedupe_key.startswith(f"sla_warning:{head.id}:case-101:")
    assert service.dedupe_key(AlertType.overlap, 3, group_id=1).startswith("overlap:3:group-1:")
    assert service.dedupe_key(AlertType.reminder, 3, permanent_id="1-43655981521").startswith("reminder:3:inst-1-43655981521:")


def test_duplicate_recipients_get_one_alert_and_the_rest_still_get_theirs(db: Session) -> None:
    pgrc, rb = user(db, "pgrc.head@aicte.example"), user(db, "rb.head@aicte.example")
    made = service.create_alert(
        db, AlertType.overlap, AlertSeverity.critical, [pgrc, rb, pgrc], title="t", body="b", group_id=1
    )
    assert sorted(a.recipient_id for a in made) == sorted([pgrc.id, rb.id])  # type: ignore[type-var]
    # a recipient who already has it does not block the others
    again = service.create_alert(
        db, AlertType.overlap, AlertSeverity.critical, [pgrc, user(db, "senior@aicte.example")], title="t", body="b", group_id=1
    )
    assert [a.recipient_id for a in again] == [user(db, "senior@aicte.example").id]


def test_never_commits(db: Session) -> None:
    head = user(db, "pgrc.head@aicte.example")
    before = count(db)
    raise_sla(db, head)
    db.rollback()
    assert count(db) == before


def test_recipient_helpers(db: Session) -> None:
    rb_head, pgrc_head, ro = (user(db, e) for e in ("rb.head@aicte.example", "pgrc.head@aicte.example", "ro.nw@aicte.example"))
    assert [u.id for u in service.heads_of_bureaus(db, [rb_head.bureau_id, ro.bureau_id])] == sorted([ro.id, rb_head.id])  # type: ignore[type-var]
    assert service.heads_of_bureaus(db, []) == []
    assert [u.id for u in service.ro_officers_for_region(db, Region.north_western)] == [ro.id]
    assert [u.email for u in service.senior_mgmt(db)] == ["senior@aicte.example"]
    assert pgrc_head.id not in [u.id for u in service.heads_of_bureaus(db, [rb_head.bureau_id])]  # type: ignore[list-item]


# ── Endpoints ────────────────────────────────────────────────────────────


def test_list_is_own_alerts_newest_first_with_grouping_fields(seeded_client: TestClient) -> None:
    h = login(seeded_client, "rb.head@aicte.example")
    body = seeded_client.get("/api/v1/alerts", headers=h).json()
    assert body["success"] and body["pagination"]["total"] == len(body["data"]) > 0
    created = [a["created_at"] for a in body["data"]]
    assert created == sorted(created, reverse=True)
    assert all(a["recipient_id"] == 3 for a in body["data"])  # RB head's own
    first = next(a for a in body["data"] if a["case_id"] == 104)
    assert (first["case_ref"], first["institution_name"]) == ("RB/2026/00079", "Maharaja Agrasen Institute of Management Studies")


def test_unread_only_and_pagination(seeded_client: TestClient) -> None:
    h = login(seeded_client, "rb.head@aicte.example")
    everything = seeded_client.get("/api/v1/alerts", headers=h).json()["data"]
    unread = seeded_client.get("/api/v1/alerts?unread_only=true", headers=h).json()["data"]
    assert unread and all(not a["is_read"] for a in unread) and len(unread) < len(everything)
    one = seeded_client.get("/api/v1/alerts?limit=1&page=2", headers=h).json()
    assert len(one["data"]) == 1 and one["pagination"]["total_pages"] == len(everything)
    assert seeded_client.get("/api/v1/alerts?limit=500", headers=h).status_code == 400


def test_mark_read_own_only(seeded_client: TestClient) -> None:
    rb, pgrc = login(seeded_client, "rb.head@aicte.example"), login(seeded_client, "pgrc.head@aicte.example")
    unread_id = seeded_client.get("/api/v1/alerts?unread_only=true", headers=rb).json()["data"][0]["id"]
    other = seeded_client.post(f"/api/v1/alerts/{unread_id}/read", headers=pgrc)
    assert (other.status_code, other.json()["error"]["code"]) == (404, "NOT_FOUND")
    ok = seeded_client.post(f"/api/v1/alerts/{unread_id}/read", headers=rb)
    assert ok.status_code == 200 and ok.json()["data"]["is_read"] is True
    assert seeded_client.post("/api/v1/alerts/99999/read", headers=rb).status_code == 404
    assert seeded_client.post(f"/api/v1/alerts/{unread_id}/read", headers=rb).status_code == 200  # idempotent


def test_read_all_only_touches_the_callers_alerts(seeded_client: TestClient) -> None:
    rb, pgrc = login(seeded_client, "rb.head@aicte.example"), login(seeded_client, "pgrc.head@aicte.example")
    pgrc_unread = len(seeded_client.get("/api/v1/alerts?unread_only=true", headers=pgrc).json()["data"])
    rb_unread = len(seeded_client.get("/api/v1/alerts?unread_only=true", headers=rb).json()["data"])
    assert rb_unread > 0
    result = seeded_client.post("/api/v1/alerts/read-all", headers=rb).json()
    assert result == {"success": True, "data": {"updated": rb_unread}}
    assert seeded_client.get("/api/v1/alerts?unread_only=true", headers=rb).json()["data"] == []
    assert len(seeded_client.get("/api/v1/alerts?unread_only=true", headers=pgrc).json()["data"]) == pgrc_unread
    assert seeded_client.post("/api/v1/alerts/read-all", headers=rb).json()["data"]["updated"] == 0


def test_alert_endpoints_need_a_token(seeded_client: TestClient) -> None:
    assert seeded_client.get("/api/v1/alerts").status_code == 401


def test_two_different_events_about_one_group_on_one_day_are_both_delivered(db: Session) -> None:
    """A group being flagged and the same group being confirmed are separate alerts, not duplicates."""
    head = user(db, "rb.head@aicte.example")
    flagged = service.create_alert(db, AlertType.overlap, AlertSeverity.critical, [head], title="flagged", body="b", group_id=1)
    confirmed = service.create_alert(db, AlertType.overlap, AlertSeverity.critical, [head], title="confirmed", body="b", group_id=1, event="confirmed")
    again = service.create_alert(db, AlertType.overlap, AlertSeverity.critical, [head], title="confirmed", body="b", group_id=1, event="confirmed")
    assert (len(flagged), len(confirmed), len(again)) == (1, 1, 0)
    assert service.dedupe_key(AlertType.overlap, 3, group_id=1, event="confirmed").endswith("group-1-confirmed:" + service.today().isoformat())
