from typing import Annotated

from fastapi import APIRouter, Path, Query

from app.core.db import SessionDep
from app.core.deps import CurrentUser
from app.core.enums import Role
from app.core.scope import require_roles
from app.core.schemas import Envelope, Page, error_responses
from app.modules.engine import service as engine_service
from app.modules.institutions.models import PERMANENT_ID_PATTERN
from app.modules.institutions import service
from app.modules.institutions.schemas import (
    Institution360, InstitutionListItem, InstitutionListParams, Resolution, ResolvePreviewIn,
)
from app.modules.users.models import User

router = APIRouter(prefix="/institutions", tags=["institutions"])


@router.get("", response_model=Page[InstitutionListItem], responses=error_responses(400, 401))
def list_institutions(
    session: SessionDep, params: Annotated[InstitutionListParams, Query()], _: CurrentUser
) -> Page[InstitutionListItem]:
    items, total = service.search(session, params)
    return Page.create(items, total, params.page, params.limit)


@router.get(
    "/{permanent_id}", response_model=Envelope[Institution360], responses=error_responses(401, 404)
)
def get_institution_360(
    user: CurrentUser, session: SessionDep,
    permanent_id: Annotated[str, Path(pattern=PERMANENT_ID_PATTERN)],
) -> Envelope[Institution360]:
    return Envelope(data=service.get_360(session, permanent_id, user))


@router.post("/resolve", response_model=Envelope[Resolution], responses=error_responses(400, 401, 403))
def resolve_preview(
    body: ResolvePreviewIn,
    session: SessionDep,
    user: User = require_roles(Role.intake_operator, Role.bureau_head, Role.senior_mgmt),
) -> Envelope[Resolution]:
    result = engine_service.resolve_preview(session, body.raw_text, body.state, body.district)
    return Envelope(data=result)
