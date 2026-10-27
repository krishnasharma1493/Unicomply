from fastapi import APIRouter

from app.core.deps import CurrentUser
from app.core.fixtures import fixture
from app.core.schemas import Envelope, error_responses
from app.modules.meta.schemas import Meta

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("", response_model=Envelope[Meta], responses=error_responses(401))
def get_meta(_: CurrentUser) -> Envelope[Meta]:
    """Bureaus, regions, categories, statuses, channels, action types and other dropdowns.

    Stub (#7): serves contract/fixtures/get_meta.json until #16.
    """
    return fixture("get_meta", Envelope[Meta])
