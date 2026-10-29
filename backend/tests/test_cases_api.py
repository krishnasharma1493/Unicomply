"""Cases API (#14): search & filters, detail, intake (PRD §5) over the seeded demo world."""

import copy
import logging
from datetime import date
from typing import Any, Callable, Dict, Iterator, List

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, func, select

from app.core.fixtures import load_fixture
from app.modules.cases import service as cases_service
from app.modules.cases.models import Case
from app.modules.engine import service as engine_service
from app.modules.reviews.models import MatchReview

Headers = Callable[[str], Dict[str, str]]
SENIOR, PGRC, RB, RO, INTAKE = (
    "senior@aicte.example",
    "pgrc.head@aicte.example",
    "rb.head@aicte.example",
    "ro.nw@aicte.example",
    "intake@aicte.example",
)
MAIT = "1-43655981521"


@pytest.fixture(autouse=True)
def demo_today(monkeypatch: pytest.MonkeyPatch) -> None:
    """The seed is dated 2026-11-20 (the contract fixtures' 'today')."""
    monkeypatch.setattr(cases_service, "today", lambda: date(2026, 11, 20))


def refs(client: TestClient, headers: Dict[str, str], query: str = "") -> List[str]:
    res = client.get(f"/api/v1/cases?limit=100&{query}", headers=headers)
    assert res.status_code == 200, res.text
    return [c["case_ref"] for c in res.json()["data"]]


# ── GET /cases ───────────────────────────────────────────────────────────


def test_default_sort_is_received_desc_and_senior_sees_all(seeded_client: TestClient, auth_headers: Headers) -> None:
    body = seeded_client.get("/api/v1/cases?limit=100", headers=auth_headers(SENIOR)).json()
    received = [c["received_at"] for c in body["data"]]
    assert body["pagination"]["total"] == 13 and received == sorted(received, reverse=True)


def test_sort_by_sla_due_puts_the_soonest_first(seeded_client: TestClient, auth_headers: Headers) -> None:
    body = seeded_client.get("/api/v1/cases?limit=100&pending=true&sort=sla_due_asc", headers=auth_headers(SENIOR)).json()
    due = [c["sla_due_on"] for c in body["data"]]
    assert due and due == sorted(due)
    assert body["pagination"]["total"] == seeded_client.get("/api/v1/cases?limit=1&pending=true", headers=auth_headers(SENIOR)).json()["pagination"]["total"]


def test_sort_keeps_scope_and_rejects_unknown_values(seeded_client: TestClient, auth_headers: Headers) -> None:
    pgrc = set(refs(seeded_client, auth_headers(PGRC), "sort=sla_due_asc"))
    assert pgrc == set(refs(seeded_client, auth_headers(PGRC)))
    assert seeded_client.get("/api/v1/cases?sort=newest", headers=auth_headers(SENIOR)).status_code == 400


@pytest.mark.parametrize(
    "query, expected",
    [
        ("q=agrasen", {"PGRC/2026/00412", "RB/2026/00087", "RO-NWRO/2026/00133", "RB/2026/00079"}),  # name, via Permanent ID
        ("q=MAIT", {"PGRC/2026/00412"}),  # raw text
        ("q=00412", {"PGRC/2026/00412"}),  # a reference's serial
        (f"permanent_id={MAIT}", {"PGRC/2026/00412", "RB/2026/00087", "RO-NWRO/2026/00133"}),
        ("case_ref=rb/2026/00087", {"RB/2026/00087"}),
        ("bureau_id=3", {"AB/2026/00056"}),
        ("category=certificate_withheld", {"RO-NWRO/2026/00133", "RB/2026/00079", "PGRC/2026/00431"}),
        ("status=escalated", {"RB/2026/00079"}),
        ("from=2026-11-12&to=2026-11-12", {"RB/2026/00091"}),
        ("beyond_sla=true", {"RB/2026/00079", "PGRC/2026/00398", "RO-WRO/2026/00121"}),
        ("in_overlap=true&region=western", {"PGRC/2026/00377", "RO-WRO/2026/00204"}),
        ("region=western", {"PGRC/2026/00377", "RO-WRO/2026/00204", "RO-WRO/2026/00121", "AB/2026/00056"}),
    ],
)
def test_each_filter_alone(seeded_client: TestClient, auth_headers: Headers, query: str, expected: set) -> None:
    got = set(refs(seeded_client, auth_headers(SENIOR), query))
    assert got == expected


