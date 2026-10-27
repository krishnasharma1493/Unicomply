"""
Case reads and intake (PRD §4.1, §4.3, §5). Reads never write. `create_case` runs inside the
caller's transaction: it flushes and never commits, so a failure in the engine façade rolls the
case row back with it.

Logs here carry case ids only, never descriptions or complainant names (PRD §6).
"""

import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, List, Optional, Sequence, Set, Tuple

from sqlalchemy import and_, func, not_, or_
from sqlmodel import Session, col, select
from sqlmodel.sql.expression import SelectOfScalar

from app.core.enums import ActionType, CaseStatus, OverlapGroupStatus, Region
from app.core.errors import AppError
from app.core.scope import in_scope_callback
from app.matching.types import BANNERS
from app.modules.audit.models import AuditLog
from app.modules.cases.models import Case, CaseAction
from app.modules.cases.schemas import (
    CaseActionEntry,
    CaseCreate,
    CaseDetail,
    CaseInstitution,
    CaseIntakeResult,
    CaseListParams,
    CaseRead,
)
from app.modules.engine import service as engine
from app.modules.engine.builders import InScope, everyone, linked_case_card
from app.modules.institutions.models import Institution, Trust
from app.modules.meta.models import Bureau, Category
from app.modules.overlaps.models import OverlapGroup, OverlapLink, OverlapPair
from app.modules.overlaps.schemas import OverlapSummary
from app.modules.users.models import User
from app.utils.time import today, utcnow

logger = logging.getLogger("unicomply.cases")

ACTIVE_GROUPS = (OverlapGroupStatus.open, OverlapGroupStatus.confirmed)


def validation_error(field: str, message: str) -> AppError:
    return AppError(400, "VALIDATION_ERROR", "Validation failed", fields={field: [message]})


# ── Derived fields ───────────────────────────────────────────────────────


def _in_overlap_ids(session: Session, case_ids: Sequence[int]) -> Set[int]:
    if not case_ids:
        return set()
    stmt = (
        select(OverlapLink.case_id)
        .join(OverlapGroup, col(OverlapGroup.id) == col(OverlapLink.group_id))
        .where(col(OverlapLink.case_id).in_(case_ids), col(OverlapGroup.status).in_(ACTIVE_GROUPS))
    )
    return set(session.exec(stmt).all())


def case_reads(session: Session, cases: Sequence[Case]) -> List[CaseRead]:
    """Cases with the derived fields (never stored): institution, region, age, beyond SLA, in overlap."""
    ids = [c.id for c in cases if c.id is not None]
    pids = {c.permanent_id for c in cases if c.permanent_id}
    institutions: Dict[str, Institution] = {}
    if pids:
        institutions = {i.permanent_id: i for i in session.exec(select(Institution).where(col(Institution.permanent_id).in_(pids)))}
    overlapping = _in_overlap_ids(session, ids)
    now = today()
    out: List[CaseRead] = []
    for c in cases:
        inst = institutions.get(c.permanent_id) if c.permanent_id else None
        end = c.disposed_at.date() if c.disposed_at else now  # the clock stops at disposal
        out.append(
            CaseRead(
                **c.model_dump(),
                institution_name=inst.name if inst else None,
                region=inst.region if inst else None,
                age_days=max(0, (end - c.received_at).days),
                beyond_sla=c.status != CaseStatus.disposed and now > c.sla_due_on,
                in_overlap=c.id in overlapping,
            )
        )
    return out


def case_read(session: Session, case: Case) -> CaseRead:
    return case_reads(session, [case])[0]


# ── List ─────────────────────────────────────────────────────────────────


