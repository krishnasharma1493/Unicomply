"""The engine learns from reviewers and re-checks overlaps (#39), under the REAL engine on the full world."""

from datetime import datetime, timezone
from typing import Any, Dict

from fastapi.testclient import TestClient
from sqlmodel import Session, func, select

from app.core.fixtures import load_fixture
from app.modules.alerts.models import Alert
from app.modules.engine import service
from app.modules.institutions.models import InstitutionAlias
from app.modules.overlaps.models import OverlapGroup, OverlapPair
from tests.test_intake_real import HERO_REFS, MAIT, hero_body, login

AMBIGUOUS = "maharaja agrsen engg college delhi"  # MAIT or its trust sibling MAIMS: the engine must not guess


def intake(client: TestClient, text: str = AMBIGUOUS, **over: Any) -> Dict[str, Any]:
    res = client.post("/api/v1/cases", json=hero_body(raw_institution_text=text, raw_state="Delhi", raw_district=None, **over), headers=login(client, "intake@aicte.example"))
    assert res.status_code == 201, res.text
    return res.json()["data"]


def decide(client: TestClient, case_id: int, permanent_id: str) -> Dict[str, Any]:
    h = login(client, "intake@aicte.example")
    queue = client.get("/api/v1/reviews?status=pending&limit=100", headers=h).json()["data"]
    review = next(r for r in queue if r["case_id"] == case_id)
    res = client.post(f"/api/v1/reviews/{review['id']}/decide", json={"permanent_id": permanent_id}, headers=h)
    assert res.status_code == 200, res.text
    return res.json()["data"]


def test_an_ambiguous_spelling_is_queued_not_guessed(full_client: TestClient) -> None:
    data = intake(full_client)
    assert data["resolution"]["decision"] == "pending_review" and data["case"]["permanent_id"] is None
    assert MAIT in {c["permanent_id"] for c in data["resolution"]["candidates"]}


def test_after_a_reviewer_confirms_a_spelling_it_resolves_exactly_next_time(full_client: TestClient, full_engine) -> None:
    first = intake(full_client)
    result = decide(full_client, first["case"]["id"], MAIT)
    assert result["case"]["permanent_id"] == MAIT and result["case"]["match_status"] == "reviewed"
    assert result["alias"]["source"] == "review" and result["alias"]["permanent_id"] == MAIT
    with Session(full_engine) as s:
        assert s.exec(select(InstitutionAlias).where(InstitutionAlias.source == "review", InstitutionAlias.permanent_id == MAIT)).first()

    second = intake(full_client)  # the same spelling again
    assert second["resolution"]["decision"] == "auto"
    best = second["resolution"]["candidates"][0]
    assert (best["permanent_id"], best["score"]) == (MAIT, 0.99)
    assert any("previously confirmed" in r for r in best["reasons"])
    assert (second["case"]["permanent_id"], second["case"]["match_status"]) == (MAIT, "auto")


def test_the_learned_spelling_does_not_apply_to_another_state(full_client: TestClient) -> None:
    decide(full_client, intake(full_client)["case"]["id"], MAIT)
    other = full_client.post(
        "/api/v1/cases", json=hero_body(raw_institution_text=AMBIGUOUS, raw_state="Gujarat", raw_district=None),
        headers=login(full_client, "intake@aicte.example"),
    ).json()["data"]
    assert other["case"]["permanent_id"] != MAIT  # the alias is for the Delhi institution


def test_a_review_decision_creates_or_extends_an_overlap_group(full_client: TestClient, full_engine) -> None:
    case = intake(full_client)["case"]
    result = decide(full_client, case["id"], MAIT)
    [group] = result["overlaps"]
    assert group["level"] == "institution" and {c["case_ref"] for c in group["cases"]} >= HERO_REFS
    with Session(full_engine) as s:
        extended = s.get(OverlapGroup, group["group_id"])
        assert extended is not None and extended.anchor_key == MAIT
    assert full_client.get(f"/api/v1/cases/{case['id']}", headers=login(full_client, "pgrc.head@aicte.example")).json()["data"]["case"]["in_overlap"] is True