def test_filters_combine_and_exclude(seeded_client: TestClient, auth_headers: Headers) -> None:
    h = auth_headers(SENIOR)
    assert refs(seeded_client, h, f"permanent_id={MAIT}&bureau_id=1") == ["RB/2026/00087"]
    assert refs(seeded_client, h, f"permanent_id={MAIT}&bureau_id=3") == []
    inside = set(refs(seeded_client, h, "in_overlap=true"))
    outside = set(refs(seeded_client, h, "in_overlap=false"))
    assert inside and outside and not inside & outside and len(inside | outside) == 13
    late = set(refs(seeded_client, h, "beyond_sla=true"))
    assert late.isdisjoint(refs(seeded_client, h, "beyond_sla=false"))
    assert refs(seeded_client, h, "q=100%25") == []  # % is literal, not a wildcard


def test_derived_fields(seeded_client: TestClient, auth_headers: Headers) -> None:
    rows = {c["case_ref"]: c for c in seeded_client.get("/api/v1/cases?limit=100", headers=auth_headers(SENIOR)).json()["data"]}
    hero = rows["PGRC/2026/00412"]
    assert (hero["age_days"], hero["beyond_sla"], hero["in_overlap"], hero["region"]) == (19, False, True, "north_western")
    assert hero["institution_name"] == "Maharaja Agrasen Institute of Technology"
    assert rows["RB/2026/00079"]["beyond_sla"] is True and rows["PGRC/2026/00431"]["institution_name"] is None


def test_pagination_is_capped_at_100(seeded_client: TestClient, auth_headers: Headers) -> None:
    h = auth_headers(SENIOR)
    page = seeded_client.get("/api/v1/cases?limit=5&page=3", headers=h).json()
    assert len(page["data"]) == 3 and page["pagination"] == {"total": 13, "page": 3, "limit": 5, "total_pages": 3}
    over = seeded_client.get("/api/v1/cases?limit=101", headers=h)
    assert over.status_code == 400 and over.json()["error"]["code"] == "VALIDATION_ERROR"


def test_list_is_scoped(seeded_client: TestClient, auth_headers: Headers) -> None:
    assert all(r.startswith("PGRC/") for r in refs(seeded_client, auth_headers(PGRC)))
    assert "PGRC/2026/00412" not in refs(seeded_client, auth_headers(RB))
    ro = refs(seeded_client, auth_headers(RO))
    assert "PGRC/2026/00412" in ro and "RO-WRO/2026/00204" not in ro
    own = refs(seeded_client, auth_headers(INTAKE))
    assert own and refs(seeded_client, auth_headers(INTAKE), "bureau_id=3") == ["AB/2026/00056"]
    assert seeded_client.get("/api/v1/cases").status_code == 401


# ── GET /cases/{id} ──────────────────────────────────────────────────────


def test_detail_matches_the_contract_fixture(seeded_client: TestClient, auth_headers: Headers) -> None:
    fx = load_fixture("get_cases_id")["data"]
    got = seeded_client.get("/api/v1/cases/101", headers=auth_headers(PGRC)).json()["data"]
    assert got["case"] == fx["case"] and got["institution"] == fx["institution"] and got["actions"] == fx["actions"]
    [group] = got["overlaps"]
    [fx_group] = fx["overlaps"]
    assert {k: group[k] for k in ("group_id", "level", "tier", "status", "banner")} == {
        k: fx_group[k] for k in ("group_id", "level", "tier", "status", "banner")
    }
    assert group["cases"] == fx_group["cases"]  # PGRC head: RB and RO cards are out of scope
    assert group["reasons"] and all(isinstance(r, str) for r in group["reasons"])


