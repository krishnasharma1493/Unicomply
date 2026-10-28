"""
Black-box regression gate for the matching rules of PRD §10 (#46). Everything goes through the public API (and the
public `detect_overlaps`), on the full generated world, with the real engine in TF-IDF mode and no network. If a change
to `app/matching` breaks one of these, it changed behaviour the PRD promises.
"""

from datetime import date
from typing import Any, Dict, Optional

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, func, select

from app.core.fixtures import load_fixture
from app.matching.embed import make_embedder
from app.matching.index import build_index
from app.matching.overlap import detect_overlaps
from app.matching.thresholds import load_thresholds
from app.matching.types import CaseLite, InstitutionLite
from app.modules.alerts.models import Alert
from tests.test_intake_real import VVIET, hero_body, login

VVIM = "1-4812730987"  # the hero institution's trust sibling
NARMADA_JABALPUR, NARMADA_GUJARAT = "1-4812744105", "1-2491105538"  # the same name in two states


def resolve(client: TestClient, text: str, state: Optional[str] = "Madhya Pradesh", district: Optional[str] = None) -> Dict[str, Any]:
    res = client.post("/api/v1/institutions/resolve", json={"raw_text": text, "state": state, "district": district}, headers=login(client, "intake@aicte.example"))
    assert res.status_code == 200, res.text
    return res.json()["data"]


# ── Resolution (§4.4) ────────────────────────────────────────────────────


def test_abbreviations_are_expanded_engg_becomes_engineering(full_client: TestClient) -> None:
    out = resolve(full_client, "Vindhya Valley Inst. of Engg. & Tech. Jabalpur")
    assert (out["decision"], out["candidates"][0]["permanent_id"]) == ("auto", VVIET)
    assert any("similar" in r for r in out["candidates"][0]["reasons"])


def test_an_acronym_hits_the_institution_vviet(full_client: TestClient) -> None:
    out = resolve(full_client, "VVIET Jabalpur")
    assert (out["decision"], out["candidates"][0]["permanent_id"]) == ("auto", VVIET)


def test_a_typo_is_tolerated_vindhya_written_vindya(full_client: TestClient) -> None:
    out = resolve(full_client, "vindya valley engg college jabalpur")
    assert (out["decision"], out["candidates"][0]["permanent_id"]) == ("auto", VVIET)
    assert out["candidates"][0]["score"] - out["candidates"][1]["score"] >= 0.05  # clear of its trust sibling


def test_the_location_veto_the_same_name_in_another_district_is_never_linked(full_client: TestClient) -> None:
    in_jabalpur = resolve(full_client, "Narmada Valley College of Engineering", "Madhya Pradesh", "Jabalpur")
    in_bharuch = resolve(full_client, "Narmada Valley College of Engineering", "Gujarat", "Bharuch")
    assert in_jabalpur["candidates"][0]["permanent_id"] == NARMADA_JABALPUR
    assert in_bharuch["candidates"][0]["permanent_id"] == NARMADA_GUJARAT
    pune = resolve(full_client, "Narmada Valley College of Engineering", "Madhya Pradesh", "Pune")
    assert NARMADA_JABALPUR not in {c["permanent_id"] for c in pune["candidates"]}  # a known, different district vetoes
    assert pune["decision"] != "auto" or pune["candidates"][0]["district"] == "Pune"


def test_the_same_name_in_two_states_without_a_state_is_not_guessed(full_client: TestClient) -> None:
    out = resolve(full_client, "Narmada Valley College of Engineering", None)
    assert out["decision"] != "auto"
    assert {NARMADA_JABALPUR, NARMADA_GUJARAT} <= {c["permanent_id"] for c in out["candidates"]}


def test_a_permanent_id_in_the_text_is_an_exact_match(full_client: TestClient) -> None:
    out = resolve(full_client, f"Please look at institution {VVIM} regarding fees", None)
    assert out["decision"] == "auto"
    top = out["candidates"][0]
    assert (top["permanent_id"], top["score"]) == (VVIM, 1.0)


def test_a_permanent_id_not_in_the_registry_is_not_matched(full_client: TestClient) -> None:
    out = resolve(full_client, "Regarding 1-9999999999", None)
    assert out["decision"] == "unresolved" and out["candidates"] == []


def test_a_spelling_a_reviewer_confirmed_resolves_exactly_next_time(full_client: TestClient) -> None:
    h = login(full_client, "intake@aicte.example")
    text = "Vindhya Valley Jabalpur"  # genuinely ambiguous between the hero and its trust sibling
    created = full_client.post("/api/v1/cases", json=hero_body(raw_institution_text=text, raw_district=None), headers=h).json()["data"]
    assert created["resolution"]["decision"] == "pending_review"
    review = next(r for r in full_client.get("/api/v1/reviews?status=pending&limit=100", headers=h).json()["data"] if r["case_id"] == created["case"]["id"])
    assert full_client.post(f"/api/v1/reviews/{review['id']}/decide", json={"permanent_id": VVIET}, headers=h).status_code == 200
    again = resolve(full_client, text)
    assert (again["decision"], again["candidates"][0]["permanent_id"], again["candidates"][0]["score"]) == ("auto", VVIET, 0.99)


