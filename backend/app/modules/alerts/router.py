from typing import Annotated, Any, List, Tuple

from fastapi import APIRouter, Query
from sqlalchemy import update
from sqlmodel import col, func, select

from app.core.db import SessionDep
from app.core.deps import CurrentUser
from app.core.errors import NotFoundError
from app.core.schemas import Envelope, Page, error_responses
from app.modules.alerts.models import Alert
from app.modules.alerts.schemas import AlertListParams, AlertRead, ReadAllResult
from app.modules.cases.models import Case
from app.modules.institutions.models import Institution

router = APIRouter(prefix="/alerts", tags=["alerts"])


def _read_model(alert: Alert, case_ref: object, institution_name: object) -> AlertRead:
    return AlertRead(
        **alert.model_dump(),
        case_ref=case_ref if isinstance(case_ref, str) else None,
        institution_name=institution_name if isinstance(institution_name, str) else None,
    )


@router.get("", response_model=Page[AlertRead], responses=error_responses(400, 401))
def list_alerts(
    user: CurrentUser, session: SessionDep, params: Annotated[AlertListParams, Query()]
) -> Page[AlertRead]:
    """The caller's own alerts, newest first; `permanent_id` and the institution name let the UI group them."""
    where: List[Any] = [col(Alert.recipient_id) == user.id]
    if params.unread_only:
        where.append(col(Alert.is_read).is_(False))
    total = session.exec(select(func.count()).select_from(Alert).where(*where)).one()
    stmt = (
        select(Alert, Case.case_ref, Institution.name)
        .join(Case, col(Case.id) == col(Alert.case_id), isouter=True)
        .join(Institution, col(Institution.permanent_id) == col(Alert.permanent_id), isouter=True)
        .where(*where)
        .order_by(col(Alert.created_at).desc(), col(Alert.id).desc())
        .offset((params.page - 1) * params.limit)
        .limit(params.limit)
    )
    rows: List[Tuple[Alert, object, object]] = list(session.exec(stmt).all())  # type: ignore[arg-type]
    return Page.create([_read_model(a, ref, name) for a, ref, name in rows], total, params.page, params.limit)


@router.post("/read-all", response_model=Envelope[ReadAllResult], responses=error_responses(401))
def read_all_alerts(user: CurrentUser, session: SessionDep) -> Envelope[ReadAllResult]:
    """Mark every one of the caller's alerts as read (never anyone else's)."""
    result = session.execute(
        update(Alert).where(col(Alert.recipient_id) == user.id, col(Alert.is_read).is_(False)).values(is_read=True)
    )
    session.commit()
    return Envelope(data=ReadAllResult(updated=result.rowcount))  # type: ignore[attr-defined]


@router.post("/{alert_id}/read", response_model=Envelope[AlertRead], responses=error_responses(401, 404))
def read_alert(user: CurrentUser, session: SessionDep, alert_id: int) -> Envelope[AlertRead]:
    """Mark one of the caller's alerts as read; another user's alert is a 404."""
    alert = session.exec(select(Alert).where(Alert.id == alert_id, Alert.recipient_id == user.id)).first()
    if alert is None:
        raise NotFoundError("Alert not found")
    alert.is_read = True
    session.add(alert)
    session.commit()
    session.refresh(alert)
    case = session.get(Case, alert.case_id) if alert.case_id else None
    inst = session.get(Institution, alert.permanent_id) if alert.permanent_id else None
    return Envelope(data=_read_model(alert, case.case_ref if case else None, inst.name if inst else None))
