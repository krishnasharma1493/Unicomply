from fastapi import APIRouter
from sqlmodel import select

from app.core.db import SessionDep
from app.core.deps import SettingsDep
from app.core.enums import LOGIN_ROLES
from app.core.errors import AppError
from app.core.schemas import Envelope, error_responses
from app.core.security import check_demo_password, create_access_token
from app.modules.auth.schemas import LoginIn, LoginOut
from app.modules.users.models import User
from app.modules.users.schemas import UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Envelope[LoginOut], responses=error_responses(400, 401))
def login(body: LoginIn, session: SessionDep, settings: SettingsDep) -> Envelope[LoginOut]:
    """Persona login with the shared demo password. Case officers are data only and cannot log in."""
    user = session.exec(select(User).where(User.email == body.email.strip().lower())).first()
    password_ok = check_demo_password(body.password, settings)  # checked even for unknown emails
    if user is None or user.id is None or user.role not in LOGIN_ROLES or not password_ok:
        raise AppError(401, "UNAUTHORIZED", "Invalid email or password")  # one generic message
    return Envelope(
        data=LoginOut(
            access_token=create_access_token(user.id, settings),
            user=UserRead.model_validate(user),
        )
    )
