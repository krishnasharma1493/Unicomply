from typing import Annotated

from fastapi import APIRouter, Path, Query

from app.core.deps import CurrentUser
from app.core.fixtures import fixture
from app.core.schemas import Envelope, Page, error_responses
from app.modules.institutions.models import PERMANENT_ID_PATTERN
from app.modules.institutions.schemas import (
    Institution360,
    InstitutionListItem,
    InstitutionListParams,
    Resolution,
    ResolvePreviewIn,
)

router = APIRouter(prefix="/institutions", tags=["institutions"])


@router.get("", response_model=Page[InstitutionListItem], responses=error_responses(400, 401))
def list_institutions(
    _: CurrentUser, params: Annotated[InstitutionListParams, Query()]
) -> Page[InstitutionListItem]:
    """Registry search by name, acronym, alias or Permanent ID.

    Stub (#7): serves contract/fixtures/get_institutions.json until #16.
    """
    return fixture("get_institutions", Page[InstitutionListItem])


@router.get(
    "/{permanent_id}", response_model=Envelope[Institution360], responses=error_responses(401, 404)
)
def get_institution_360(
    _: CurrentUser, permanent_id: Annotated[str, Path(pattern=PERMANENT_ID_PATTERN)]
) -> Envelope[Institution360]:
    """Institution 360: profile, trust, parent/departments, cases by bureau, open overlap groups.

    Stub (#7): serves contract/fixtures/get_institutions_permanent_id.json until #16.
    """
    return fixture("get_institutions_permanent_id", Envelope[Institution360])


@router.post("/resolve", response_model=Envelope[Resolution], responses=error_responses(400, 401, 403))
def resolve_preview(_: CurrentUser, body: ResolvePreviewIn) -> Envelope[Resolution]:
    """Live preview while typing: top-k candidate institutions with scores and reasons.

    Stub (#7): serves contract/fixtures/post_institutions_resolve.json until #16 / #38.
    """
    return fixture("post_institutions_resolve", Envelope[Resolution])
