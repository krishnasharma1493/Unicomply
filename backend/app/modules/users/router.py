from fastapi import APIRouter

from app.core.deps import CurrentUser
from app.core.schemas import Envelope
from app.modules.users.schemas import UserRead

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=Envelope[UserRead])
def read_me(user: CurrentUser) -> Envelope[UserRead]:
    """Role, bureau and region come from the database, not the token."""
    return Envelope(data=UserRead.model_validate(user))
