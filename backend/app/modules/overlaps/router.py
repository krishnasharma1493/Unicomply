from typing import Annotated

from fastapi import APIRouter, Query

from app.core.db import SessionDep
from app.core.deps import CurrentUser
from app.core.schemas import Envelope, Page, error_responses
from app.modules.overlaps import service
from app.modules.overlaps.schemas import (
    OverlapDecisionIn, OverlapGroupDetail, OverlapGroupListItem, OverlapListParams,
)
from app.modules.users.models import User

router = APIRouter(prefix="/overlaps", tags=["overlaps"])


@router.get("", response_model=Page[OverlapGroupListItem], responses=error_responses(400, 401, 403))
def list_overlaps(
    user: CurrentUser, session: SessionDep, params: Annotated[OverlapListParams, Query()]
) -> Page[OverlapGroupListItem]:
    items, total = service.list_groups(session, params, user)
    return Page.create(items, total, params.page, params.limit)


@router.get(
    "/{group_id}", response_model=Envelope[OverlapGroupDetail], responses=error_responses(401, 403, 404)
)
def get_overlap(user: CurrentUser, session: SessionDep, group_id: int) -> Envelope[OverlapGroupDetail]:
    return Envelope(data=service.get_detail(session, group_id, user))


@router.post(
    "/{group_id}/decision",
    response_model=Envelope[OverlapGroupDetail],
    responses=error_responses(400, 401, 403, 404, 409),
)
def decide_overlap(
    user: CurrentUser, session: SessionDep, group_id: int, body: OverlapDecisionIn
) -> Envelope[OverlapGroupDetail]:
    try:
        result = service.decide(session, group_id, body, user)
        session.commit()
    except BaseException:
        session.rollback()
        raise
    return Envelope(data=result)
