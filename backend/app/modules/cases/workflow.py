"""Case action state machine (PRD §4.3)."""

from datetime import timedelta
from typing import Dict, Optional, Set, Tuple

from sqlmodel import Session, col, select

from app.core.config import get_settings
from app.core.enums import ActionType, AlertSeverity, AlertType, CaseStatus, OverlapGroupStatus, Role
from app.core.errors import (
    AppError,
    InvalidTransitionError,
    OpenOverlapError,
    RemarksRequiredError,
)
from app.modules.alerts import service as alerts
from app.modules.audit.models import AuditLog
from app.modules.cases.models import Case, CaseAction
from app.modules.engine import service as engine_service
from app.modules.cases.schemas import CaseActionEntry, CaseActionIn, CaseActionResult
from app.modules.cases.service import case_read
from app.modules.overlaps.models import OverlapGroup, OverlapLink
from app.modules.users.models import User
from app.utils.time import today, utcnow

OPEN = frozenset(
    {
        CaseStatus.received,
        CaseStatus.under_process,
        CaseStatus.interim_reply,
        CaseStatus.transferred,
        CaseStatus.escalated,
        CaseStatus.reopened,
    }
)
ALLOWED: Dict[ActionType, Tuple[Set[CaseStatus], Optional[CaseStatus]]] = {
    ActionType.assign: (
        {CaseStatus.received, CaseStatus.transferred, CaseStatus.escalated, CaseStatus.reopened},
        CaseStatus.under_process,
    ),
    ActionType.transfer: (set(OPEN), CaseStatus.transferred),
    ActionType.escalate: (set(OPEN), CaseStatus.escalated),
    ActionType.interim_reply: (
        {CaseStatus.under_process, CaseStatus.escalated, CaseStatus.reopened},
        CaseStatus.interim_reply,
    ),
    ActionType.remark: (set(OPEN) | {CaseStatus.disposed}, None),
    ActionType.dispose: (set(OPEN), CaseStatus.disposed),
    ActionType.reopen: ({CaseStatus.disposed}, CaseStatus.reopened),
}
REMARKS_REQUIRED = {ActionType.transfer, ActionType.escalate, ActionType.dispose, ActionType.reopen}