def _escaped(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def filter_cases(stmt: SelectOfScalar[Case], p: CaseListParams) -> SelectOfScalar[Case]:
    """Every §5 filter; each is optional and they combine with AND. (Subqueries, so it composes with scope_cases' joins.)"""
    if p.q:
        like = f"%{_escaped(p.q)}%"
        named = select(Institution.permanent_id).where(col(Institution.name).ilike(like, escape="\\"))
        stmt = stmt.where(
            or_(col(Case.raw_institution_text).ilike(like, escape="\\"), col(Case.permanent_id).in_(named))
        )
    if p.permanent_id:
        stmt = stmt.where(Case.permanent_id == p.permanent_id)
    if p.case_ref:
        stmt = stmt.where(func.lower(Case.case_ref) == p.case_ref.lower())
    if p.bureau_id is not None:
        stmt = stmt.where(Case.current_bureau_id == p.bureau_id)
    if p.region is not None:
        stmt = stmt.where(col(Case.permanent_id).in_(select(Institution.permanent_id).where(Institution.region == p.region)))
    if p.category:
        stmt = stmt.where(col(Case.category_id).in_(select(Category.id).where(Category.code == p.category)))
    if p.status is not None:
        stmt = stmt.where(Case.status == p.status)
    if p.from_ is not None:
        stmt = stmt.where(Case.received_at >= p.from_)
    if p.to is not None:
        stmt = stmt.where(Case.received_at <= p.to)
    if p.beyond_sla is not None:
        late = and_(col(Case.status) != CaseStatus.disposed, col(Case.sla_due_on) < today())
        stmt = stmt.where(late if p.beyond_sla else not_(late))
    if p.in_overlap is not None:
        member = select(OverlapLink.case_id).join(OverlapGroup, col(OverlapGroup.id) == col(OverlapLink.group_id)).where(
            col(OverlapGroup.status).in_(ACTIVE_GROUPS)
        )
        stmt = stmt.where(col(Case.id).in_(member) if p.in_overlap else col(Case.id).not_in(member))
    return stmt


# ── Detail ───────────────────────────────────────────────────────────────


def case_institution(session: Session, case: Case) -> Optional[CaseInstitution]:
    inst = session.get(Institution, case.permanent_id) if case.permanent_id else None
    if inst is None:
        return None
    trust = session.get(Trust, inst.trust_id) if inst.trust_id else None
    return CaseInstitution(
        permanent_id=inst.permanent_id,
        name=inst.name,
        district=inst.district,
        state=inst.state,
        inst_type=inst.inst_type,
        region=inst.region,
        trust_id=inst.trust_id,
        trust_name=trust.name if trust else None,
    )


def case_actions(session: Session, case_id: int) -> List[CaseActionEntry]:
    rows = session.exec(
        select(CaseAction, User.name)
        .join(User, col(User.id) == col(CaseAction.actor_id))
        .where(CaseAction.case_id == case_id)
        .order_by(col(CaseAction.created_at), col(CaseAction.id))
    ).all()
    return [CaseActionEntry(**a.model_dump(), actor_name=name) for a, name in rows]


def overlap_summaries(session: Session, case: Case, in_scope: InScope = everyone) -> List[OverlapSummary]:
    """The open or confirmed groups `case` is in: banner, evidence reasons, and the other members as cards."""
    assert case.id is not None
    groups = session.exec(
        select(OverlapGroup)
        .join(OverlapLink, col(OverlapLink.group_id) == col(OverlapGroup.id))
        .where(OverlapLink.case_id == case.id, col(OverlapGroup.status).in_(ACTIVE_GROUPS))
        .order_by(col(OverlapGroup.tier).desc(), col(OverlapGroup.id))
    ).all()
    summaries: List[OverlapSummary] = []
    for group in groups:
        assert group.id is not None
        member_ids = list(
            session.exec(select(OverlapLink.case_id).where(OverlapLink.group_id == group.id).order_by(col(OverlapLink.case_id)))
        )
        pairs = session.exec(
            select(OverlapPair)
            .where(col(OverlapPair.case_a_id).in_(member_ids), col(OverlapPair.case_b_id).in_(member_ids))
            .order_by(col(OverlapPair.score).desc(), col(OverlapPair.id))
        ).all()
        reasons: List[str] = []
        for pair in pairs:
            reasons.extend(r for r in pair.reasons if r not in reasons)
        cards = [
            linked_case_card(session, row, in_scope)
            for row in (session.get(Case, i) for i in member_ids if i != case.id)
            if row is not None
        ]
        summaries.append(
            OverlapSummary(
                group_id=group.id,
                level=group.level,
                tier=group.tier,
                status=group.status,
                banner=BANNERS[group.tier.value],  # type: ignore[index]
                cases=cards,
                reasons=reasons,
            )
        )
    return summaries


def case_detail(session: Session, case: Case, viewer: User) -> CaseDetail:
    assert case.id is not None
    return CaseDetail(
        case=case_read(session, case),
        institution=case_institution(session, case),
        actions=case_actions(session, case.id),
        overlaps=overlap_summaries(session, case, in_scope_callback(session, viewer)),
    )


# ── Intake ───────────────────────────────────────────────────────────────


def _next_case_ref(session: Session, bureau_code: str, year: int) -> str:
    """`<BUREAU>/<YEAR>/<5-digit sequence>`, the next number for that bureau and year."""
    prefix = f"{bureau_code}/{year}/"
    refs = session.exec(select(Case.case_ref).where(col(Case.case_ref).startswith(prefix))).all()
    last = max((int(r[len(prefix):]) for r in refs if r[len(prefix):].isdigit()), default=0)
    return f"{prefix}{last + 1:05d}"


def create_case(session: Session, body: CaseCreate, user: User) -> CaseIntakeResult:
    """
    Intake in one transaction: the case row, then the institution resolution and the overlap
    detection from the engine façade (PRD §4.4–4.5).

    Writes: case, audit_log, plus match_review / overlap_* / alert via the engine façade.
    Never commits.
    """
    category = session.get(Category, body.category_id)
    if category is None:
        raise validation_error("category_id", "Unknown category")
    if body.route_to_bureau_id is not None:
        bureau = session.get(Bureau, body.route_to_bureau_id)
        if bureau is None:
            raise validation_error("route_to_bureau_id", "Unknown bureau")
    else:
        bureau = session.exec(select(Bureau).where(Bureau.code == category.default_bureau_code)).first()
        if bureau is None:
            raise validation_error("category_id", "The category's default bureau does not exist")
    assert bureau is not None and bureau.id is not None

    now = utcnow()
    case = Case(
        **body.model_dump(exclude={"route_to_bureau_id"}),
        case_ref=_next_case_ref(session, bureau.code, body.received_at.year),
        current_bureau_id=bureau.id,
        sla_due_on=body.received_at + timedelta(days=category.default_sla_days),
        created_by=user.id,  # type: ignore[arg-type]
        created_at=now,
        updated_at=now,
    )
    session.add(case)
    session.flush()
    assert case.id is not None
    session.add(AuditLog(actor_id=user.id, entity="case", entity_id=str(case.id), field="status", old_value=None, new_value=case.status.value))

    try:
        resolution = engine.resolve_for_intake(session, case)
    except LookupError:
        raise validation_error("permanent_id", "Permanent ID is not in the registry") from None
    overlaps = engine.apply_overlaps(session, case, in_scope_callback(session, user))
    session.flush()
    logger.info("case %s created (resolution=%s, overlap_groups=%d)", case.id, resolution.decision.value, len(overlaps))
    return CaseIntakeResult(case=case_read(session, case), resolution=resolution, overlaps=overlaps)
