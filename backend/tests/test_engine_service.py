"""The engine service façade (#8): the platform ↔ engine seam, over the StubEngine."""

import inspect
import os
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator, List

import pytest
from sqlalchemy import event
from sqlmodel import Session, col, delete, func, select

from app.core.enums import (
    ComplainantType,
    MatchStatus,
    OverlapGroupStatus,
    OverlapLevel,
    OverlapTier,
    PairDecision,
    SourceChannel,
)
from app.matching.types import BANNER_PROBABLE
from app.modules.cases.models import Case
from app.modules.engine import service
from app.modules.institutions.models import InstitutionAlias
from app.modules.overlaps.models import OverlapGroup, OverlapLink, OverlapPair
from app.modules.reviews.models import MatchReview

BACKEND_DIR = Path(__file__).resolve().parents[1]
HERO = "1-4812730561"
NARMADA = "1-4812744105"
PUBLIC = ["resolve_preview", "resolve_for_intake", "apply_overlaps", "on_review_decided", "on_transfer", "rescan_since"]


@pytest.fixture(name="session")
def seeded_session(seeded_engine) -> Iterator[Session]:
    with Session(seeded_engine) as session:
        yield session


@pytest.fixture(name="commits")
def count_commits(session: Session) -> List[int]:
    """Records every commit on the session: the façade must never commit."""
    seen: List[int] = []
    event.listen(session, "after_commit", lambda _: seen.append(1))
    return seen


def new_case(raw_text: str, permanent_id=None, state="Madhya Pradesh", category_id=2, bureau_id=2) -> Case:
    """An intake row as #14 will build it (PRD demo step 4 by default: certificates, routed to PGRC)."""
    return Case(
        case_ref="PGRC/2026/00519",
        source_channel=SourceChannel.email,
        received_at=date(2026, 11, 20),
        complainant_type=ComplainantType.parent,
        complainant_name="Sushila Dubey",
        raw_institution_text=raw_text,
        raw_state=state,
        permanent_id=permanent_id,
        category_id=category_id,
        subject="10th/12th original certificates not returned",
        description="The college is not returning original mark sheets and demands fees for all years.",
        current_bureau_id=bureau_id,
        sla_due_on=date(2026, 12, 11),
        created_by=5,
    )


def links_of(session: Session, group_id: int) -> List[int]:
    return sorted(session.exec(select(OverlapLink.case_id).where(OverlapLink.group_id == group_id)).all())


# ── Acceptance criteria (#8) ─────────────────────────────────────────────


def test_hero_intake_extends_the_probable_group_without_committing(session: Session, commits: List[int]) -> None:
    """resolve_for_intake + apply_overlaps on the hero intake → one institution/probable group with 4 links."""
    case = new_case("vindya valley engg college jabalpur")
    session.add(case)
    session.flush()

    resolution = service.resolve_for_intake(session, case)
    assert resolution.decision.value == "auto"
    assert resolution.candidates[0].permanent_id == HERO
    assert (case.permanent_id, case.match_status, case.match_score) == (HERO, MatchStatus.auto, 0.93)

    summaries = service.apply_overlaps(session, case)
    assert len(summaries) == 1
    summary = summaries[0]
    assert (summary.group_id, summary.level, summary.tier) == (1, OverlapLevel.institution, OverlapTier.probable)
    assert summary.banner == BANNER_PROBABLE
    assert [c.case_ref for c in summary.cases] == ["PGRC/2026/00412", "RB/2026/00087", "RO-CRO/2026/00133"]
    assert all(not hasattr(c, "description") and not hasattr(c, "complainant_name") for c in summary.cases)

    groups = session.exec(
        select(OverlapGroup).where(OverlapGroup.anchor_key == HERO, OverlapGroup.level == OverlapLevel.institution)
    ).all()
    assert len(groups) == 1 and groups[0].tier == OverlapTier.probable
    assert links_of(session, 1) == [101, 102, 103, case.id]
    assert commits == []

    session.rollback()  # the caller decides: nothing was committed, so nothing remains
    assert session.exec(select(func.count()).select_from(Case)).one() == 13
    assert links_of(session, 1) == [101, 102, 103]


