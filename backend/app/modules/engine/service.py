"""
The engine service façade: the only seam between platform code and the matching engine
(PRD §4.4–4.6). Endpoints and the job loop call these functions; they build matching
dataclasses from table rows, call the engine chosen by `MATCHING_ENGINE`, and persist the
results.

Transaction rule (PRD §6): every function runs inside the caller's transaction. It may
`flush()` to get ids, but it NEVER commits — so an intake that fails halfway rolls back
the case, its review, pairs, groups and links together.

No FastAPI imports here: this module must stay usable from the job loop and tests.
"""

from __future__ import annotations

import re
from dataclasses import asdict
from datetime import datetime, time, timedelta, timezone
from threading import RLock
from weakref import WeakKeyDictionary
from typing import Dict, List, Optional, Sequence, Set, cast

from sqlalchemy.engine import Engine
from sqlmodel import Session, col, or_, select

from app.core.config import get_settings
from app.core.enums import (
    AlertSeverity,
    AlertType,
    AliasSource,
    CaseStatus,
    MatchStatus,
    OverlapGroupStatus,
    OverlapLevel,
    OverlapTier,
    PairDecision,
)
from app.matching import get_engine
from app.matching.engine import MatchingEngine
from app.matching.index import MatchIndex
from app.matching.index import build_index
from app.matching.embed import make_embedder
from app.matching.normalize import load_abbreviations, normalize_name
from app.matching.thresholds import load_thresholds
from app.matching.types import (
    AliasLite,
    BANNERS,
    Candidate as MatchCandidate,
    GroupLite,
    GroupPlan,
    GroupStatus,
    Level,
    PairEvidence,
    ResolutionResult,
    Thresholds,
    Tier,
)
from app.modules.alerts import service as alert_service
from app.modules.cases.models import Case
from app.modules.engine.builders import (
    InScope,
    case_lite,
    coordinator_name,
    everyone,
    institution_lite,
    linked_case_card,
    resolution_schema,
)
from app.modules.institutions.models import Institution, InstitutionAlias, Trust
from app.modules.meta.models import Bureau
from app.modules.institutions.schemas import Resolution
from app.modules.overlaps.models import OverlapGroup, OverlapLink, OverlapPair
from app.modules.overlaps.schemas import OverlapSummary
from app.modules.reviews.models import MatchReview
from app.utils.time import today, utcnow

# ── Engine wiring (#38 builds the real index and thresholds) ─────────────


def current_engine() -> MatchingEngine:
    """The engine selected by `Settings.MATCHING_ENGINE` (stub until #38 flips it)."""
    return get_engine(get_settings().MATCHING_ENGINE)


# One MatchIndex per database engine. Weak keys: a collected engine can never hand its slot to a
# new one (an `id()` key could). The index is mutated mid-request (upsert_case, add_alias), so
# anything that rolls a request back must call `reset_indexes()` to drop those uncommitted edits.
_INDEXES: "WeakKeyDictionary[Engine, MatchIndex]" = WeakKeyDictionary()
_INDEX_LOCK = RLock()


def reset_indexes() -> None:
    """Forget every cached index; the next request rebuilds from the database."""
    with _INDEX_LOCK:
        _INDEXES.clear()


def current_index(session: Optional[Session] = None) -> Optional[MatchIndex]:
    """Get the process cache, building a snapshot on demand for the session's database."""
    if session is None:
        return next(iter(_INDEXES.values()), None)
    key = session.get_bind().engine
    cached = _INDEXES.get(key)
    if cached is not None:
        return cached
    with _INDEX_LOCK:
        cached = _INDEXES.get(key)
        if cached is not None:
            return cached
        institutions = [institution_lite(row) for row in session.exec(select(Institution)).all()]
        aliases = [
            AliasLite(row.alias_norm, row.permanent_id, row.source.value)
            for row in session.exec(select(InstitutionAlias)).all()
        ]
        cases = [case_lite(session, row) for row in session.exec(select(Case)).all()]
        dismissed = session.exec(
            select(OverlapPair.case_a_id, OverlapPair.case_b_id).where(OverlapPair.decision == PairDecision.dismissed)
        ).all()
        trusts = {row.id: row.name for row in session.exec(select(Trust)).all() if row.id is not None}
        settings = get_settings()
        index = build_index(
            institutions, aliases, cases, dismissed,
            make_embedder(settings.EMBEDDINGS_MODE, settings.EMBEDDING_MODEL_NAME), trusts,
        )
        _INDEXES[key] = index
        return index


