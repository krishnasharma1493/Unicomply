"""Intake under the REAL matching engine on the full generated world (#38)."""

import statistics
import time
from typing import Any, Dict

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, func, select

from app.core.fixtures import load_fixture
from app.modules.alerts import service as alert_service
from app.modules.alerts.models import Alert
from app.modules.cases.models import Case
from app.modules.overlaps.models import OverlapGroup, OverlapLink, OverlapPair
from app.modules.reviews.models import MatchReview
from tests.conftest import DEMO_PASSWORD

VVIET = "1-4812730561"
HERO_REFS = {"PGRC/2026/00412", "RB/2026/00087", "RO-CRO/2026/00133"}


@pytest.fixture(name="probable_thresholds")
def probable_thresholds_fixture(monkeypatch: pytest.MonkeyPatch) -> None:
    """Thresholds at which the hero's best pair (about 0.47 under TF-IDF) is a Probable overlap."""
    from app.matching.thresholds import load_thresholds
    from app.modules.engine import service

    monkeypatch.setattr(service, "current_thresholds", lambda: load_thresholds(overrides={"OVERLAP_T_POSSIBLE": 0.30, "OVERLAP_T_PROBABLE": 0.40}))


def login(client: TestClient, email: str) -> Dict[str, str]:
    token = client.post("/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD}).json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def hero_body(**over: Any) -> Dict[str, Any]:
    return {**load_fixture("requests/post_cases"), **over}


def counts(engine) -> Dict[str, int]:
    with Session(engine) as s:
        return {m.__name__: s.exec(select(func.count()).select_from(m)).one() for m in (Case, OverlapPair, OverlapGroup, OverlapLink, Alert, MatchReview)}


def test_hero_intake_resolves_and_links_the_three_cases_with_reasons(full_client: TestClient) -> None:
    res = full_client.post("/api/v1/cases", json=hero_body(), headers=login(full_client, "intake@aicte.example"))
    assert res.status_code == 201, res.text
    data = res.json()["data"]
    assert (data["case"]["permanent_id"], data["case"]["match_status"], data["resolution"]["decision"]) == (VVIET, "auto", "auto")
    top = data["resolution"]["candidates"][0]
    assert top["permanent_id"] == VVIET and top["reasons"]
    [group] = data["overlaps"]
    assert (group["level"], group["status"]) == ("institution", "open")
    assert {c["case_ref"] for c in group["cases"]} == HERO_REFS
    assert group["reasons"] and any("Same institution" in r for r in group["reasons"])


def test_hero_group_is_probable_with_the_ps_banner_when_the_pair_clears_the_bar(full_client: TestClient, probable_thresholds: None) -> None:
    [group] = full_client.post("/api/v1/cases", json=hero_body(), headers=login(full_client, "intake@aicte.example")).json()["data"]["overlaps"]
    assert (group["level"], group["tier"]) == ("institution", "probable")
    assert group["banner"] == "Potential Overlapping Cases \u2013 Coordination Required"


@pytest.mark.xfail(strict=True, reason="With TF-IDF the hero's best pair scores ~0.47, under T_probable 0.68: #44 (thresholds) / #45 (offline parity) / #54 (hero determinism)")
def test_hero_group_is_probable_at_the_shipped_thresholds(full_client: TestClient) -> None:
    [group] = full_client.post("/api/v1/cases", json=hero_body(), headers=login(full_client, "intake@aicte.example")).json()["data"]["overlaps"]
    assert group["tier"] == "probable"


def test_the_live_preview_ranks_the_right_institution_first(full_client: TestClient) -> None:
    res = full_client.post("/api/v1/institutions/resolve", json=load_fixture("requests/post_institutions_resolve"), headers=login(full_client, "intake@aicte.example"))
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["decision"] == "auto" and data["candidates"][0]["permanent_id"] == VVIET
    scores = [c["score"] for c in data["candidates"]]
    assert scores == sorted(scores, reverse=True) and scores[0] - scores[1] >= 0.05


def new_overlap_alerts(engine, since_id: int):
    with Session(engine) as s:
        return s.exec(select(Alert).where(Alert.type == "overlap", Alert.id > since_id)).all()


def last_alert_id(engine) -> int:
    with Session(engine) as s:
        return s.exec(select(func.max(Alert.id))).one() or 0


def test_probable_overlap_alerts_the_involved_heads_and_senior_management_as_critical(
    full_client: TestClient, full_engine, probable_thresholds: None
) -> None:
    since = last_alert_id(full_engine)
    full_client.post("/api/v1/cases", json=hero_body(), headers=login(full_client, "intake@aicte.example"))
    new = new_overlap_alerts(full_engine, since)
    assert {a.recipient_id for a in new} == {1, 2, 3, 4}  # senior, PGRC head, RB head, central RO officer
    assert {a.severity.value for a in new} == {"critical"}
    assert all(a.group_id == 1 and a.permanent_id == VVIET for a in new)
    assert all(a.title.startswith("Potential overlapping cases") for a in new)


def test_possible_overlap_alerts_only_the_involved_heads_as_a_warning(full_client: TestClient, full_engine) -> None:
    since = last_alert_id(full_engine)
    full_client.post("/api/v1/cases", json=hero_body(), headers=login(full_client, "intake@aicte.example"))
    new = new_overlap_alerts(full_engine, since)
    assert {a.recipient_id for a in new} == {2, 3, 4}  # no senior management for a Possible group
    assert {a.severity.value for a in new} == {"warning"}


def test_a_second_case_joining_the_group_the_same_day_does_not_alert_again(full_client: TestClient, full_engine, probable_thresholds: None) -> None:
    h = login(full_client, "intake@aicte.example")
    full_client.post("/api/v1/cases", json=hero_body(), headers=h)
    after_first = counts(full_engine)["Alert"]
    second = full_client.post("/api/v1/cases", json=hero_body(subject="Another certificate complaint"), headers=h)
    assert second.status_code == 201
    assert counts(full_engine)["Alert"] == after_first  # same recipients, same group, same day


def test_a_failure_after_the_overlap_is_written_leaves_nothing_behind(
    full_client: TestClient, full_engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    before = counts(full_engine)

    def boom(*_: Any, **__: Any) -> None:
        raise RuntimeError("alert service down")

    monkeypatch.setattr(alert_service, "create_alert", boom)  # raised after the pair, group and link were written
    res = full_client.post("/api/v1/cases", json=hero_body(), headers=login(full_client, "intake@aicte.example"))
    assert res.status_code == 500
    assert counts(full_engine) == before  # no case, pair, group, link, alert or review row


def test_an_unknown_institution_is_queued_for_review_not_linked(full_client: TestClient) -> None:
    res = full_client.post(
        "/api/v1/cases", json=hero_body(raw_institution_text="Zzyzx Quantum College of Pharmacy", raw_state="Gujarat"),
        headers=login(full_client, "intake@aicte.example"),
    )
    data = res.json()["data"]
    assert data["resolution"]["decision"] == "unresolved" and data["overlaps"] == [] and data["case"]["permanent_id"] is None


def test_median_intake_is_under_two_seconds_on_the_full_seed(full_client: TestClient, capsys: pytest.CaptureFixture[str]) -> None:
    h = login(full_client, "intake@aicte.example")
    full_client.post("/api/v1/institutions/resolve", json={"raw_text": "warm up", "state": None, "district": None}, headers=h)
    times = []
    for i in range(7):
        started = time.perf_counter()
        res = full_client.post("/api/v1/cases", json=hero_body(subject=f"Certificate complaint {i}"), headers=h)
        times.append(time.perf_counter() - started)
        assert res.status_code == 201
    median = statistics.median(times)
    with capsys.disabled():
        print(f"\nPOST /cases on the full seed (tfidf): median {median * 1000:.0f} ms, max {max(times) * 1000:.0f} ms over {len(times)} intakes")
    assert median < 2.0
