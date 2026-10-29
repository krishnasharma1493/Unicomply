"""Engine freeze (#54): the PRD §10 failure-mode rows and a hero path that never changes (full seed, real engine)."""

import json
import logging
import os
from typing import Any, Dict, List, Tuple

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlmodel import Session, col, select

from app.core.config import Settings
from app.core.fixtures import load_fixture
from app.matching import embed
from app.modules.alerts.models import Alert
from app.modules.cases.models import Case
from app.modules.engine import service as engine_service
from app.modules.institutions.models import Institution
from app.modules.overlaps.models import OverlapPair
from app.modules.reviews.models import MatchReview
from app.seed import SEED_DIR
from tests.conftest import DEMO_PASSWORD, SEED_AS_OF

MAIT = "1-43655981521"
HERO_REFS = {"PGRC/2026/00412", "RB/2026/00087", "RO-NWRO/2026/00133"}
CYCLES = 10  # PRD §10 / #54: ten consecutive resets and hero intakes must agree


def login(client: TestClient, email: str) -> Dict[str, str]:
    res = client.post("/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    return {"Authorization": f"Bearer {res.json()['data']['access_token']}"}


def hero_body() -> Dict[str, Any]:
    return load_fixture("requests/post_cases")


@pytest.fixture(name="offline", params=["tfidf", "model-unavailable", "model"])
def offline_fixture(request: pytest.FixtureRequest, test_settings: Settings, monkeypatch: pytest.MonkeyPatch) -> str:
    """
    The embedding modes as the venue would see them. `model-unavailable` is EMBEDDINGS_MODE=model with no
    model and no network: the loader raises exactly as a failed download does (PRD §10B row 1). `model` is
    the real sentence-transformers model; it needs the package and the cached model, so it is opt-in
    (UNICOMPLY_TEST_MODEL=1) and never runs in CI.
    """
    if request.param == "model" and not os.environ.get("UNICOMPLY_TEST_MODEL"):
        pytest.skip("real embedding model: set UNICOMPLY_TEST_MODEL=1 (needs sentence-transformers and the cached model)")
    mode = "tfidf" if request.param == "tfidf" else "model"
    settings = test_settings.model_copy(update={"EMBEDDINGS_MODE": mode})
    monkeypatch.setattr(engine_service, "get_settings", lambda: settings)
    if request.param == "model-unavailable":

        class NoNetwork:
            def __init__(self, *_: Any) -> None:
                raise OSError("Can't reach huggingface.co: no network")

        monkeypatch.setattr(embed, "_SentenceTransformerEmbedder", NoNetwork)
    engine_service.reset_indexes()
    return str(request.param)


def embedder_mode(engine: Engine) -> str:
    with Session(engine) as session:
        index = engine_service.current_index(session)
        assert index is not None
        return str(index.embedder.mode)


# ── Row 1: no Wi-Fi, the hero still resolves and flags the overlap ──────────


def test_offline_the_hero_still_resolves_and_flags_the_overlap(
    full_client: TestClient, full_engine: Engine, offline: str, caplog: pytest.LogCaptureFixture
) -> None:
    if offline == "model":
        pytest.skip("this row is about the model being unavailable")
    with caplog.at_level(logging.WARNING):
        res = full_client.post("/api/v1/cases", json=hero_body(), headers=login(full_client, "intake@aicte.example"))
    assert res.status_code == 201, res.text
    data = res.json()["data"]
    assert embedder_mode(full_engine) == "tfidf"  # the offline fallback, not a pretend model
    assert (data["case"]["permanent_id"], data["resolution"]["decision"]) == (MAIT, "auto")
    [group] = data["overlaps"]
    assert {c["case_ref"] for c in group["cases"]} == HERO_REFS and group["reasons"]
    if offline == "model-unavailable":
        assert "falling back to EMBEDDINGS_MODE=tfidf" in caplog.text


# ── Row 2: a name that exists in two states, typed without a state -> review ─


def same_name_pairs() -> List[Tuple[str, str, str]]:
    truth = json.loads((SEED_DIR / "ground_truth.json").read_text(encoding="utf-8"))
    registry = {i["permanent_id"]: i for i in json.loads((SEED_DIR / "institutions.json").read_text(encoding="utf-8"))["institutions"]}
    return [
        (registry[a]["name"], registry[a]["state"], registry[b]["state"])
        for hn in truth["hard_negatives"] if hn["kind"] == "same_name_other_state"
        for a, b in [hn["permanent_ids"]]
    ]


PAIRS = same_name_pairs()


def test_the_seed_has_real_same_name_pairs_to_test_with() -> None:
    assert len(PAIRS) >= 5 and all(first != other for _, first, other in PAIRS)


@pytest.mark.parametrize("name, state, other_state", PAIRS, ids=[p[0][:40] for p in PAIRS])
def test_a_name_in_two_states_without_a_state_goes_to_review_not_auto(
    full_client: TestClient, full_engine: Engine, name: str, state: str, other_state: str
) -> None:
    h = login(full_client, "intake@aicte.example")
    res = full_client.post("/api/v1/cases", json={**hero_body(), "raw_institution_text": name, "raw_state": None, "raw_district": None}, headers=h)
    assert res.status_code == 201, res.text
    data = res.json()["data"]
    assert data["resolution"]["decision"] in ("pending_review", "unresolved"), data["resolution"]["candidates"][:2]
    assert data["case"]["permanent_id"] is None and data["case"]["match_status"] != "auto" and data["overlaps"] == []
    with Session(full_engine) as session:
        if data["resolution"]["decision"] == "pending_review":
            assert session.exec(select(MatchReview).where(MatchReview.case_id == data["case"]["id"])).first() is not None


@pytest.mark.parametrize("name, state, other_state", PAIRS, ids=[p[0][:40] for p in PAIRS])
def test_the_same_name_with_its_state_still_links_to_the_right_one(
    full_client: TestClient, full_engine: Engine, name: str, state: str, other_state: str
) -> None:
    res = full_client.post("/api/v1/institutions/resolve", json={"raw_text": name, "state": state, "district": None}, headers=login(full_client, "intake@aicte.example"))
    top = res.json()["data"]["candidates"][0]
    with Session(full_engine) as session:
        institution = session.get(Institution, top["permanent_id"])
        assert institution is not None and institution.state == state


# ── The hero path never changes ─────────────────────────────────────────────


def hero_snapshot(client: TestClient, engine: Engine) -> Dict[str, Any]:
    """Everything the audience could see from one hero intake: candidates, scores, reasons, case, group, pairs, alerts."""
    h = login(client, "intake@aicte.example")
    preview = client.post("/api/v1/institutions/resolve", json=load_fixture("requests/post_institutions_resolve"), headers=h).json()["data"]
    created = client.post("/api/v1/cases", json=hero_body(), headers=h)
    assert created.status_code == 201, created.text
    data = created.json()["data"]
    with Session(engine) as session:
        refs = {c.id: c.case_ref for c in session.exec(select(Case)).all()}
        pairs = sorted(
            (refs[p.case_a_id], refs[p.case_b_id], p.level.value, p.score, tuple(p.reasons))
            for p in session.exec(select(OverlapPair)).all()
            if p.case_a_id == data["case"]["id"] or p.case_b_id == data["case"]["id"]
        )
        alerts = sorted(
            (a.type.value, a.severity.value, a.recipient_id, a.title, a.group_id, a.permanent_id)
            for a in session.exec(select(Alert).where(col(Alert.case_id) == data["case"]["id"])).all()
        )
    return {
        "preview": preview,
        "case": {k: data["case"][k] for k in ("id", "case_ref", "permanent_id", "match_status", "match_score", "status", "current_bureau_id")},
        "resolution": data["resolution"],
        "overlaps": [
            {k: g[k] for k in ("group_id", "level", "tier", "status", "banner", "reasons")} | {"cases": sorted(c["case_ref"] for c in g["cases"])}
            for g in data["overlaps"]
        ],
        "pairs": pairs,
        "alerts": alerts,
    }


@pytest.fixture(name="cycles")
def cycles_fixture(
    full_client: TestClient, full_engine: Engine, offline: str, monkeypatch: pytest.MonkeyPatch
) -> List[Dict[str, Any]]:
    """Reset the demo and run the hero intake ten times, the way a presenter does between rehearsals."""
    monkeypatch.setattr("app.seed.current_today", lambda: SEED_AS_OF)  # the reset reloads the seed dated for the demo day
    monkeypatch.setattr("app.seed.default_seed_dir", lambda: SEED_DIR)  # the test environment pins SEED_SET=tiny; the demo runs on the full seed
    senior = login(full_client, "senior@aicte.example")
    out = []
    for _ in range(CYCLES):
        assert full_client.post("/api/v1/demo/reset", headers=senior).status_code == 200
        out.append(hero_snapshot(full_client, full_engine))
    return out


def test_ten_resets_and_hero_intakes_give_identical_results(cycles: List[Dict[str, Any]], offline: str) -> None:
    assert len(cycles) == CYCLES
    for i, snap in enumerate(cycles[1:], start=2):
        assert snap == cycles[0], f"cycle {i} differs from cycle 1 ({offline})"
    # ... and the identical result is the demo's: a wrong answer ten times over would also be "identical"
    first = cycles[0]
    assert first["case"]["permanent_id"] == MAIT and first["case"]["match_status"] == "auto"
    assert first["resolution"]["decision"] == first["preview"]["decision"] == "auto"
    names = [c["permanent_id"] for c in first["preview"]["candidates"]]
    assert names[0] == MAIT and len(set(names)) == len(names)
    [group] = first["overlaps"]
    assert (group["level"], group["status"]) == ("institution", "open")
    assert group["cases"] == sorted(HERO_REFS)
    assert group["banner"] == {
        "probable": "Potential Overlapping Cases \u2013 Coordination Required",
        "possible": "Possible Overlapping Cases \u2013 Review Suggested",
    }[group["tier"]]
    # With the frozen thresholds and TF-IDF the hero's best pair (0.483) is under t_probable (0.5): the group is
    # Possible (amber), not Probable (red). With the real model it may differ; the demo script follows, not the thresholds (#54).
    if offline != "model":
        assert group["tier"] == "possible" and max(p[3] for p in first["pairs"]) < 0.5
    print(f"\nHERO ({offline}): tier={group['tier']} case_ref={first['case']['case_ref']} "
          f"candidates={[(c['permanent_id'], round(c['score'], 3)) for c in first['preview']['candidates'][:3]]} "
          f"pair_scores={[round(p[3], 3) for p in first['pairs']]} alerts={len(first['alerts'])}")