def current_thresholds() -> Optional[Thresholds]:
    settings = get_settings()
    return load_thresholds(overrides={
        "MATCH_T_AUTO": settings.MATCH_T_AUTO,
        "MATCH_T_REVIEW": settings.MATCH_T_REVIEW,
        "OVERLAP_T_PROBABLE": settings.OVERLAP_T_PROBABLE,
        "OVERLAP_T_POSSIBLE": settings.OVERLAP_T_POSSIBLE,
    })


# ── Resolution ───────────────────────────────────────────────────────────


def resolve_preview(
    session: Session, raw_text: str, state: Optional[str], district: Optional[str]
) -> Resolution:
    """
    Live preview for the intake form (POST /institutions/resolve): top-k candidates with
    reasons. Candidates not in the registry are dropped.

    Writes: nothing.
    """
    result = current_engine().resolve_institution(
        raw_text, state, district, current_index(session), current_thresholds(), top_k=get_settings().MATCH_TOP_K
    )
    return resolution_schema(_registered_only(session, result))


def resolve_for_intake(session: Session, case: Case) -> Resolution:
    """
    Resolve the institution of a new case (PRD §4.4). If the operator supplied a Permanent ID
    the decision is `provided`; otherwise the engine decides auto / pending_review / unresolved.
    Sets `case.permanent_id`, `match_score`, `match_status`, `updated_at`; a pending_review or
    unresolved case also gets a `match_review` row for the operator queue.
    Raises LookupError if a supplied Permanent ID is not in the registry.

    Writes: case (update), match_review (insert when pending_review / unresolved).
    Runs in the caller's transaction; flushes, never commits.
    """
    if case.id is None:
        session.add(case)
        session.flush()

    if case.permanent_id:
        institution = session.get(Institution, case.permanent_id)
        if institution is None:
            raise LookupError(f"Permanent ID {case.permanent_id} is not in the registry")
        result = ResolutionResult(
            "provided",
            (
                MatchCandidate(
                    institution.permanent_id, institution.name, institution.district, institution.state,
                    1.0, ("Permanent ID entered by the operator",),
                ),
            ),
        )
    else:
        result = current_engine().resolve_institution(
            case.raw_institution_text, case.raw_state, case.raw_district,
            current_index(session), current_thresholds(), top_k=get_settings().MATCH_TOP_K,
        )
        result = _registered_only(session, result)

    case.permanent_id = result.permanent_id
    case.match_score = result.score
    case.match_status = MatchStatus(result.decision)
    case.updated_at = utcnow()
    session.add(case)
    if idx := current_index(session):
        idx.upsert_case(case_lite(session, case))

    if result.decision in ("pending_review", "unresolved"):
        assert case.id is not None
        session.add(MatchReview(case_id=case.id, candidates=[_candidate_json(c) for c in result.candidates]))
    session.flush()
    return resolution_schema(result)


# ── Overlaps ─────────────────────────────────────────────────────────────


