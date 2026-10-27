from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser
from app.core.fixtures import fixture
from app.core.schemas import Envelope, Page, error_responses
from app.modules.reviews.schemas import ReviewDecideIn, ReviewDecideResult, ReviewItem, ReviewListParams

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get("", response_model=Page[ReviewItem], responses=error_responses(400, 401, 403))
def list_reviews(_: CurrentUser, params: Annotated[ReviewListParams, Query()]) -> Page[ReviewItem]:
    """Match review queue of uncertain institution matches.

    Stub (#7): serves contract/fixtures/get_reviews.json until #18.
    """
    return fixture("get_reviews", Page[ReviewItem])


@router.post(
    "/{review_id}/decide",
    response_model=Envelope[ReviewDecideResult],
    responses=error_responses(400, 401, 403, 404, 409),
)
def decide_review(_: CurrentUser, review_id: int, body: ReviewDecideIn) -> Envelope[ReviewDecideResult]:
    """`{permanent_id}` or `{none: true}`: saves the alias and re-runs overlap detection.

    Stub (#7): serves contract/fixtures/post_reviews_id_decide.json until #18 / #39.
    """
    return fixture("post_reviews_id_decide", Envelope[ReviewDecideResult])
