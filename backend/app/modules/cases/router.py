from typing import Annotated

from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser
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

router = APIRouter(prefix="/cases", tags=["cases"])


@router.get("", response_model=Page[CaseRead], responses=error_responses(400, 401))
def list_cases(_: CurrentUser, params: Annotated[CaseListParams, Query()]) -> Page[CaseRead]:
    """Search & filters (PS feature 6), scoped to the caller.

    Stub (#7): serves contract/fixtures/get_cases.json until #14.
    """
    return fixture("get_cases", Page[CaseRead])


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=Envelope[CaseIntakeResult],
    responses=error_responses(400, 401, 403),
)
def create_case(_: CurrentUser, body: CaseCreate) -> Envelope[CaseIntakeResult]:
    """Intake: creates the case, resolves the institution and runs overlap detection in one transaction.

    Stub (#7): serves contract/fixtures/post_cases.json until #14 / #38.
    """
    return fixture("post_cases", Envelope[CaseIntakeResult])


@router.get("/{case_id}", response_model=Envelope[CaseDetail], responses=error_responses(401, 404))
def get_case(_: CurrentUser, case_id: int) -> Envelope[CaseDetail]:
    """Case detail: tracking fields, action history, linked-case summaries and reasons.

    Stub (#7): serves contract/fixtures/get_cases_id.json until #14.
    """
    return fixture("get_cases_id", Envelope[CaseDetail])


@router.post(
    "/{case_id}/actions",
    response_model=Envelope[CaseActionResult],
    responses=error_responses(400, 401, 403, 404, 409),
)
def apply_case_action(_: CurrentUser, case_id: int, body: CaseActionIn) -> Envelope[CaseActionResult]:
    """assign / transfer / escalate / interim_reply / remark / dispose / reopen (§4.3 state machine).

    Stub (#7): serves contract/fixtures/post_cases_id_actions.json until #15.
    """
    return fixture("post_cases_id_actions", Envelope[CaseActionResult])