def apply_overlaps(session: Session, case: Case, in_scope: InScope = everyone) -> List[OverlapSummary]:
    """
    Compare a resolved case with related cases (same institution, parent university or
    sibling departments, same trust; open or disposed within OVERLAP_WINDOW_DAYS) and
    upsert the overlap groups the engine plans (PRD §4.5): create a group, extend an open or
    confirmed one, or reopen a dismissed one with only the new pairs. A pair an official
    dismissed is never re-added or updated. Overlap alerts go through `notify_overlap()`, only when a group is
    created, reopened or gains a case: re-scanning a group that has nothing new never alerts.
    Returns one OverlapSummary per touched group; `cases` excludes `case` itself and
    `in_scope` (#12's scope check) sets each card's `in_scope`.

    Writes: overlap_group (insert / update), overlap_link (insert), overlap_pair
    (insert / update), alert (via notify_overlap, from #13).
    Runs in the caller's transaction; flushes, never commits.
    """
    if case.permanent_id is None:
        return []
    if case.id is None:
        session.add(case)
        session.flush()

    engine, idx, th = current_engine(), current_index(session), current_thresholds()
    new = case_lite(session, case)
    if idx is not None:
        idx.upsert_case(new)
    related = [case_lite(session, row) for row in _related_cases(session, case)]
    evidence = [p for p in engine.detect_overlaps(new, related, idx, th) if not _is_dismissed(session, p)]
    plans = engine.plan_group_updates(new, evidence, _existing_groups(session, case), idx, th)

    summaries: List[OverlapSummary] = []
    for plan in plans:
        group = _upsert_group(session, plan)
        assert group.id is not None
        joined = _ensure_links(session, group.id, plan.case_ids)
        _upsert_pairs(session, plan.pairs)
        # Alert when something is new: a group created or reopened, or a case that joined it. A re-scan that
        # merely re-confirms a group must not alert again (the job loop runs every tick).
        if plan.action in ("create", "reopen") or joined:
            notify_overlap(session, group, case)
        summaries.append(_summary(session, group, plan, exclude_case_id=case.id, in_scope=in_scope))
    session.flush()
    return summaries


def notify_overlap(session: Session, group: OverlapGroup, case: Case) -> None:
    """
    Overlap alerts (PRD §4.6): a probable group is critical, to the heads of every involved bureau / Regional
    Office and to senior management; a possible group is a warning to the involved heads. Deduplicated per
    recipient per group per day, so a case joining a group the same day does not alert twice.

    Writes: alert. Runs in the caller's transaction; never commits.
    """
    assert group.id is not None
    members = session.exec(
        select(Case).join(OverlapLink, col(OverlapLink.case_id) == col(Case.id)).where(OverlapLink.group_id == group.id)
    ).all()
    bureau_ids = {m.current_bureau_id for m in members}
    codes = sorted({b.code for b in session.exec(select(Bureau).where(col(Bureau.id).in_(bureau_ids))).all()})
    probable = group.tier == OverlapTier.probable
    recipients = alert_service.heads_of_bureaus(session, bureau_ids)
    if probable:
        recipients += alert_service.senior_mgmt(session)
    institution = session.get(Institution, case.permanent_id) if case.permanent_id else None
    where = institution.name if institution else group.anchor_key
    others = len(members) - 1
    alert_service.create_alert(
        session,
        AlertType.overlap,
        AlertSeverity.critical if probable else AlertSeverity.warning,
        recipients,
        title="Potential overlapping cases: coordination required" if probable else "Possible overlapping cases",
        body=f"{case.case_ref} and {others} other {'case' if others == 1 else 'cases'} about {where} are being handled by {', '.join(codes)}.",
        case_id=case.id,
        group_id=group.id,
        permanent_id=case.permanent_id,
    )


def on_review_decided(
    session: Session, review: MatchReview, permanent_id: Optional[str], in_scope: InScope = everyone
) -> List[OverlapSummary]:
    """
    After an operator decides a match review (PRD §4.4 step 6). With a Permanent ID: link the
    case (`match_status = reviewed`), learn the spelling as an `institution_alias`
    (source = review) so it resolves exactly next time, and re-run overlap detection. With
    None ("not in registry"): the case stays unresolved and nothing else changes.
    Recording the decision on the review row itself is the endpoint's job (#18).
    Raises LookupError if the Permanent ID is not in the registry.

    Writes: case (update), institution_alias (insert), plus everything apply_overlaps writes.
    Runs in the caller's transaction; flushes, never commits.
    """
    case = session.get(Case, review.case_id)
    if case is None:
        raise LookupError(f"Case {review.case_id} not found")
    if permanent_id is None:
        return []
    if session.get(Institution, permanent_id) is None:
        raise LookupError(f"Permanent ID {permanent_id} is not in the registry")

    case.permanent_id = permanent_id
    case.match_status = MatchStatus.reviewed
    case.match_score = next(
        (float(c["score"]) for c in review.candidates if c.get("permanent_id") == permanent_id), None
    )
    case.updated_at = utcnow()
    session.add(case)

    alias_norm = alias_norm_of(case.raw_institution_text)
    exists = session.exec(
        select(InstitutionAlias).where(
            InstitutionAlias.permanent_id == permanent_id, InstitutionAlias.alias_norm == alias_norm
        )
    ).first()
    if exists is None and alias_norm:
        session.add(
            InstitutionAlias(
                permanent_id=permanent_id, alias_norm=alias_norm, source=AliasSource.review,
                created_by=review.decided_by,
            )
        )
    if idx := current_index(session):
        if alias_norm:
            idx.add_alias(alias_norm, permanent_id)
        idx.upsert_case(case_lite(session, case))
    session.flush()
    return apply_overlaps(session, case, in_scope)