def test_detail_out_of_scope_is_404(seeded_client: TestClient, auth_headers: Headers) -> None:
    for who, case_id in ((PGRC, 102), (RB, 101), (INTAKE, 102)):
        res = seeded_client.get(f"/api/v1/cases/{case_id}", headers=auth_headers(who))
        assert (res.status_code, res.json()["error"]["code"]) == (404, "NOT_FOUND"), who
    assert seeded_client.get("/api/v1/cases/99999", headers=auth_headers(SENIOR)).status_code == 404


def test_detail_cards_hide_text(seeded_client: TestClient, auth_headers: Headers) -> None:
    group = seeded_client.get("/api/v1/cases/102", headers=auth_headers(RB)).json()["data"]["overlaps"][0]
    assert {c["case_ref"]: c["in_scope"] for c in group["cases"]} == {"PGRC/2026/00412": False, "RO-NWRO/2026/00133": False}
    assert all("description" not in c and "complainant_name" not in c for c in group["cases"])


# ── POST /cases ──────────────────────────────────────────────────────────


def hero_body(**over: Any) -> Dict[str, Any]:
    body = copy.deepcopy(load_fixture("requests/post_cases"))  # load_fixture caches: never mutate it
    body.update(over)
    return body


def post(client: TestClient, headers: Dict[str, str], body: Dict[str, Any]) -> Any:
    return client.post("/api/v1/cases", json=body, headers=headers)


def test_hero_intake(seeded_client: TestClient, auth_headers: Headers) -> None:
    res = post(seeded_client, auth_headers(INTAKE), hero_body())
    assert res.status_code == 201, res.text
    data = res.json()["data"]
    case = data["case"]
    assert (case["case_ref"], case["current_bureau_id"], case["sla_due_on"], case["status"]) == (
        "PGRC/2026/00432", 2, "2026-12-11", "received",
    )  # next PGRC number; certificates → PGRC; received + 21 days
    assert (case["permanent_id"], case["match_status"], case["created_by"], case["in_overlap"]) == (MAIT, "auto", 5, True)
    assert data["resolution"]["decision"] == "auto" and data["resolution"]["candidates"][0]["permanent_id"] == MAIT
    [overlap] = data["overlaps"]
    assert (overlap["level"], overlap["tier"], overlap["banner"]) == ("institution", "probable", load_fixture("post_cases")["data"]["overlaps"][0]["banner"])
    assert {c["case_ref"] for c in overlap["cases"]} == {"PGRC/2026/00412", "RB/2026/00087", "RO-NWRO/2026/00133"}
    # committed: the operator can read it back, and it is listed
    assert seeded_client.get(f"/api/v1/cases/{case['id']}", headers=auth_headers(INTAKE)).status_code == 200
    assert case["case_ref"] in refs(seeded_client, auth_headers(SENIOR))


def test_case_refs_increment(seeded_client: TestClient, auth_headers: Headers) -> None:
    h = auth_headers(INTAKE)
    first = post(seeded_client, h, hero_body()).json()["data"]["case"]["case_ref"]
    second = post(seeded_client, h, hero_body()).json()["data"]["case"]["case_ref"]
    assert (first, second) == ("PGRC/2026/00432", "PGRC/2026/00433")


def test_routing_override_and_supplied_permanent_id(seeded_client: TestClient, auth_headers: Headers) -> None:
    res = post(seeded_client, auth_headers(SENIOR), hero_body(route_to_bureau_id=1, permanent_id="1-43674307362"))
    data = res.json()["data"]
    assert data["case"]["case_ref"].startswith("RB/2026/") and data["case"]["match_status"] == "provided"
    assert data["resolution"]["decision"] == "provided"


