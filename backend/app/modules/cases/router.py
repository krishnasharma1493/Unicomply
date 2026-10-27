from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlmodel import col, func, select

from app.core.db import SessionDep
from app.core.deps import CurrentUser
from app.core.enums import Role
from app.core.scope import get_case_in_scope_or_404, require_can_act, require_roles, scope_cases
from app.core.fixtures import fixture
from app.core.schemas import Envelope, Page, error_responses
from app.modules.cases.schemas import (
    CaseActionIn,
    CaseActionResult,
    CaseCreate,
    CaseDetail,
    CaseIntakeResult,
    CaseListParams,
    CaseRead,
)
from app.modules.cases import service
from app.modules.engine.service import reset_indexes
from app.modules.cases import workflow
from app.modules.cases.models import Case
from app.modules.cases.service import case_reads, filter_cases
from app.modules.users.models import User

router = APIRouter(prefix="/cases", tags=["cases"])


@router.get("", response_model=Page[CaseRead], responses=error_responses(400, 401))
def list_cases(user: CurrentUser, session: SessionDep, params: Annotated[CaseListParams, Query()]) -> Page[CaseRead]:
    """Search & filters (PS feature 6), scoped to the caller; newest received first."""
    base = filter_cases(scope_cases(select(Case), user), params)
    total = session.exec(select(func.count()).select_from(base.subquery())).one()
    rows = session.exec(
        base.order_by(col(Case.received_at).desc(), col(Case.id).desc())
        .offset((params.page - 1) * params.limit)
        .limit(params.limit)
    ).all()
    return Page.create(case_reads(session, rows), total, params.page, params.limit)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=Envelope[CaseIntakeResult],
    responses=error_responses(400, 401, 403),
)
def create_case(
    body: CaseCreate,
    session: SessionDep,
    user: User = require_roles(Role.intake_operator, Role.bureau_head, Role.senior_mgmt),
) -> Envelope[CaseIntakeResult]:
    """Intake: creates the case, resolves the institution and runs overlap detection in one transaction."""
    try:
        result = service.create_case(session, body, user)
        session.commit()
    except BaseException:
        session.rollback()  # the case row goes with whatever failed
        reset_indexes()  # ...and so must the in-memory index edits
        raise
    return Envelope(data=result)


@router.get("/{case_id}", response_model=Envelope[CaseDetail], responses=error_responses(401, 404))
def get_case(user: CurrentUser, session: SessionDep, case_id: int) -> Envelope[CaseDetail]:
    """Case detail: tracking fields, action history, linked-case summaries and reasons."""
    return Envelope(data=service.case_detail(session, get_case_in_scope_or_404(session, case_id, user), user))


@router.post(
    "/{case_id}/actions",
    response_model=Envelope[CaseActionResult],
    responses=error_responses(400, 401, 403, 404, 409),
)
def apply_case_action(
    user: CurrentUser, session: SessionDep, case_id: int, body: CaseActionIn
) -> Envelope[CaseActionResult]:
    """assign / transfer / escalate / interim_reply / remark / dispose / reopen (§4.3 state machine).

    Applies the validated workflow state machine and appends action/audit history atomically.
    """
    case = get_case_in_scope_or_404(session, case_id, user)
    require_can_act(user, case)
    try:
        result = workflow.apply_action(session, case, body, user)
        session.commit()
    except BaseException:
        session.rollback()
        reset_indexes()
        raise
    return Envelope(data=result)