def apply_action(session: Session, case: Case, body: CaseActionIn, actor: User) -> CaseActionResult:
    """Validate and apply an action. Flushes but leaves commit/rollback to the request boundary."""
    allowed, next_status = ALLOWED[body.action_type]
    if case.status not in allowed:
        raise InvalidTransitionError(
            f"Cannot {body.action_type.value} case from {case.status.value}",
            details={
                "case_ref": case.case_ref,
                "allowed": [a.value for a in ActionType if case.status in ALLOWED[a][0]],
            },
        )
    if body.action_type in REMARKS_REQUIRED and not (body.remarks and body.remarks.strip()):
        raise RemarksRequiredError(details={"action_type": body.action_type.value})

    if body.action_type == ActionType.assign:
        if body.to_officer_id is None:
            raise _invalid_field("to_officer_id", "An officer is required for assignment")
        officer = session.get(User, body.to_officer_id)
        if officer is None or officer.role != Role.case_officer or officer.bureau_id != case.current_bureau_id:
            raise _invalid_field("to_officer_id", "Officer must belong to the case's current bureau")
    if body.action_type == ActionType.transfer:
        if body.to_bureau_id is None:
            raise _invalid_field("to_bureau_id", "A destination bureau is required")
        from app.modules.meta.models import Bureau

        if session.get(Bureau, body.to_bureau_id) is None:
            raise _invalid_field("to_bureau_id", "Unknown destination bureau")
        if body.to_bureau_id == case.current_bureau_id:
            raise _invalid_field("to_bureau_id", "Destination must differ from current bureau")
    if body.action_type == ActionType.escalate and actor.role not in (Role.bureau_head, Role.senior_mgmt):
        raise AppError(403, "FORBIDDEN", "Only a bureau head or senior officer can escalate")
    if body.action_type == ActionType.interim_reply:
        if body.expected_disposal_date is None:
            raise _invalid_field("expected_disposal_date", "An expected disposal date is required")
        if body.expected_disposal_date < today():
            raise _invalid_field("expected_disposal_date", "Expected disposal date cannot be in the past")
    if body.action_type == ActionType.dispose:
        if body.outcome is None:
            raise _invalid_field("outcome", "A disposal outcome is required")
        _guard_open_overlaps(session, case, body.confirm_open_overlap)
    elif body.outcome is not None:
        raise _invalid_field("outcome", "Outcome is only valid when disposing a case")

    now = utcnow()
    old_status = case.status
    old_last_action_type = case.last_action_type
    old_last_action_at = case.last_action_at
    old_bureau = case.current_bureau_id
    old_assignee = case.assigned_officer_id
    old_escalation = case.escalation_level
    old_expected_disposal = case.expected_disposal_date
    old_disposed_at = case.disposed_at
    old_reopen_count = case.reopen_count
    old_sla_due_on = case.sla_due_on
    if next_status is not None:
        case.status = next_status
    if body.action_type == ActionType.assign:
        case.assigned_officer_id = body.to_officer_id
    elif body.action_type == ActionType.transfer:
        case.current_bureau_id = body.to_bureau_id  # type: ignore[assignment]
        case.assigned_officer_id = None
    elif body.action_type == ActionType.escalate:
        case.escalation_level += 1
    elif body.action_type == ActionType.interim_reply:
        case.expected_disposal_date = body.expected_disposal_date
    elif body.action_type == ActionType.dispose:
        case.disposed_at = now
    elif body.action_type == ActionType.reopen:
        case.reopen_count += 1
        case.disposed_at = None
        case.sla_due_on = today() + timedelta(days=get_settings().SLA_DEFAULT_DAYS)

    case.last_action_type = body.action_type
    case.last_action_at = now
    case.updated_at = now
    session.add(case)
    entry = CaseAction(
        action_type=body.action_type,
        case_id=case.id,
        actor_id=actor.id,
        bureau_id=actor.bureau_id or old_bureau,
        from_bureau_id=old_bureau if body.action_type == ActionType.transfer else None,
        to_bureau_id=body.to_bureau_id,
        to_officer_id=body.to_officer_id,
        outcome=body.outcome,
        remarks=body.remarks.strip() if body.remarks else None,
        created_at=now,
    )
    session.add(entry)
    session.flush()
    changes = {
        "status": (old_status.value, case.status.value),
        "last_action_type": (
            old_last_action_type.value if old_last_action_type else None,
            case.last_action_type.value if case.last_action_type else None,
        ),
        "last_action_at": (old_last_action_at, case.last_action_at),
        "current_bureau_id": (old_bureau, case.current_bureau_id),
        "assigned_officer_id": (old_assignee, case.assigned_officer_id),
        "escalation_level": (old_escalation, case.escalation_level),
        "expected_disposal_date": (old_expected_disposal, case.expected_disposal_date),
        "disposed_at": (old_disposed_at, case.disposed_at),
        "reopen_count": (old_reopen_count, case.reopen_count),
        "sla_due_on": (old_sla_due_on, case.sla_due_on),
    }
    for field, (old_value, new_value) in changes.items():
        if old_value != new_value:
            session.add(
                AuditLog(
                    actor_id=actor.id,
                    entity="case",
                    entity_id=str(case.id),
                    field=field,
                    old_value=str(old_value) if old_value is not None else None,
                    new_value=str(new_value) if new_value is not None else None,
                )
            )
    if body.action_type == ActionType.transfer:
        engine_service.on_transfer(session, case)
    if body.action_type == ActionType.escalate:
        recipients = alerts.senior_mgmt(session) + alerts.heads_of_bureaus(session, [case.current_bureau_id])
        alerts.create_alert(
            session,
            AlertType.escalation,
            AlertSeverity.warning,
            recipients,
            title=f"Case escalated: {case.case_ref}",
            body=body.remarks or "Case escalated",
            case_id=case.id,
        )
    session.flush()
    actor_name = actor.name
    return CaseActionResult(
        case=case_read(session, case),
        action=CaseActionEntry(**entry.model_dump(), actor_name=actor_name),
    )


def _invalid_field(field: str, message: str) -> AppError:
    return AppError(400, "VALIDATION_ERROR", "Validation failed", fields={field: [message]})


def _guard_open_overlaps(session: Session, case: Case, confirmed: bool) -> None:
    links = session.exec(
        select(OverlapLink.group_id)
        .join(OverlapGroup, col(OverlapGroup.id) == col(OverlapLink.group_id))
        .where(OverlapLink.case_id == case.id, col(OverlapGroup.status) == OverlapGroupStatus.open)
    ).all()
    if links and not confirmed:
        refs = session.exec(
            select(Case.case_ref)
            .join(OverlapLink, col(OverlapLink.case_id) == col(Case.id))
            .where(col(OverlapLink.group_id).in_(links), Case.id != case.id)
            .order_by(col(Case.case_ref))
        ).all()
        raise OpenOverlapError(details={"case_ref": case.case_ref, "group_ids": links, "linked_case_refs": refs})


