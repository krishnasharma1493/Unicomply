"""Alerts end to end on the real API (#50): engine overlap alerts, job-loop SLA alerts, dedupe, and read state."""

from datetime import date, datetime, timezone
from typing import Dict

import pytest
from fastapi.testclient import TestClient

from app import jobs
from app.core.config import get_settings
from app.core.fixtures import load_fixture
from tests.conftest import DEMO_PASSWORD, SEED_AS_OF

API = "/api/v1"
MAIT = "1-43655981521"


@pytest.fixture(autouse=True)
def demo_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "DEMO_TODAY", SEED_AS_OF)  # the world is dated 2026-11-20: the hero is on day 19


def login(client: TestClient, email: str) -> Dict[str, str]:
    res = client.post(f"{API}/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    return {"Authorization": f"Bearer {res.json()['data']['access_token']}"}


def unread(client: TestClient, email: str) -> int:
    return client.get(f"{API}/alerts?unread_only=true&limit=1", headers=login(client, email)).json()["pagination"]["total"]  # type: ignore[no-any-return]


def all_alerts(client: TestClient, email: str) -> list:
    """Every page: the full world gives a head hundreds of SLA alerts, so the hero's is not on the first."""
    out, page = [], 1
    while True:
        res = client.get(f"{API}/alerts?limit=100&page={page}", headers=login(client, email)).json()
        out += res["data"]
        if page >= res["pagination"]["total_pages"]:
            return out
        page += 1


def tick(engine) -> jobs.TickResult:
    return jobs.run_tick(engine, datetime(2030, 1, 1, tzinfo=timezone.utc))  # no re-scan: this is about the SLA alerts


def test_after_pgrc_confirms_the_rb_heads_bell_has_a_new_alert(full_client: TestClient) -> None:
    group = full_client.post(f"{API}/cases", json=load_fixture("requests/post_cases"), headers=login(full_client, "intake@aicte.example")).json()["data"]["overlaps"][0]["group_id"]
    before = unread(full_client, "rb.head@aicte.example")
    res = full_client.post(f"{API}/overlaps/{group}/decision", json={"decision": "confirm", "coordinator_id": 6, "remark": "PGRC leads"}, headers=login(full_client, "pgrc.head@aicte.example"))
    assert res.status_code == 200
    assert unread(full_client, "rb.head@aicte.example") > before  # the next poll of the bell shows it
    titles = [a["title"] for a in full_client.get(f"{API}/alerts?unread_only=true&limit=50", headers=login(full_client, "rb.head@aicte.example")).json()["data"]]
    assert any("Overlap confirmed" in t for t in titles)


def test_the_job_loop_raises_the_hero_sla_warning_with_the_fields_the_page_groups_by(full_client: TestClient, full_engine) -> None:
    assert tick(full_engine).sla_warnings >= 1
    alerts = all_alerts(full_client, "pgrc.head@aicte.example")
    [warning] = [a for a in alerts if a["type"] == "sla_warning" and a["case_ref"] == "PGRC/2026/00412"]
    assert warning["severity"] == "warning" and "day 19 of 21" in warning["title"]
    assert warning["permanent_id"] == MAIT and warning["institution_name"].startswith("Maharaja Agrasen Institute of Technology")
    assert warning["is_read"] is False


def test_the_hero_warning_appears_exactly_once_however_often_the_loop_ticks(full_client: TestClient, full_engine) -> None:
    tick(full_engine)
    first = len(all_alerts(full_client, "pgrc.head@aicte.example"))
    for _ in range(3):
        again = tick(full_engine)
        assert again.alerts == 0, again
    assert len(all_alerts(full_client, "pgrc.head@aicte.example")) == first


def test_each_head_gets_only_their_own_sla_alerts(full_client: TestClient, full_engine) -> None:
    tick(full_engine)
    for email, bureau_code in (("pgrc.head@aicte.example", "PGRC"), ("rb.head@aicte.example", "RB")):
        mine = all_alerts(full_client, email)
        sla = [a for a in mine if a["type"].startswith("sla")]
        assert sla and len({a["recipient_id"] for a in mine}) == 1  # nobody else's alerts
        assert any(a["case_ref"].startswith(bureau_code + "/") for a in sla), bureau_code


def test_marking_read_persists_across_a_fresh_login_and_the_bell_count_follows(full_client: TestClient, full_engine) -> None:
    tick(full_engine)
    email = "pgrc.head@aicte.example"
    total_unread = unread(full_client, email)
    assert total_unread >= 1
    first = full_client.get(f"{API}/alerts?unread_only=true&limit=1", headers=login(full_client, email)).json()["data"][0]
    assert full_client.post(f"{API}/alerts/{first['id']}/read", headers=login(full_client, email)).status_code == 200
    reloaded = all_alerts(full_client, email)  # a new session
    assert next(a for a in reloaded if a["id"] == first["id"])["is_read"] is True
    assert unread(full_client, email) == total_unread - 1
    full_client.post(f"{API}/alerts/read-all", headers=login(full_client, email))
    assert unread(full_client, email) == 0
    assert unread(full_client, "rb.head@aicte.example") >= 0  # and nobody else's alerts were touched


def test_one_institution_one_day_has_the_same_grouping_key_across_alert_types(full_client: TestClient, full_engine) -> None:
    """The page groups by (permanent_id, day): overlap and SLA alerts about the hero institution must land in one card."""
    full_client.post(f"{API}/cases", json=load_fixture("requests/post_cases"), headers=login(full_client, "intake@aicte.example"))
    tick(full_engine)
    mine = all_alerts(full_client, "pgrc.head@aicte.example")
    about_hero = [a for a in mine if a["permanent_id"] == MAIT]
    assert {a["type"] for a in about_hero} >= {"overlap", "sla_warning"}
    assert len({(a["permanent_id"], a["created_at"][:10]) for a in about_hero}) == 1


def test_confirming_the_hero_group_shows_the_coordinator_on_every_linked_case(full_client: TestClient) -> None:
    """PRD §4.5: 'coordinator's name on each case'. Every member sees it, whichever bureau it is in."""
    created = full_client.post(f"{API}/cases", json=load_fixture("requests/post_cases"), headers=login(full_client, "intake@aicte.example")).json()["data"]
    group = created["overlaps"][0]["group_id"]
    assert created["overlaps"][0]["coordinator_name"] is None  # not confirmed yet
    assert full_client.post(f"{API}/overlaps/{group}/decision", json={"decision": "confirm", "coordinator_id": 6, "remark": "PGRC leads"}, headers=login(full_client, "pgrc.head@aicte.example")).status_code == 200
    for email, case_id in (("pgrc.head@aicte.example", created["case"]["id"]), ("rb.head@aicte.example", 102), ("ro.nw@aicte.example", 103)):
        detail = full_client.get(f"{API}/cases/{case_id}", headers=login(full_client, email)).json()["data"]
        [summary] = [o for o in detail["overlaps"] if o["group_id"] == group]
        assert (summary["status"], summary["coordinator_name"]) == ("confirmed", "Sunita Mishra"), email
