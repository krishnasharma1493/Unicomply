"""Scoped overlap-group queries and human decisions."""

from typing import Dict, List, Set

from sqlmodel import Session, col, select
from sqlalchemy import func

from app.core.enums import AlertSeverity, AlertType, CaseStatus, OverlapGroupStatus, PairDecision, Role
from app.core.errors import AlreadyDecidedError, ForbiddenError, NotFoundError, RemarksRequiredError, AppError
from app.core.scope import in_scope_callback, scope_cases
from app.matching.types import BANNERS, IssueCluster, PairEvidence
from app.modules.alerts import service as alert_service
from app.modules.audit.models import AuditLog
from app.modules.cases.models import Case
from app.modules.engine import service as engine_service
from app.modules.engine.builders import linked_case_card
from app.modules.institutions.models import Institution, Trust
from app.modules.meta.models import Bureau
from app.modules.overlaps.models import OverlapGroup, OverlapLink, OverlapPair
from app.modules.overlaps.schemas import (
    OverlapCluster, OverlapGroupDetail, OverlapGroupListItem, OverlapListParams, OverlapPairRead,
)
from app.modules.users.models import User
from app.utils.time import utcnow


def list_groups(session: Session, params: OverlapListParams, user: User) -> tuple[List[OverlapGroupListItem], int]:
    stmt = scope_cases(
        select(OverlapGroup)
        .join(OverlapLink, col(OverlapLink.group_id) == col(OverlapGroup.id))
        .join(Case, col(Case.id) == col(OverlapLink.case_id))
        .distinct(), user,
    )
    if params.tier:
        stmt = stmt.where(OverlapGroup.tier == params.tier)
    if params.status:
        stmt = stmt.where(OverlapGroup.status == params.status)
    if params.level:
        stmt = stmt.where(OverlapGroup.level == params.level)
    if params.bureau_id is not None:
        in_bureau = select(OverlapLink.group_id).join(Case, col(Case.id) == col(OverlapLink.case_id)).where(
            Case.current_bureau_id == params.bureau_id
        )
        stmt = stmt.where(col(OverlapGroup.id).in_(in_bureau))
    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    groups = session.exec(stmt.order_by(col(OverlapGroup.updated_at).desc(), col(OverlapGroup.id).desc())
                          .offset((params.page - 1) * params.limit).limit(params.limit)).all()
    return [_list_item(session, group) for group in groups], total


def get_detail(session: Session, group_id: int, user: User) -> OverlapGroupDetail:
    group = _group_in_scope(session, group_id, user)
    return _detail(session, group, user)


def decide(session: Session, group_id: int, body, user: User) -> OverlapGroupDetail:
    group = session.get(OverlapGroup, group_id)
    if group is None:
        raise NotFoundError("Overlap group not found")
    members = _member_cases(session, group_id)
    if not members:
        raise NotFoundError("Overlap group not found")
    bureau_ids = {case.current_bureau_id for case in members}
    # A group is visible to an official only if one of its cases is in their full-detail scope.
    _group_in_scope(session, group_id, user)
    if user.role == Role.bureau_head:
        if user.bureau_id not in bureau_ids:
            raise NotFoundError("Overlap group not found")
    elif user.role != Role.senior_mgmt:
        raise ForbiddenError("Only involved bureau heads or senior management can decide overlaps")
    # open: any decision. confirmed: it can still be resolved. dismissed / resolved are final.
    if group.status == OverlapGroupStatus.confirmed and body.decision != "resolve":
        raise AlreadyDecidedError()
    if group.status not in (OverlapGroupStatus.open, OverlapGroupStatus.confirmed):
        raise AlreadyDecidedError()

    if body.decision == "dismiss" and not (body.remark and body.remark.strip()):
        raise RemarksRequiredError(details={"decision": "dismiss"})
    if body.decision == "confirm":
        coordinator = session.get(User, body.coordinator_id)
        if coordinator is None or coordinator.role != Role.case_officer or coordinator.bureau_id not in bureau_ids:
            raise _validation("coordinator_id", "Coordinator must be a case officer in an involved bureau")

    old_values = {
        "status": group.status.value,
        "coordinator_id": group.coordinator_id,
        "decision_remark": group.decision_remark,
    }
    now = utcnow()
    group.status = {
        "confirm": OverlapGroupStatus.confirmed,
        "dismiss": OverlapGroupStatus.dismissed,
        "resolve": OverlapGroupStatus.resolved,
    }[body.decision]
    group.decided_by = user.id
    group.decided_at = now
    group.decision_remark = body.remark.strip() if body.remark else None
    if body.decision == "confirm":
        group.coordinator_id = body.coordinator_id
    group.updated_at = now
    session.add(group)
    session.flush()
    changes = {
        "status": (old_values["status"], group.status.value),
        "coordinator_id": (old_values["coordinator_id"], group.coordinator_id),
        "decision_remark": (old_values["decision_remark"], group.decision_remark),
        "decided_by": (None, user.id),
        "decided_at": (None, now),
    }
    for field, (old, new) in changes.items():
        if old != new:
            session.add(AuditLog(actor_id=user.id, entity="overlap_group", entity_id=str(group_id), field=field,
                                 old_value=str(old) if old is not None else None,
                                 new_value=str(new) if new is not None else None))
    if body.decision == "dismiss":
        pairs = session.exec(select(OverlapPair).where(
            col(OverlapPair.case_a_id).in_([case.id for case in members]),
            col(OverlapPair.case_b_id).in_([case.id for case in members]),
        )).all()
        for pair in pairs:
            pair.decision = PairDecision.dismissed
            session.add(pair)
    if body.decision == "confirm":
        recipients = alert_service.heads_of_bureaus(session, bureau_ids) + alert_service.senior_mgmt(session)
        regions = {inst.region for case in members if case.permanent_id
                   if (inst := session.get(Institution, case.permanent_id)) is not None}
        for region in regions:
            recipients += alert_service.ro_officers_for_region(session, region)
        severity = AlertSeverity.critical if group.tier.value == "probable" else AlertSeverity.warning
        alert_service.create_alert(
            session, AlertType.overlap, severity, recipients,
            title=f"Overlap confirmed: {group.anchor_key}",
            body=f"Coordinator assigned for overlap group {group_id}", group_id=group_id,
        )
    session.flush()
    return _detail(session, group, user)


