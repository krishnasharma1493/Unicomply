"""Registry search and Institution 360 read models."""

from typing import Dict, List, Optional

from sqlalchemy import func, or_
from sqlmodel import Session, col, select

from app.core.enums import CaseStatus, OverlapGroupStatus
from app.core.errors import NotFoundError
from app.core.scope import in_scope_callback
from app.modules.cases.models import Case
from app.modules.cases.service import case_read
from app.modules.engine.builders import linked_case_card
from app.modules.institutions.models import Institution, InstitutionAlias, Trust
from app.modules.institutions.schemas import (
    BureauCaseColumn, CaseCounts, Institution360, InstitutionListItem, InstitutionListParams,
    InstitutionLite, TrustRead,
)
from app.modules.meta.models import Bureau
from app.modules.overlaps.models import OverlapGroup, OverlapLink, OverlapPair
from app.modules.overlaps.schemas import LinkedCaseCard, OverlapSummary
from app.modules.users.models import User
from app.utils.time import today
from app.matching.types import BANNERS


def search(session: Session, params: InstitutionListParams) -> tuple[List[InstitutionListItem], int]:
    stmt = select(Institution).where(col(Institution.is_active).is_(True))
    if params.q:
        value = params.q.strip()
        escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        like = f"%{escaped}%"
        norm = " ".join(value.upper().split())
        alias_ids = select(InstitutionAlias.permanent_id).where(
            col(InstitutionAlias.alias_norm).ilike(f"%{norm}%")
        )
        stmt = stmt.where(or_(
            col(Institution.name).ilike(like, escape="\\"),
            col(Institution.name_norm).ilike(like, escape="\\"),
            col(Institution.acronym).ilike(like, escape="\\"),
            col(Institution.permanent_id).ilike(like, escape="\\"),
            col(Institution.permanent_id).in_(alias_ids),
        ))
    if params.state:
        stmt = stmt.where(func.lower(col(Institution.state)) == params.state.strip().lower())
    if params.region:
        stmt = stmt.where(Institution.region == params.region)
    if params.inst_type:
        stmt = stmt.where(Institution.inst_type == params.inst_type)
    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    rows = session.exec(stmt.order_by(col(Institution.name), col(Institution.permanent_id))
                        .offset((params.page - 1) * params.limit).limit(params.limit)).all()
    results = []
    for row in rows:
        trust = session.get(Trust, row.trust_id) if row.trust_id is not None else None
        open_count = session.exec(select(func.count()).select_from(Case).where(
            Case.permanent_id == row.permanent_id, Case.status != CaseStatus.disposed
        )).one()
        results.append(InstitutionListItem(**row.model_dump(), trust_name=trust.name if trust else None,
                                           open_case_count=open_count))
    return results, total


def get_360(session: Session, permanent_id: str, viewer: User) -> Institution360:
    inst = session.get(Institution, permanent_id)
    if inst is None:
        raise NotFoundError("Institution not found")
    listed, _ = search(session, InstitutionListParams(q=permanent_id, limit=1))
    item = next((row for row in listed if row.permanent_id == permanent_id), None)
    if item is None:
        raise NotFoundError("Institution not found")

    trust = session.get(Trust, inst.trust_id) if inst.trust_id is not None else None
    parent = session.get(Institution, inst.parent_id) if inst.parent_id else None
    departments = session.exec(select(Institution).where(Institution.parent_id == permanent_id)
                               .order_by(col(Institution.name))).all()
    trust_rows = session.exec(select(Institution).where(
        Institution.trust_id == inst.trust_id, Institution.permanent_id != permanent_id
    ).order_by(col(Institution.name))).all() if inst.trust_id is not None else []

    cases = session.exec(select(Case).where(Case.permanent_id == permanent_id)
                         .order_by(col(Case.received_at).desc(), col(Case.id).desc())).all()
    in_scope = in_scope_callback(session, viewer)
    grouped: Dict[int, List[LinkedCaseCard]] = {}
    for case in cases:  # always the reduced card (PRD §4.2): `in_scope` says whether the viewer can open the case
        grouped.setdefault(case.current_bureau_id, []).append(linked_case_card(session, case, in_scope))
    columns = []
    for bureau_id, records in sorted(grouped.items()):
        bureau = session.get(Bureau, bureau_id)
        if bureau:
            columns.append(BureauCaseColumn(bureau_id=bureau_id, bureau_code=bureau.code,
                                            bureau_name=bureau.name, cases=records))

    all_cases = cases
    current = today()
    counts = CaseCounts(
        total=len(all_cases),
        open=sum(case.status != CaseStatus.disposed for case in all_cases),
        disposed=sum(case.status == CaseStatus.disposed for case in all_cases),
        beyond_sla=sum(case.status != CaseStatus.disposed and case.sla_due_on < current for case in all_cases),
    )
    anchor_keys = {permanent_id, f"parent:{inst.parent_id or permanent_id}"}
    if inst.trust_id is not None:
        anchor_keys.add(f"trust:{inst.trust_id}")
    groups = session.exec(select(OverlapGroup).where(
        col(OverlapGroup.anchor_key).in_(anchor_keys),
        col(OverlapGroup.status).in_([OverlapGroupStatus.open, OverlapGroupStatus.confirmed]),
    ).order_by(col(OverlapGroup.id))).all()
    summaries = []
    for group in groups:
        assert group.id is not None
        members = session.exec(select(OverlapLink.case_id).where(OverlapLink.group_id == group.id)
                               .order_by(col(OverlapLink.case_id))).all()
        linked = [session.get(Case, case_id) for case_id in members]
        cards = [linked_case_card(session, case, in_scope) for case in linked if case]
        pairs = session.exec(select(OverlapPair).where(
            col(OverlapPair.case_a_id).in_(members), col(OverlapPair.case_b_id).in_(members)
        ).order_by(col(OverlapPair.score).desc())).all()
        reasons = list(dict.fromkeys(reason for pair in pairs for reason in pair.reasons))
        summaries.append(OverlapSummary(
            group_id=group.id, level=group.level, tier=group.tier, status=group.status,
            banner=BANNERS[group.tier.value], cases=cards, reasons=reasons,
        ))
    return Institution360(
        institution=item,
        trust=TrustRead.model_validate(trust) if trust else None,
        parent=_lite(parent) if parent else None,
        departments=[_lite(row) for row in departments],
        trust_institutions=[_lite(row) for row in trust_rows],
        case_counts=counts,
        cases_by_bureau=columns,
        overlap_groups=summaries,
    )


def _lite(row: Institution) -> InstitutionLite:
    return InstitutionLite(permanent_id=row.permanent_id, name=row.name, district=row.district,
                           state=row.state, inst_type=row.inst_type)
