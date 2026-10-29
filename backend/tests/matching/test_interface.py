"""Tests for the matching interface (#5): purity, dataclass invariants, StubEngine hero results."""

import json
import os
import subprocess
import sys
from dataclasses import replace
from datetime import date
from pathlib import Path

import pytest

from app.matching import (
    BANNER_PROBABLE,
    CaseLite,
    GroupLite,
    GroupPlan,
    LevelWeights,
    PairEvidence,
    PairWeights,
    RealEngine,
    ResolutionWeights,
    Thresholds,
    get_engine,
)
from app.matching.normalize import extract_permanent_id
from app.matching.stub import HERO, HERO_SIBLING, StubEngine

BACKEND_DIR = Path(__file__).resolve().parents[2]
FIXTURES = BACKEND_DIR.parent / "contract" / "fixtures"

HERO_PID = HERO.permanent_id


def hero_case(case_id: int, ref: str, bureau_id: int, bureau: str, category: str, received: date) -> CaseLite:
    return CaseLite(
        id=case_id,
        case_ref=ref,
        permanent_id=HERO_PID,
        bureau_id=bureau_id,
        bureau_code=bureau,
        category_code=category,
        description="synthetic",
        received_at=received,
        status="under_process",
    )


# The hero story (PRD §4.7) with DEMO_TODAY = 2026-11-20, ids as in contract/fixtures.
CASE_101 = hero_case(101, "PGRC/2026/00412", 2, "PGRC", "fee_refund", date(2026, 11, 1))
CASE_102 = hero_case(102, "RB/2026/00087", 1, "RB", "faculty_shortage", date(2026, 11, 10))
CASE_103 = hero_case(103, "RO-NWRO/2026/00133", 9, "RO-NWRO", "certificate_withheld", date(2026, 11, 15))
CASE_105 = hero_case(105, "PGRC/2026/00519", 2, "PGRC", "certificate_withheld", date(2026, 11, 20))
HERO_RELATED = [CASE_101, CASE_102, CASE_103]


# ── Purity ───────────────────────────────────────────────────────────────


