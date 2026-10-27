from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser
from app.core.fixtures import fixture
from app.core.schemas import Envelope, Page, error_responses
from app.modules.overlaps.schemas import (
    OverlapDecisionIn,
    OverlapGroupDetail,
    OverlapGroupListItem,
    OverlapListParams,
)

router = APIRouter(prefix="/overlaps", tags=["overlaps"])


@router.get("", response_model=Page[OverlapGroupListItem], responses=error_responses(400, 401, 403))
def list_overlaps(
    _: CurrentUser, params: Annotated[OverlapListParams, Query()]
) -> Page[OverlapGroupListItem]:
    """Overlap Center list by tier / status / level / bureau.

    Stub (#7): serves contract/fixtures/get_overlaps.json until #17.
    """
    return fixture("get_overlaps", Page[OverlapGroupListItem])


@router.get(
    "/{group_id}", response_model=Envelope[OverlapGroupDetail], responses=error_responses(401, 403, 404)
)
def get_overlap(_: CurrentUser, group_id: int) -> Envelope[OverlapGroupDetail]:
    """Side-by-side cases, issue clusters and pair reasons.

    Stub (#7): serves contract/fixtures/get_overlaps_id.json until #17.
    """
    return fixture("get_overlaps_id", Envelope[OverlapGroupDetail])


@router.post(
    "/{group_id}/decision",
    response_model=Envelope[OverlapGroupDetail],
    responses=error_responses(400, 401, 403, 404, 409),
)
def decide_overlap(_: CurrentUser, group_id: int, body: OverlapDecisionIn) -> Envelope[OverlapGroupDetail]:
    """Confirm (with a coordinator), dismiss (remark required) or resolve a group.

    Stub (#7): serves contract/fixtures/post_overlaps_id_decision.json until #17.
    """
    return fixture("post_overlaps_id_decision", Envelope[OverlapGroupDetail])