def test_hero_intake_creates_the_group_when_none_exists(session: Session) -> None:
    for model in (OverlapLink, OverlapPair, OverlapGroup):
        session.exec(delete(model))  # type: ignore[call-overload]
    case = new_case("VVIET Jabalpur")
    service.resolve_for_intake(session, case)
    [summary] = service.apply_overlaps(session, case)
    group = session.get(OverlapGroup, summary.group_id)
    assert group is not None
    assert (group.level, group.tier, group.status) == (OverlapLevel.institution, OverlapTier.probable, OverlapGroupStatus.open)
    assert links_of(session, summary.group_id) == [101, 102, 103, case.id]
    pairs = session.exec(select(OverlapPair)).all()
    assert {(p.case_a_id, p.case_b_id) for p in pairs} == {(101, case.id), (102, case.id), (103, case.id)}


def test_facade_imports_no_fastapi() -> None:
    code = (
        "import sys, app.modules.engine.service, app.modules.engine.builders\n"
        "print(','.join(sorted(m for m in sys.modules if m.split('.')[0] in {'fastapi', 'starlette'})))"
    )
    result = subprocess.run([sys.executable, "-c", code], cwd=BACKEND_DIR, capture_output=True, text=True, env={**os.environ})
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == ""


@pytest.mark.parametrize("name", PUBLIC)
def test_docstrings_state_writes_and_transaction_rule(name: str) -> None:
    doc = inspect.getdoc(getattr(service, name)) or ""
    assert "Writes:" in doc, name
    assert name == "resolve_preview" or "never commits" in doc, name


# ── Resolution paths ─────────────────────────────────────────────────────


def test_resolve_preview_writes_nothing(session: Session) -> None:
    before = session.exec(select(func.count()).select_from(MatchReview)).one()
    preview = service.resolve_preview(session, "vindya valley engg college jabalpur", "Madhya Pradesh", None)
    assert [c.permanent_id for c in preview.candidates] == [HERO, "1-4812730987", NARMADA]
    assert len(session.new) == 0 and len(session.dirty) == 0
    assert session.exec(select(func.count()).select_from(MatchReview)).one() == before


def test_unknown_institution_is_queued_for_review(session: Session) -> None:
    case = new_case("Some Unheard-of College of Pharmacy", state="Gujarat")
    resolution = service.resolve_for_intake(session, case)
    assert resolution.decision.value == "unresolved" and resolution.candidates == []
    assert (case.permanent_id, case.match_status) == (None, MatchStatus.unresolved)
    review = session.exec(select(MatchReview).where(MatchReview.case_id == case.id)).one()
    assert review.candidates == []
    assert service.apply_overlaps(session, case) == []


def test_operator_supplied_permanent_id_is_provided(session: Session) -> None:
    case = new_case("Narmada Valley College of Engineering", permanent_id=NARMADA)
    resolution = service.resolve_for_intake(session, case)
    assert resolution.decision.value == "provided"
    assert (case.permanent_id, case.match_status, case.match_score) == (NARMADA, MatchStatus.provided, 1.0)
    assert session.exec(select(MatchReview).where(MatchReview.case_id == case.id)).first() is None


def test_unknown_supplied_permanent_id_raises(session: Session) -> None:
    with pytest.raises(LookupError):
        service.resolve_for_intake(session, new_case("anything", permanent_id="1-9999999999"))


# ── Overlap invariants ───────────────────────────────────────────────────