def on_transfer(session: Session, case: Case, in_scope: InScope = everyone) -> List[OverlapSummary]:
    """
    After a transfer (PRD §4.5 "When it runs"): the bureau changed, so cross-bureau status
    and reasons change; re-run overlap detection for the case.

    Writes: everything apply_overlaps writes. Runs in the caller's transaction; never commits.
    """
    return apply_overlaps(session, case, in_scope)


def rescan_since(session: Session, since: datetime) -> int:
    """
    Job-loop re-scan (#35): re-run overlap detection for every resolved, open case updated
    at or after `since` (timezone-aware UTC). Returns how many cases were re-scanned.

    Writes: everything apply_overlaps writes. Runs in the caller's transaction; never commits.
    """
    rows = session.exec(
        select(Case).where(
            col(Case.updated_at) >= since,
            col(Case.permanent_id).is_not(None),
            Case.status != CaseStatus.disposed,
        )
    ).all()
    for row in rows:
        apply_overlaps(session, row)
    return len(rows)


# ── Helpers ──────────────────────────────────────────────────────────────


def alias_norm_of(raw_text: str) -> str:
    """Normalized spelling for an alias: the engine's normalize_name once #19 lands, else a basic clean."""
    try:
        return normalize_name(raw_text, load_abbreviations())
    except NotImplementedError:
        return " ".join(re.sub(r"[^A-Z0-9]+", " ", raw_text.upper()).split())


def _candidate_json(c: MatchCandidate) -> Dict[str, object]:
    data = asdict(c)
    data["reasons"] = list(c.reasons)
    return data


def _registered_only(session: Session, result: ResolutionResult) -> ResolutionResult:
    """Drop candidates that are not in the registry; a lost auto link becomes unresolved."""
    kept = tuple(c for c in result.candidates if session.get(Institution, c.permanent_id) is not None)
    if kept == result.candidates:
        return result
    decision = result.decision
    if decision == "auto" and (not kept or kept[0] != result.candidates[0]):
        decision = "unresolved"
    return ResolutionResult(decision, kept)


def _family(session: Session, permanent_id: str) -> Set[str]:
    """Permanent IDs at the same institution, parent university / sibling departments, or trust."""
    institution = session.get(Institution, permanent_id)
    if institution is None:
        return {permanent_id}
    university = institution.parent_id or permanent_id
    conditions = [
        col(Institution.permanent_id) == university,
        col(Institution.parent_id) == university,
    ]
    if institution.trust_id is not None:
        conditions.append(col(Institution.trust_id) == institution.trust_id)
    rows = session.exec(select(Institution.permanent_id).where(or_(*conditions))).all()
    return {permanent_id, *rows}


def _related_cases(session: Session, case: Case) -> Sequence[Case]:
    assert case.permanent_id is not None
    window_start = datetime.combine(
        today() - timedelta(days=get_settings().OVERLAP_WINDOW_DAYS), time.min, tzinfo=timezone.utc
    )
    return session.exec(
        select(Case).where(
            col(Case.permanent_id).in_(_family(session, case.permanent_id)),
            Case.id != case.id,
            or_(Case.status != CaseStatus.disposed, col(Case.disposed_at) >= window_start),
        )
    ).all()


