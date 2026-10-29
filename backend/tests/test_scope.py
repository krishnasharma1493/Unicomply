"""
End-to-end persona matrix (#48, PRD §4.2, §10, §10A): what each of the five personas sees and does on the full world,
with the real engine. Unit-level scoping lives in test_scope_unit.py; this is the demo path as each persona walks it.
"""

import csv
import io
from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient

from app.core.fixtures import load_fixture
from tests.conftest import DEMO_PASSWORD

API = "/api/v1"
MAIT = "1-43655981521"
HERO_REFS = {"PGRC/2026/00412", "RB/2026/00087", "RO-NWRO/2026/00133"}
SENIOR, INTAKE, PGRC, RB, RO = (f"{x}@aicte.example" for x in ("senior", "intake", "pgrc.head", "rb.head", "ro.nw"))
REPORT_KINDS = ("bureau", "region", "institution", "status", "ageing", "disposal_rate", "reopen_rate", "overlaps", "periodic")

# What the coordination rule keeps out of a summary card, taken from the hero story itself.
PRIVATE_TEXT = (
    "withdrew from the B.Tech programme", "faculty-student ratio", "diploma-to-degree", "Sushila", "Ritika Sharma",
    "holding my original 10th and 12th certificates",
)


def login(client: TestClient, email: str) -> Dict[str, str]:
    res = client.post(f"{API}/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['data']['access_token']}"}


def cases(client: TestClient, email: str, query: str = "") -> List[Dict[str, Any]]:
    res = client.get(f"{API}/cases?limit=100&{query}", headers=login(client, email))
    assert res.status_code == 200, res.text
    return res.json()["data"]  # type: ignore[no-any-return]


def all_cases(client: TestClient, email: str) -> List[Dict[str, Any]]:
    out, page = [], 1
    while True:
        res = client.get(f"{API}/cases?limit=100&page={page}", headers=login(client, email)).json()
        out += res["data"]
        if page >= res["pagination"]["total_pages"]:
            return out
        page += 1


@pytest.fixture(name="hero")
def hero_fixture(full_client: TestClient) -> Dict[str, Any]:
    """Demo step 4 done: the intake operator registered the hero case, which joined the Maharaja Agrasen group."""
    res = full_client.post(f"{API}/cases", json=load_fixture("requests/post_cases"), headers=login(full_client, INTAKE))
    assert res.status_code == 201, res.text
    return res.json()["data"]  # type: ignore[no-any-return]


# ── Senior officer ───────────────────────────────────────────────────────


def test_senior_sees_every_hero_case_and_all_of_them(full_client: TestClient, hero: Dict[str, Any]) -> None:
    refs = {c["case_ref"] for c in cases(full_client, SENIOR, f"permanent_id={MAIT}")}
    assert HERO_REFS <= refs and hero["case"]["case_ref"] in refs
    total = len(all_cases(full_client, SENIOR))
    summary = full_client.get(f"{API}/dashboard/summary", headers=login(full_client, SENIOR)).json()["data"]
    assert summary["total"] == total > 1000  # the dashboard counts exactly what the list shows


@pytest.mark.parametrize("kind", REPORT_KINDS)
def test_senior_can_run_every_report(full_client: TestClient, kind: str) -> None:
    res = full_client.get(f"{API}/reports/{kind}", headers=login(full_client, SENIOR))
    assert res.status_code == 200 and res.json()["data"]["rows"], kind


# ── Intake operator ──────────────────────────────────────────────────────


def test_intake_sees_only_the_cases_they_created_and_the_review_queue(full_client: TestClient, hero: Dict[str, Any]) -> None:
    mine = all_cases(full_client, INTAKE)
    assert mine and all(c["created_by"] == 5 for c in mine)
    assert hero["case"]["case_ref"] in {c["case_ref"] for c in mine}
    assert full_client.get(f"{API}/cases/102", headers=login(full_client, INTAKE)).status_code == 404  # created by the RB head
    assert full_client.get(f"{API}/reviews?status=pending", headers=login(full_client, INTAKE)).status_code == 200


def test_intake_cannot_decide_overlaps_see_reports_or_act_on_cases(full_client: TestClient, hero: Dict[str, Any]) -> None:
    h = login(full_client, INTAKE)
    group = hero["overlaps"][0]["group_id"]
    for res in (
        full_client.post(f"{API}/overlaps/{group}/decision", json={"decision": "dismiss", "remark": "x"}, headers=h),
        full_client.post(f"{API}/cases/{hero['case']['id']}/actions", json={"action_type": "remark", "remarks": "x"}, headers=h),
        full_client.get(f"{API}/reports/bureau", headers=h),
    ):
        assert res.status_code in (403, 404) and res.json()["error"]["code"] in ("FORBIDDEN", "NOT_FOUND")


# ── PGRC head ────────────────────────────────────────────────────────────


def test_pgrc_head_sees_only_pgrc_cases_and_confirms_the_hero_group(full_client: TestClient, hero: Dict[str, Any]) -> None:
    pgrc = all_cases(full_client, PGRC)
    assert pgrc and all(c["current_bureau_id"] == 2 for c in pgrc)
    assert full_client.get(f"{API}/cases/102", headers=login(full_client, PGRC)).status_code == 404  # an RB case
    group = hero["overlaps"][0]["group_id"]
    res = full_client.post(f"{API}/overlaps/{group}/decision", json={"decision": "confirm", "coordinator_id": 6, "remark": "PGRC leads"}, headers=login(full_client, PGRC))
    assert res.status_code == 200 and res.json()["data"]["group"]["status"] == "confirmed"