def test_deciding_not_in_registry_changes_no_overlap(full_client: TestClient) -> None:
    case = intake(full_client)["case"]
    h = login(full_client, "intake@aicte.example")
    review = next(r for r in full_client.get("/api/v1/reviews?status=pending&limit=100", headers=h).json()["data"] if r["case_id"] == case["id"])
    res = full_client.post(f"/api/v1/reviews/{review['id']}/decide", json={"none": True}, headers=h)
    assert res.status_code == 200 and res.json()["data"]["overlaps"] == [] and res.json()["data"]["alias"] is None


def count(engine, model) -> int:
    with Session(engine) as s:
        return s.exec(select(func.count()).select_from(model)).one()


def test_a_dismissed_pair_never_raises_another_alert_or_comes_back(full_client: TestClient, full_engine) -> None:
    h = login(full_client, "pgrc.head@aicte.example")
    assert full_client.post("/api/v1/overlaps/1/decision", json={"decision": "dismiss", "remark": "Different matters"}, headers=h).status_code == 200
    long_ago = datetime(2000, 1, 1, tzinfo=timezone.utc)

    def alerts_about_group_one() -> int:
        with Session(full_engine) as s:
            return s.exec(select(func.count()).select_from(Alert).where(Alert.group_id == 1)).one()

    about_before = alerts_about_group_one()
    with Session(full_engine) as s:  # the job loop's re-scan of every case
        assert service.rescan_since(s, long_ago) > 0
        s.commit()
    assert alerts_about_group_one() == about_before  # nothing about the dismissed group
    with Session(full_engine) as s:
        group = s.get(OverlapGroup, 1)
        assert group is not None and group.status.value == "dismissed"
        members = [101, 102, 103]
        pairs = s.exec(select(OverlapPair).where(OverlapPair.case_a_id.in_(members), OverlapPair.case_b_id.in_(members))).all()
        assert pairs and all(p.decision.value == "dismissed" for p in pairs)

    settled = count(full_engine, Alert), count(full_engine, OverlapPair), count(full_engine, OverlapGroup)
    with Session(full_engine) as s:  # a second pass finds nothing new, so it says nothing
        service.rescan_since(s, long_ago)
        s.commit()
    assert (count(full_engine, Alert), count(full_engine, OverlapPair), count(full_engine, OverlapGroup)) == settled


def test_a_new_case_reopens_a_dismissed_group_with_only_its_own_pairs(full_client: TestClient, full_engine) -> None:
    h = login(full_client, "pgrc.head@aicte.example")
    full_client.post("/api/v1/overlaps/1/decision", json={"decision": "dismiss", "remark": "Different matters"}, headers=h)
    new = full_client.post("/api/v1/cases", json=hero_body(), headers=login(full_client, "intake@aicte.example")).json()["data"]
    [group] = new["overlaps"]
    assert group["group_id"] == 1 and group["status"] == "open"  # reopened
    with Session(full_engine) as s:
        old = s.exec(select(OverlapPair).where(OverlapPair.case_a_id.in_([101, 102, 103]), OverlapPair.case_b_id.in_([101, 102, 103]))).all()
        assert old and all(p.decision.value == "dismissed" for p in old)  # the earlier pairs stay dismissed
        fresh = s.exec(select(OverlapPair).where(OverlapPair.case_b_id == new["case"]["id"])).all()
        assert fresh and all(p.decision.value == "none" for p in fresh)


def test_rescan_only_touches_cases_updated_since_the_last_tick(full_engine) -> None:
    with Session(full_engine) as s:
        assert service.rescan_since(s, datetime(2030, 1, 1, tzinfo=timezone.utc)) == 0
        everything = service.rescan_since(s, datetime(2000, 1, 1, tzinfo=timezone.utc))
        assert everything > 100