def _anchor_keys(session: Session, permanent_id: str) -> Set[str]:
    institution = session.get(Institution, permanent_id)
    keys = {permanent_id}
    if institution is not None:
        keys.add(f"parent:{institution.parent_id or permanent_id}")
        if institution.trust_id is not None:
            keys.add(f"trust:{institution.trust_id}")
    return keys


def _existing_groups(session: Session, case: Case) -> List[GroupLite]:
    assert case.permanent_id is not None
    groups = session.exec(
        select(OverlapGroup).where(
            col(OverlapGroup.anchor_key).in_(_anchor_keys(session, case.permanent_id)),
            OverlapGroup.status != OverlapGroupStatus.resolved,
        )
    ).all()
    out: List[GroupLite] = []
    for g in groups:
        assert g.id is not None
        members = session.exec(select(OverlapLink.case_id).where(OverlapLink.group_id == g.id)).all()
        out.append(
            GroupLite(
                g.id,
                cast(Level, g.level.value),
                g.anchor_key,
                cast(Tier, g.tier.value),
                cast(GroupStatus, g.status.value),
                tuple(sorted(members)),
            )
        )
    return out


def _is_dismissed(session: Session, pair: PairEvidence) -> bool:
    row = _pair_row(session, pair)
    return row is not None and row.decision == PairDecision.dismissed


def _pair_row(session: Session, pair: PairEvidence) -> Optional[OverlapPair]:
    return session.exec(
        select(OverlapPair).where(OverlapPair.case_a_id == pair.case_a, OverlapPair.case_b_id == pair.case_b)
    ).first()


def _upsert_group(session: Session, plan: GroupPlan) -> OverlapGroup:
    if plan.action == "create":
        group = OverlapGroup(level=OverlapLevel(plan.level), anchor_key=plan.anchor_key, tier=OverlapTier(plan.tier))
    else:
        found = session.get(OverlapGroup, plan.group_id)
        assert found is not None, f"overlap group {plan.group_id} vanished"
        group = found
        group.tier = OverlapTier(plan.tier)
        if plan.action == "reopen":
            group.status = OverlapGroupStatus.open
        group.updated_at = utcnow()
    session.add(group)
    session.flush()
    return group


def _ensure_links(session: Session, group_id: int, case_ids: Sequence[int]) -> int:
    """Link the cases that are not in the group yet; returns how many joined."""
    present = set(session.exec(select(OverlapLink.case_id).where(OverlapLink.group_id == group_id)).all())
    joined = [case_id for case_id in case_ids if case_id not in present]
    for case_id in joined:
        session.add(OverlapLink(group_id=group_id, case_id=case_id))
    return len(joined)


def _upsert_pairs(session: Session, pairs: Sequence[PairEvidence]) -> None:
    for pair in pairs:
        row = _pair_row(session, pair)
        if row is None:
            session.add(
                OverlapPair(
                    case_a_id=pair.case_a, case_b_id=pair.case_b, level=OverlapLevel(pair.level),
                    score=pair.score, reasons=list(pair.reasons),
                )
            )
        elif row.decision != PairDecision.dismissed:
            row.level = OverlapLevel(pair.level)
            row.score = pair.score
            row.reasons = list(pair.reasons)
            session.add(row)


def _summary(
    session: Session, group: OverlapGroup, plan: GroupPlan, exclude_case_id: Optional[int], in_scope: InScope
) -> OverlapSummary:
    assert group.id is not None
    session.flush()
    member_ids = session.exec(
        select(OverlapLink.case_id).where(OverlapLink.group_id == group.id).order_by(col(OverlapLink.case_id))
    ).all()
    cards = [
        linked_case_card(session, row, in_scope)
        for row in (session.get(Case, i) for i in member_ids if i != exclude_case_id)
        if row is not None
    ]
    return OverlapSummary(
        group_id=group.id,
        level=group.level,
        tier=group.tier,
        status=group.status,
        banner=BANNERS[plan.tier],
        cases=cards,
        reasons=list(plan.reasons),
        coordinator_name=coordinator_name(session, group),
    )