def test_dismissed_pair_is_never_re_added_or_updated(session: Session) -> None:
    case = new_case("vindya valley engg college jabalpur")
    session.add(case)
    session.flush()
    assert case.id is not None
    session.add(OverlapPair(case_a_id=103, case_b_id=case.id, level=OverlapLevel.institution, score=0.1,
                            reasons=["dismissed earlier"], decision=PairDecision.dismissed))
    service.resolve_for_intake(session, case)
    [summary] = service.apply_overlaps(session, case)
    kept = session.exec(select(OverlapPair).where(OverlapPair.case_a_id == 103, OverlapPair.case_b_id == case.id)).one()
    assert (kept.decision, kept.score, kept.reasons) == (PairDecision.dismissed, 0.1, ["dismissed earlier"])
    assert links_of(session, summary.group_id) == [101, 102, 103, case.id]


def test_new_case_reopens_a_dismissed_group(session: Session) -> None:
    group = session.get(OverlapGroup, 1)
    assert group is not None
    group.status = OverlapGroupStatus.dismissed
    session.add(group)
    case = new_case("VVIET Jabalpur")
    service.resolve_for_intake(session, case)
    [summary] = service.apply_overlaps(session, case)
    assert summary.group_id == 1 and summary.status == OverlapGroupStatus.open


def test_in_scope_callback_sets_card_scope(session: Session) -> None:
    case = new_case("VVIET Jabalpur")
    service.resolve_for_intake(session, case)
    [summary] = service.apply_overlaps(session, case, in_scope=lambda c: c.current_bureau_id == 2)
    assert {c.case_ref: c.in_scope for c in summary.cases} == {
        "PGRC/2026/00412": True, "RB/2026/00087": False, "RO-CRO/2026/00133": False,
    }


# ── Reviews, transfers, re-scan ──────────────────────────────────────────


def test_review_decision_learns_the_alias_and_finds_overlaps(session: Session) -> None:
    """Matches contract/fixtures/post_reviews_id_decide.json: case 113 → Narmada, new group with RB/2026/00091."""
    review = session.get(MatchReview, 2)
    assert review is not None
    review.decided_by = 5
    summaries = service.on_review_decided(session, review, NARMADA)

    case = session.get(Case, 113)
    assert case is not None
    assert (case.permanent_id, case.match_status, case.match_score) == (NARMADA, MatchStatus.reviewed, 0.76)
    alias = session.exec(select(InstitutionAlias).where(InstitutionAlias.permanent_id == NARMADA,
                                                        InstitutionAlias.source == "review")).one()
    assert (alias.alias_norm, alias.created_by) == ("NARMADA COLLEGE ENGINEERING", 5)

    [summary] = summaries
    assert (summary.level, summary.tier) == (OverlapLevel.institution, OverlapTier.possible)
    assert [c.case_ref for c in summary.cases] == ["RB/2026/00091"]


def test_review_not_in_registry_changes_nothing(session: Session) -> None:
    review = session.get(MatchReview, 1)
    assert review is not None
    assert service.on_review_decided(session, review, None) == []
    case = session.get(Case, 112)
    assert case is not None and case.permanent_id is None


def test_transfer_re_runs_overlaps(session: Session) -> None:
    case = session.get(Case, 103)
    assert case is not None
    case.current_bureau_id = 2  # RO-CRO → PGRC
    [summary] = service.on_transfer(session, case)
    assert summary.group_id == 1
    assert any("Handled by PGRC and RB" in r for r in summary.reasons)


def test_rescan_since_only_touches_recent_resolved_open_cases(session: Session) -> None:
    since = datetime(2026, 11, 19, tzinfo=timezone.utc)
    assert service.rescan_since(session, since) == 0
    hero = session.get(Case, 101)
    assert hero is not None
    hero.updated_at = datetime(2026, 11, 20, 8, 0, tzinfo=timezone.utc)
    session.add(hero)
    session.flush()
    assert service.rescan_since(session, since) == 1
    assert service.rescan_since(session, since + timedelta(days=2)) == 0
    assert session.exec(select(func.count()).select_from(OverlapGroup).where(col(OverlapGroup.anchor_key) == HERO)).one() == 1