def auto_resolve_disposed_groups(session: Session, case: Case) -> None:
    """Resolve active groups once every linked case has been disposed."""
    group_ids = session.exec(select(OverlapLink.group_id).where(OverlapLink.case_id == case.id)).all()
    for group_id in group_ids:
        group = session.get(OverlapGroup, group_id)
        if group is None or group.status not in (OverlapGroupStatus.open, OverlapGroupStatus.confirmed):
            continue
        statuses = session.exec(select(Case.status).join(OverlapLink, col(OverlapLink.case_id) == col(Case.id))
                                .where(OverlapLink.group_id == group_id)).all()
        if statuses and all(status == CaseStatus.disposed for status in statuses):
            old_status = group.status.value
            group.status = OverlapGroupStatus.resolved
            group.updated_at = utcnow()
            session.add(group)
            session.add(AuditLog(actor_id=None, entity="overlap_group", entity_id=str(group_id),
                                 field="status", old_value=old_status, new_value="resolved"))


def _group_in_scope(session: Session, group_id: int, user: User) -> OverlapGroup:
    stmt = scope_cases(
        select(OverlapGroup)
        .join(OverlapLink, col(OverlapLink.group_id) == col(OverlapGroup.id))
        .join(Case, col(Case.id) == col(OverlapLink.case_id))
        .where(OverlapGroup.id == group_id), user,
    )
    group = session.exec(stmt).first()
    if group is None:
        raise NotFoundError("Overlap group not found")
    return group


def _bureau_code(session: Session, bureau_id: int) -> str:
    bureau = session.get(Bureau, bureau_id)
    return bureau.code if bureau else str(bureau_id)


def _member_cases(session: Session, group_id: int) -> List[Case]:
    return list(session.exec(select(Case).join(OverlapLink, col(OverlapLink.case_id) == col(Case.id))
                             .where(OverlapLink.group_id == group_id).order_by(col(Case.id))).all())


def _list_item(session: Session, group: OverlapGroup) -> OverlapGroupListItem:
    assert group.id is not None
    cases = _member_cases(session, group.id)
    bureau_codes = sorted({_bureau_code(session, c.current_bureau_id) for c in cases})
    scores = session.exec(select(OverlapPair.score).where(
        col(OverlapPair.case_a_id).in_([c.id for c in cases]), col(OverlapPair.case_b_id).in_([c.id for c in cases])
    )).all()
    coordinator = session.get(User, group.coordinator_id) if group.coordinator_id else None
    anchor = group.anchor_key
    if anchor.startswith("trust:"):
        trust = session.get(Trust, int(anchor.removeprefix("trust:")))
        anchor_name = trust.name if trust else anchor
    else:
        pid = anchor.removeprefix("parent:")
        inst = session.get(Institution, pid)
        anchor_name = inst.name if inst else anchor
    return OverlapGroupListItem(
        **group.model_dump(), anchor_name=anchor_name, banner=BANNERS[group.tier.value],
        coordinator_name=coordinator.name if coordinator else None,
        case_count=len(cases), bureau_codes=bureau_codes, top_score=max(scores, default=0.0),
    )


def _detail(session: Session, group: OverlapGroup, user: User) -> OverlapGroupDetail:
    assert group.id is not None
    cases = _member_cases(session, group.id)
    case_ids = [case.id for case in cases if case.id is not None]
    in_scope = in_scope_callback(session, user)
    details = [linked_case_card(session, case, in_scope) for case in cases]  # cards only, in scope or not (PRD §4.2)
    pairs = session.exec(select(OverlapPair).where(
        col(OverlapPair.case_a_id).in_(case_ids), col(OverlapPair.case_b_id).in_(case_ids)
    ).order_by(col(OverlapPair.score).desc())).all()
    evidence = [PairEvidence(p.case_a_id, p.case_b_id, p.level.value, p.score, tuple(p.reasons)) for p in pairs]
    thresholds = engine_service.current_thresholds()
    assert thresholds is not None
    # Stored evidence is used directly; complete linkage does not depend on the resolver index.
    from app.matching.overlap import issue_clusters
    issue_clusters_value = issue_clusters(case_ids, evidence, thresholds.t_possible)
    return OverlapGroupDetail(
        group=_list_item(session, group), cases=details,
        clusters=[OverlapCluster(cluster_id=c.cluster_id, label=c.label, case_ids=list(c.case_ids)) for c in issue_clusters_value],
        pairs=[OverlapPairRead.model_validate(pair) for pair in pairs], reasons=list(dict.fromkeys(r for pair in pairs for r in pair.reasons)),
    )


def _validation(field: str, message: str) -> AppError:
    return AppError(400, "VALIDATION_ERROR", "Validation failed", fields={field: [message]})