def test_pgrc_report_covers_only_its_own_cases(full_client: TestClient) -> None:
    h = login(full_client, PGRC)
    rows = full_client.get(f"{API}/reports/bureau", headers=h).json()["data"]["rows"]
    assert [r["bureau_code"] for r in rows] == ["PGRC"]
    senior_rows = full_client.get(f"{API}/reports/bureau", headers=login(full_client, SENIOR)).json()["data"]["rows"]
    assert len(senior_rows) > 1 and rows[0]["total"] < sum(r["total"] for r in senior_rows)


# ── RB head ──────────────────────────────────────────────────────────────


def test_rb_head_sees_rb_cases_and_gets_the_overlap_alert_after_the_hero_intake(full_client: TestClient, hero: Dict[str, Any]) -> None:
    rb = all_cases(full_client, RB)
    assert rb and all(c["current_bureau_id"] == 1 for c in rb)
    h = login(full_client, RB)
    alerts = full_client.get(f"{API}/alerts?unread_only=true&limit=100", headers=h).json()["data"]
    mine = [a for a in alerts if a["type"] == "overlap" and a["group_id"] == hero["overlaps"][0]["group_id"]]
    assert mine and all(a["recipient_id"] == 3 for a in alerts)  # own alerts only


def test_rb_head_sees_pgrc_cases_only_as_summary_cards(full_client: TestClient, hero: Dict[str, Any]) -> None:
    h = login(full_client, RB)
    assert full_client.get(f"{API}/cases/101", headers=h).status_code == 404  # no full detail of a PGRC case
    group = full_client.get(f"{API}/overlaps/{hero['overlaps'][0]['group_id']}", headers=h)
    assert group.status_code == 200
    cards = {c["case_ref"]: c for c in group.json()["data"]["cases"]}
    assert cards["PGRC/2026/00412"]["in_scope"] is False and cards["RB/2026/00087"]["in_scope"] is True
    institution = full_client.get(f"{API}/institutions/{MAIT}", headers=h).json()["data"]
    pgrc_cards = [c for col in institution["cases_by_bureau"] if col["bureau_code"] == "PGRC" for c in col["cases"]]
    assert pgrc_cards and all(c["in_scope"] is False for c in pgrc_cards)


# ── North-Western RO ───────────────────────────────────────────────────────────


def test_north_western_ro_sees_its_region_cases_from_any_bureau_and_not_western_ones(full_client: TestClient) -> None:
    ro = all_cases(full_client, RO)
    assert ro and all(c["region"] == "north_western" for c in ro)
    assert {c["current_bureau_id"] for c in ro} > {9}  # PGRC and RB cases of North-Western institutions too
    assert full_client.get(f"{API}/cases/111", headers=login(full_client, RO)).status_code == 404  # RO-WRO/2026/00204


def test_north_western_ro_can_read_a_pgrc_case_in_its_region_but_not_act_on_it(full_client: TestClient) -> None:
    h = login(full_client, RO)
    assert full_client.get(f"{API}/cases/101", headers=h).status_code == 200
    res = full_client.post(f"{API}/cases/101/actions", json={"action_type": "escalate", "remarks": "x"}, headers=h)
    assert (res.status_code, res.json()["error"]["code"]) == (403, "FORBIDDEN")


def test_north_western_ro_has_no_access_to_reports(full_client: TestClient) -> None:
    assert full_client.get(f"{API}/reports/bureau", headers=login(full_client, RO)).status_code == 403


# ── Summary cards and CSV never leak ─────────────────────────────────────


@pytest.mark.parametrize("email", [SENIOR, INTAKE, PGRC, RB, RO])
def test_summary_cards_never_contain_the_description_or_the_complainant(full_client: TestClient, hero: Dict[str, Any], email: str) -> None:
    h = login(full_client, email)
    group = hero["overlaps"][0]["group_id"]
    for url in (f"{API}/overlaps/{group}", f"{API}/institutions/{MAIT}"):
        res = full_client.get(url, headers=h)
        if res.status_code != 200:
            continue  # this persona may not open it at all
        body = res.text
        assert '"description"' not in body and '"complainant_name"' not in body, f"{email} {url}"
        for secret in PRIVATE_TEXT:
            assert secret not in body, f"{email} {url}: {secret}"
    detail = full_client.get(f"{API}/cases/{hero['case']['id']}", headers=h)
    if detail.status_code == 200:
        for card in (c for g in detail.json()["data"]["overlaps"] for c in g["cases"]):
            assert "description" not in card and "complainant_name" not in card


def test_the_report_csv_is_scoped_like_the_json(full_client: TestClient) -> None:
    for email, expected_rows in ((PGRC, 1), (SENIOR, None)):
        h = login(full_client, email)
        text = full_client.get(f"{API}/reports/bureau?format=csv", headers=h).text
        rows = list(csv.reader(io.StringIO(text)))
        body = rows[1:]
        json_rows = full_client.get(f"{API}/reports/bureau", headers=h).json()["data"]["rows"]
        assert len(body) == len(json_rows)  # the same rows, header aside
        if expected_rows is not None:
            assert len(body) == expected_rows and body[0][0] == "PGRC"
