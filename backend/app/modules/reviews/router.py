from typing import Annotated

from fastapi import APIRouter, Query

from app.core.db import SessionDep
from app.core.enums import Role
from app.core.scope import require_roles
from app.core.schemas import Envelope, Page, error_responses
from app.modules.reviews import service
from app.modules.reviews.schemas import ReviewDecideIn, ReviewDecideResult, ReviewItem, ReviewListParams
from app.modules.users.models import User

router = APIRouter(prefix="/reviews", tags=["reviews"])
_reviewer = require_roles(Role.intake_operator, Role.senior_mgmt)


@router.get("", response_model=Page[ReviewItem], responses=error_responses(400, 401, 403))
def list_reviews(
    session: SessionDep, params: Annotated[ReviewListParams, Query()], user: User = _reviewer
) -> Page[ReviewItem]:
    items, total = service.list_reviews(session, params)
    return Page.create(items, total, params.page, params.limit)


@router.post(
    "/{review_id}/decide",
    response_model=Envelope[ReviewDecideResult],
    responses=error_responses(400, 401, 403, 404, 409),
)
def decide_review(
    review_id: int, body: ReviewDecideIn, session: SessionDep, actor: User = _reviewer
) -> Envelope[ReviewDecideResult]:
    try:
        result = service.decide(session, review_id, body, actor)
        session.commit()
    except BaseException:
        session.rollback()
        raise
    return Envelope(data=result)