def test_matching_imports_no_web_or_db_framework() -> None:
    """app.matching must stay pure Python: no FastAPI, no SQLModel/SQLAlchemy (PRD §2)."""
    code = (
        "import sys, app.matching, app.matching.stub, app.matching.engine, app.matching.normalize, "
        "app.matching.embed, app.matching.index, app.matching.resolve, app.matching.overlap, "
        "app.matching.thresholds\n"
        "bad = sorted(m for m in sys.modules if m.split('.')[0] in {'fastapi', 'starlette', 'sqlmodel', 'sqlalchemy'})\n"
        "print(','.join(bad))"
    )
    result = subprocess.run(
        [sys.executable, "-c", code], cwd=BACKEND_DIR, capture_output=True, text=True, env={**os.environ}
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == ""


# ── Dataclass invariants ─────────────────────────────────────────────────


def make_thresholds(**overrides: float) -> Thresholds:
    values = dict(t_auto=0.85, t_review=0.6, t_probable=0.7, t_possible=0.5, margin=0.05)
    values.update(overrides)
    return Thresholds(
        **values,
        resolution=ResolutionWeights(fuzzy=0.45, semantic=0.25, acronym=0.15, location=0.15),
        pair=PairWeights(text=0.6, category=0.25, time=0.15, time_decay_days=60),
        level=LevelWeights(institution=1.0, parent=0.8, trust=0.6),
    )


def test_thresholds_validate_order_and_weights() -> None:
    assert make_thresholds().level.of("trust") == 0.6
    with pytest.raises(ValueError):
        make_thresholds(t_review=0.9)
    with pytest.raises(ValueError):
        make_thresholds(t_possible=0.8)
    with pytest.raises(ValueError):
        ResolutionWeights(fuzzy=0.5, semantic=0.5, acronym=0.5, location=0.0)


def test_pair_evidence_is_canonical() -> None:
    pair = PairEvidence.of(105, 101, "institution", 0.5, ("x",))
    assert (pair.case_a, pair.case_b) == (101, 105)
    with pytest.raises(ValueError):
        PairEvidence(105, 101, "institution", 0.5, ("x",))
    with pytest.raises(ValueError):
        PairEvidence(1, 2, "institution", 1.5, ("x",))


def test_case_open_status_is_derived() -> None:
    assert CASE_101.is_open
    assert not replace(CASE_101, status="disposed").is_open


def test_group_plan_requires_group_id_except_on_create() -> None:
    with pytest.raises(ValueError):
        GroupPlan("extend", "institution", HERO_PID, "probable", (101,), (), (), ())
    with pytest.raises(ValueError):
        GroupPlan("create", "institution", HERO_PID, "probable", (101,), (), (), (), group_id=1)
    assert GroupPlan("create", "institution", HERO_PID, "probable", (101,), (), (), ()).banner == BANNER_PROBABLE


def test_extract_permanent_id() -> None:
    assert extract_permanent_id("complaint about 1-43655981521 delhi") == "1-43655981521"
    assert extract_permanent_id("no id here") is None


# ── Engine selection ─────────────────────────────────────────────────────


def test_get_engine_selects_stub_or_real() -> None:
    assert isinstance(get_engine(), StubEngine)
    assert isinstance(get_engine("real"), RealEngine)
    with pytest.raises(ValueError):
        get_engine("fast")  # type: ignore[arg-type]


def test_real_engine_needs_index_and_thresholds() -> None:
    with pytest.raises(ValueError):
        RealEngine().resolve_institution("x", None, None, None, None)


# ── StubEngine: resolution ───────────────────────────────────────────────


def test_stub_resolves_hero_intake_text() -> None:
    """Acceptance: the demo text resolves `auto` to the hero, first, with ≥ 2 plain-language reasons."""
    result = StubEngine().resolve_institution("maharaja agrsen institute of technology delhi", "Delhi", None)
    assert result.decision == "auto"
    assert result.top is not None and result.top.permanent_id == HERO_PID
    assert result.permanent_id == HERO_PID
    assert len(result.top.reasons) >= 2
    assert all(isinstance(r, str) and r for r in result.top.reasons)


def test_stub_matches_resolve_fixture() -> None:
    """The stub returns exactly what contract/fixtures/post_institutions_resolve.json shows."""
    request = json.loads((FIXTURES / "requests" / "post_institutions_resolve.json").read_text())
    expected = json.loads((FIXTURES / "post_institutions_resolve.json").read_text())["data"]
    result = StubEngine().resolve_institution(request["raw_text"], request["state"], request["district"])
    assert result.decision == expected["decision"]
    assert [
        {"permanent_id": c.permanent_id, "name": c.name, "district": c.district, "state": c.state,
         "score": c.score, "reasons": list(c.reasons)}
        for c in result.candidates
    ] == expected["candidates"]


@pytest.mark.parametrize(
    "raw_text, state, district",
    [
        ("MAIT Delhi", "Delhi", None),
        ("Maharaja Agrasen Inst. of Tech.", "Delhi", "West Delhi"),
        ("Maharaja Agrasan Engineering College, Delhi", None, None),
    ],
)
def test_stub_resolves_hero_spellings(raw_text: str, state: str, district: str) -> None:
    result = StubEngine().resolve_institution(raw_text, state, district)
    assert result.decision == "auto"
    assert result.permanent_id == HERO_PID


def test_stub_resolves_trust_sibling() -> None:
    result = StubEngine().resolve_institution("Maharaja Agrasen Inst. of Management", "Delhi", None)
    assert result.permanent_id == HERO_SIBLING.permanent_id


def test_stub_location_veto_and_unknown_names() -> None:
    stub = StubEngine()
    assert stub.resolve_institution("maharaja agrsen engg college", "Maharashtra", None).decision == "unresolved"
    assert stub.resolve_institution("maharaja agrsen engg college", None, "Pune").decision == "unresolved"
    unknown = stub.resolve_institution("Some Other College of Pharmacy", "Gujarat", None)
    assert unknown.decision == "unresolved" and unknown.candidates == ()


def test_stub_permanent_id_in_text_is_exact() -> None:
    result = StubEngine().resolve_institution(f"complaint re {HERO_PID}", None, None)
    assert result.decision == "auto" and result.score == 1.0


def test_stub_respects_top_k() -> None:
    result = StubEngine().resolve_institution("maharaja agrsen institute of technology delhi", None, None, top_k=1)
    assert len(result.candidates) == 1


# ── StubEngine: overlaps ─────────────────────────────────────────────────


def test_stub_hero_intake_creates_one_probable_institution_group() -> None:
    """Acceptance: the hero intake → one probable institution-level group over the 3 hero cases."""
    stub = StubEngine()
    evidence = stub.detect_overlaps(CASE_105, HERO_RELATED)
    assert {(p.case_a, p.case_b) for p in evidence} == {(101, 105), (102, 105), (103, 105)}
    assert all(p.level == "institution" and p.reasons for p in evidence)

    plans = stub.plan_group_updates(CASE_105, evidence, [])
    assert len(plans) == 1
    plan = plans[0]
    assert (plan.action, plan.level, plan.anchor_key, plan.tier) == ("create", "institution", HERO_PID, "probable")
    assert plan.case_ids == (101, 102, 103, 105)
    assert plan.banner == BANNER_PROBABLE
    assert any("Handled by PGRC and RO-NWRO" in r for r in plan.reasons)


def test_stub_extends_existing_group_and_reopens_dismissed_one() -> None:
    stub = StubEngine()
    evidence = stub.detect_overlaps(CASE_105, HERO_RELATED)
    open_group = GroupLite(1, "institution", HERO_PID, "probable", "open", (101, 102, 103))
    [plan] = stub.plan_group_updates(CASE_105, evidence, [open_group])
    assert (plan.action, plan.group_id, plan.case_ids) == ("extend", 1, (101, 102, 103, 105))

    dismissed = GroupLite(1, "institution", HERO_PID, "possible", "dismissed", (101, 102, 103))
    [plan] = stub.plan_group_updates(CASE_105, evidence, [dismissed])
    assert plan.action == "reopen"
    assert all(105 in (p.case_a, p.case_b) for p in plan.pairs)  # only the new pairs


def test_stub_returns_no_overlaps_by_default() -> None:
    stub = StubEngine()
    assert stub.detect_overlaps(replace(CASE_105, permanent_id=None), HERO_RELATED) == []
    assert stub.plan_group_updates(CASE_105, [], []) == []
    same_bureau_other_issue = hero_case(120, "PGRC/2026/00500", 2, "PGRC", "ragging", date(2026, 11, 18))
    assert stub.detect_overlaps(CASE_105, [same_bureau_other_issue]) == []