def test_a_name_that_is_not_in_the_registry_is_never_linked_automatically(full_client: TestClient) -> None:
    assert resolve(full_client, "Zzyzx Quantum College of Pharmacy", "Gujarat")["decision"] != "auto"


# ── Overlaps (§4.5) ──────────────────────────────────────────────────────


def test_open_cases_of_one_institution_in_different_bureaus_are_grouped(full_client: TestClient) -> None:
    out = full_client.post("/api/v1/cases", json=hero_body(), headers=login(full_client, "intake@aicte.example")).json()["data"]
    [group] = out["overlaps"]
    assert group["level"] == "institution" and len({c["bureau_code"] for c in group["cases"]} | {"PGRC"}) == 3


def test_the_overlap_tier_follows_t_probable(full_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.modules.engine import service

    h = login(full_client, "intake@aicte.example")
    monkeypatch.setattr(service, "current_thresholds", lambda: load_thresholds(overrides={"OVERLAP_T_POSSIBLE": 0.30, "OVERLAP_T_PROBABLE": 0.90}))
    [strict] = full_client.post("/api/v1/cases", json=hero_body(), headers=h).json()["data"]["overlaps"]
    monkeypatch.setattr(service, "current_thresholds", lambda: load_thresholds(overrides={"OVERLAP_T_POSSIBLE": 0.30, "OVERLAP_T_PROBABLE": 0.40}))
    [lenient] = full_client.post("/api/v1/cases", json=hero_body(subject="A second certificate complaint"), headers=h).json()["data"]["overlaps"]
    assert (strict["tier"], strict["banner"]) == ("possible", "Possible Overlapping Cases – Review Suggested")  # best pair < T_probable
    assert (lenient["tier"], lenient["banner"]) == ("probable", "Potential Overlapping Cases – Coordination Required")


def test_a_dismissed_pair_never_re_alerts(full_client: TestClient, full_engine) -> None:
    head = login(full_client, "pgrc.head@aicte.example")
    assert full_client.post("/api/v1/overlaps/1/decision", json={"decision": "dismiss", "remark": "Different matters"}, headers=head).status_code == 200

    def alerts_for_group_one() -> int:
        with Session(full_engine) as s:
            return s.exec(select(func.count()).select_from(Alert).where(Alert.group_id == 1)).one()

    before = alerts_for_group_one()
    from datetime import datetime, timezone

    from app.modules.engine import service

    with Session(full_engine) as s:
        service.rescan_since(s, datetime(2000, 1, 1, tzinfo=timezone.utc))
        s.commit()
    assert alerts_for_group_one() == before


def lite(id: int, pid: str, bureau: int, code: str, text: str) -> CaseLite:
    return CaseLite(id, f"{code}/{id}", pid, bureau, code, "certificate_withheld", text, date(2026, 1, 2), "under_process")


def trust_world():
    institutions = [
        InstitutionLite("1-0000000001", "One Institute", "ONE INSTITUTE", "OI", "City", "State", "central", 1),
        InstitutionLite("1-0000000002", "Two Institute", "TWO INSTITUTE", "TI", "City", "State", "central", 1),
    ]
    a, b = lite(1, "1-0000000001", 2, "PGRC", "refund held certificate"), lite(2, "1-0000000002", 1, "RB", "refund held certificate")
    return institutions, a, b


def test_a_trust_level_pair_only_counts_above_t_probable() -> None:
    """Trust weight 0.6: identical complaints score 0.59 here, so the pair appears only once T_probable is at or below that."""
    from dataclasses import replace

    institutions, a, b = trust_world()
    idx = build_index(institutions, [], [a, b], [], make_embedder("tfidf", "unused"), {1: "Group One"})
    shipped = load_thresholds()
    above = detect_overlaps(b, [a], idx, replace(shipped, t_probable=0.68))
    below = detect_overlaps(b, [a], idx, replace(shipped, t_probable=0.50))
    assert above == [] and [p.level for p in below] == ["trust"]


def test_the_pair_score_is_weighted_by_level() -> None:
    from app.matching.overlap import pair_score

    institutions, a, b = trust_world()
    same_inst = lite(3, "1-0000000001", 1, "RB", "refund held certificate")
    idx = build_index(institutions, [], [a, b, same_inst], [], make_embedder("tfidf", "unused"), {1: "Group One"})
    th = load_thresholds()
    assert pair_score(same_inst, a, "institution", idx, th) > pair_score(b, a, "trust", idx, th)
    assert pair_score(b, a, "trust", idx, th) == pytest.approx(th.level.trust / th.level.institution * pair_score(b, a, "institution", idx, th))
