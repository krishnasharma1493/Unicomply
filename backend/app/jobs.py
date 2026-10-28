"""
The background job loop (PRD §4.6). Every `JOB_TICK_SECONDS` one short session turns stored state
into SLA-warning, SLA-breach and no-action alerts, then asks the engine to re-scan cases that changed.

Nothing here is deduplicated by the loop itself: `create_alert` keeps one alert per type, recipient,
entity and day, so a tick that runs every few seconds raises each thing once. Everything is derived
from the database on every tick, so a restart or a missed tick loses nothing.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Dict, List, Optional

from sqlalchemy.engine import Engine
from sqlmodel import Session, col, func, select

from app.core.config import Settings, get_settings
from app.core.enums import AlertSeverity, AlertType, CaseStatus
from app.modules.alerts import service as alerts
from app.modules.cases.models import Case, CaseAction
from app.modules.engine import service as engine_service
from app.modules.institutions.models import Institution
from app.modules.users.models import User
from app.utils.time import today, utcnow

logger = logging.getLogger("unicomply.jobs")

_DIGEST_CASES = 8  # case refs spelled out in a digest; the title carries the full count


@dataclass
class TickResult:
    """What one tick did, for logs and tests."""

    sla_warnings: int = 0
    sla_breaches: int = 0
    reminders: int = 0
    rescanned: int = 0

    @property
    def alerts(self) -> int:
        return self.sla_warnings + self.sla_breaches + self.reminders


def _officer_name(session: Session, case: Case) -> str:
    officer = session.get(User, case.assigned_officer_id) if case.assigned_officer_id else None
    return officer.name if officer else "unassigned"


def _institution_name(session: Session, case: Case) -> str:
    inst = session.get(Institution, case.permanent_id) if case.permanent_id else None
    return inst.name if inst else case.raw_institution_text


def _open_cases(session: Session) -> List[Case]:
    stmt = select(Case).where(col(Case.status) != CaseStatus.disposed).order_by(col(Case.id))
    return list(session.exec(stmt).all())


def _heads(session: Session, cases: List[Case]) -> Dict[int, List[User]]:
    """Recipients per bureau id: the head of each bureau (or RO officers, for a Regional Office)."""
    by_bureau: Dict[int, List[User]] = {}
    for user in alerts.heads_of_bureaus(session, {c.current_bureau_id for c in cases}):
        if user.bureau_id is not None:
            by_bureau.setdefault(user.bureau_id, []).append(user)
    return by_bureau


def sla_warnings(session: Session, cases: List[Case], settings: Settings, now: date) -> int:
    """Open, from day `SLA_WARN_DAY`, and not yet beyond SLA (a breach supersedes the warning)."""
    due = [c for c in cases if (now - c.received_at).days >= settings.SLA_WARN_DAY and now <= c.sla_due_on]
    heads = _heads(session, due)
    created = 0
    for case in due:
        day, of = (now - case.received_at).days, (case.sla_due_on - case.received_at).days
        created += len(
            alerts.create_alert(
                session,
                AlertType.sla_warning,
                AlertSeverity.warning,
                heads.get(case.current_bureau_id, []),
                title=f"SLA warning: {case.case_ref} is on day {day} of {of}",
                body=(
                    f"{_institution_name(session, case)}. Due {case.sla_due_on:%d %b %Y}. "
                    f"Assigned officer: {_officer_name(session, case)}."
                ),
                case_id=case.id,
                permanent_id=case.permanent_id,
            )
        )
    return created


def _digest(late: List[Case], now: date) -> tuple[str, str]:
    worst = sorted(late, key=lambda c: (c.sla_due_on, c.id or 0))
    shown = ", ".join(f"{c.case_ref} (+{(now - c.sla_due_on).days}d)" for c in worst[:_DIGEST_CASES])
    more = f" and {len(worst) - _DIGEST_CASES} more" if len(worst) > _DIGEST_CASES else ""
    plural = "case is" if len(worst) == 1 else "cases are"
    return f"{len(worst)} {plural} beyond SLA", f"Longest overdue first: {shown}{more}."


def sla_breaches(session: Session, cases: List[Case], now: date) -> int:
    """
    Each head gets one alert per late case in their bureau. Senior management gets a single daily
    digest of all of them; it has no entity, so its dedupe key is just the recipient and the day.
    """
    late = [c for c in cases if now > c.sla_due_on]
    if not late:
        return 0
    heads = _heads(session, late)
    created = 0
    for case in late:
        day, of = (now - case.received_at).days, (case.sla_due_on - case.received_at).days
        officer = _officer_name(session, case)
        created += len(
            alerts.create_alert(
                session,
                AlertType.sla_breach,
                AlertSeverity.critical,
                heads.get(case.current_bureau_id, []),
                title=f"Beyond SLA: {case.case_ref}",
                body=f"Day {day} of {of}; officer {officer}." if officer != "unassigned"
                else f"Day {day} of {of}; no officer assigned yet.",
                case_id=case.id,
                permanent_id=case.permanent_id,
            )
        )
    title, body = _digest(late, now)
    created += len(
        alerts.create_alert(
            session, AlertType.sla_breach, AlertSeverity.critical, alerts.senior_mgmt(session), title=title, body=body
        )
    )
    return created


def reminders(session: Session, cases: List[Case], settings: Settings, now: date) -> int:
    """Open with no `case_action` for `NO_ACTION_REMINDER_DAYS`; a case with no action yet counts from `received_at`."""
    last_action = dict(
        session.exec(select(CaseAction.case_id, func.max(CaseAction.created_at)).group_by(col(CaseAction.case_id))).all()
    )
    stale = []
    for case in cases:
        last: Optional[datetime] = last_action.get(case.id) if case.id is not None else None
        since = last.date() if last else case.received_at
        if (now - since).days >= settings.NO_ACTION_REMINDER_DAYS:
            stale.append((case, (now - since).days))
    heads = _heads(session, [c for c, _ in stale])
    created = 0
    for case, idle in stale:
        created += len(
            alerts.create_alert(
                session,
                AlertType.reminder,
                AlertSeverity.info,
                heads.get(case.current_bureau_id, []),
                title=f"No action for {idle} days: {case.case_ref}",
                body=f"{_institution_name(session, case)}. Assigned officer: {_officer_name(session, case)}.",
                case_id=case.id,
                permanent_id=case.permanent_id,
            )
        )
    return created


def tick(session: Session, since: datetime, settings: Optional[Settings] = None) -> TickResult:
    """
    One pass of the loop, in the caller's session: alerts first, then the engine re-scan of cases
    updated at or after `since`. Commits on success and rolls back on any error.
    """
    settings = settings or get_settings()
    now = today()
    try:
        cases = _open_cases(session)
        result = TickResult(
            sla_warnings=sla_warnings(session, cases, settings, now),
            sla_breaches=sla_breaches(session, cases, now),
            reminders=reminders(session, cases, settings, now),
            rescanned=engine_service.rescan_since(session, since),
        )
        session.commit()
    except Exception:
        session.rollback()
        raise
    return result


def run_tick(engine: Engine, since: datetime, settings: Optional[Settings] = None) -> TickResult:
    """A tick in its own short session."""
    with Session(engine) as session:
        return tick(session, since, settings)


async def job_loop(engine: Engine, settings: Settings) -> None:
    """
    Tick every `JOB_TICK_SECONDS` until cancelled. A failed tick is logged and retried on the next
    one, and the re-scan window only advances after a tick succeeds, so no changed case is skipped.
    """
    since = utcnow()
    logger.info("Job loop started (every %ss)", settings.JOB_TICK_SECONDS)
    try:
        while True:
            await asyncio.sleep(settings.JOB_TICK_SECONDS)
            started = utcnow()
            try:
                result = await asyncio.to_thread(run_tick, engine, since, settings)
                since = started
                if result.alerts or result.rescanned:
                    logger.info("Job tick: %s", result)
            except Exception:
                logger.exception("Job tick failed; retrying on the next one")
    except asyncio.CancelledError:
        logger.info("Job loop stopped")
        raise