def test_unresolved_intake_queues_a_review(seeded_client: TestClient, auth_headers: Headers, seeded_engine) -> None:
    res = post(seeded_client, auth_headers(INTAKE), hero_body(raw_institution_text="Some Unheard-of College of Pharmacy", raw_state="Gujarat"))
    data = res.json()["data"]
    assert data["resolution"]["decision"] == "unresolved" and data["overlaps"] == [] and data["case"]["in_overlap"] is False
    with Session(seeded_engine) as s:
        assert s.exec(select(MatchReview).where(MatchReview.case_id == data["case"]["id"])).first() is not None


@pytest.mark.parametrize(
    "over, field",
    [
        ({"permanent_id": "1-9999999999"}, "permanent_id"),
        ({"category_id": 999}, "category_id"),
        ({"route_to_bureau_id": 999}, "route_to_bureau_id"),
        ({"raw_institution_text": "ab"}, "raw_institution_text"),
        ({"description": "short"}, "description"),
    ],
)
def test_invalid_intake_is_400_and_stores_nothing(
    seeded_client: TestClient, auth_headers: Headers, seeded_engine, over: Dict[str, Any], field: str
) -> None:
    res = post(seeded_client, auth_headers(INTAKE), hero_body(**over))
    assert res.status_code == 400 and field in res.json()["error"]["fields"], res.text
    with Session(seeded_engine) as s:
        assert s.exec(select(func.count()).select_from(Case)).one() == 13


def test_ro_officer_cannot_create_cases(seeded_client: TestClient, auth_headers: Headers) -> None:
    res = post(seeded_client, auth_headers(RO), hero_body())
    assert (res.status_code, res.json()["error"]["code"]) == (403, "FORBIDDEN")


def test_failure_in_apply_overlaps_rolls_back_the_case_row_too(
    seeded_client: TestClient, auth_headers: Headers, seeded_engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(*_: Any, **__: Any) -> None:
        raise RuntimeError("engine failure")

    monkeypatch.setattr(engine_service, "apply_overlaps", boom)
    res = post(seeded_client, auth_headers(INTAKE), hero_body())
    assert res.status_code == 500
    with Session(seeded_engine) as s:
        assert s.exec(select(func.count()).select_from(Case)).one() == 13
        assert s.exec(select(func.count()).select_from(MatchReview)).one() == 2  # no review row left either


def test_logs_carry_case_ids_never_text(
    seeded_client: TestClient, auth_headers: Headers, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.DEBUG):
        post(seeded_client, auth_headers(INTAKE), hero_body())
    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert "created" in logged
    for secret in ("Sushila", "original certificates", "mark sheets", "vindya valley engg"):
        assert secret not in logged


# ── Dashboard drill-down filters: several statuses, and pending ──────────


def test_status_accepts_several_values(seeded_client: TestClient, auth_headers: Headers) -> None:
    h = auth_headers(SENIOR)
    both = set(refs(seeded_client, h, "status=under_process,interim_reply"))
    assert both == set(refs(seeded_client, h, "status=under_process")) | set(refs(seeded_client, h, "status=interim_reply"))
    assert len(both) > len(refs(seeded_client, h, "status=interim_reply"))


def test_pending_means_not_disposed(seeded_client: TestClient, auth_headers: Headers) -> None:
    h = auth_headers(SENIOR)
    pending, closed = set(refs(seeded_client, h, "pending=true")), set(refs(seeded_client, h, "pending=false"))
    assert closed == set(refs(seeded_client, h, "status=disposed"))
    assert not pending & closed and len(pending | closed) == 13


def test_unknown_status_is_a_400(seeded_client: TestClient, auth_headers: Headers) -> None:
    res = seeded_client.get("/api/v1/cases?status=under_process,nonsense", headers=auth_headers(SENIOR))
    assert res.status_code == 400 and "status" in res.json()["error"]["fields"]
