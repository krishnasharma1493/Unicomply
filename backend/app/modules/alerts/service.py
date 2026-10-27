"""
The one way to raise an alert (PRD §4.6). Each alert is deduplicated per type, recipient, entity
and day, so a job loop that ticks every few seconds raises it once.

Writes: alert. Runs inside the caller's transaction: it flushes but never commits, and a
duplicate is swallowed inside a savepoint so the caller's transaction survives.
"""

from typing import Iterable, List, Optional, Sequence

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from app.core.enums import AlertSeverity, AlertType, Region, Role
from app.modules.alerts.models import Alert
from app.modules.users.models import User
from app.utils.time import today

# ── Recipients ───────────────────────────────────────────────────────────


def heads_of_bureaus(session: Session, bureau_ids: Iterable[int]) -> List[User]:
    """Heads of the given bureaus, and the RO officers of the given Regional Offices (an RO is a bureau row)."""
    ids = set(bureau_ids)
    if not ids:
        return []
    stmt = (
        select(User)
        .where(col(User.role).in_([Role.bureau_head, Role.ro_officer]), col(User.bureau_id).in_(ids))
        .order_by(col(User.id))
    )
    return list(session.exec(stmt).all())


def ro_officers_for_region(session: Session, region: Region) -> List[User]:
    stmt = select(User).where(User.role == Role.ro_officer, User.region == region).order_by(col(User.id))
    return list(session.exec(stmt).all())


def senior_mgmt(session: Session) -> List[User]:
    return list(session.exec(select(User).where(User.role == Role.senior_mgmt).order_by(col(User.id))).all())


# ── create_alert ─────────────────────────────────────────────────────────


def dedupe_key(
    type: AlertType,
    recipient_id: int,
    case_id: Optional[int] = None,
    group_id: Optional[int] = None,
    permanent_id: Optional[str] = None,
) -> str:
    """`type:recipient:entity:date`, e.g. `sla_breach:3:case-104:2026-11-20` (entity: group, else case, else institution)."""
    if group_id is not None:
        entity = f"group-{group_id}"
    elif case_id is not None:
        entity = f"case-{case_id}"
    else:
        entity = f"inst-{permanent_id or 'none'}"
    return f"{type.value}:{recipient_id}:{entity}:{today().isoformat()}"


def create_alert(
    session: Session,
    type: AlertType,
    severity: AlertSeverity,
    recipients: Sequence[User],
    *,
    title: str,
    body: str,
    case_id: Optional[int] = None,
    group_id: Optional[int] = None,
    permanent_id: Optional[str] = None,
) -> List[Alert]:
    """
    One alert per distinct recipient. Returns the alerts actually created: a recipient who already
    has this alert today is skipped silently.

    Writes: alert. Never commits.
    """
    created: List[Alert] = []
    seen = set()
    for user in recipients:
        if user.id is None or user.id in seen:
            continue
        seen.add(user.id)
        alert = Alert(
            type=type,
            severity=severity,
            recipient_id=user.id,
            case_id=case_id,
            group_id=group_id,
            permanent_id=permanent_id,
            title=title[:200],
            body=body[:1000],
            dedupe_key=dedupe_key(type, user.id, case_id, group_id, permanent_id),
        )
        try:
            with session.begin_nested():  # savepoint: a duplicate rolls back only itself
                session.add(alert)
                session.flush()
        except IntegrityError:
            continue
        created.append(alert)
    return created
