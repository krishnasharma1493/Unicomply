"""Request dependencies: the current user and the admin gate (base blueprint §4)."""

from typing import Annotated, Optional

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import col, select

from app.core.config import Settings, get_settings
from app.core.db import SessionDep
from app.core.errors import AppError
from app.core.security import decode_user_id
from app.modules.users.models import User

SettingsDep = Annotated[Settings, Depends(get_settings)]
_bearer = HTTPBearer(auto_error=False)  # also adds the "Authorize" button to /docs


def get_current_user(
    session: SessionDep,
    settings: SettingsDep,
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(_bearer)],
) -> User:
    if settings.AUTH_DISABLED:  # emergency demo switch (base blueprint §10B): act as the first user
        fallback = session.exec(select(User).order_by(col(User.id))).first()
        if fallback is not None:
            return fallback
    if creds is None:
        raise AppError(401, "UNAUTHORIZED", "Missing access token")
    try:
        user_id = decode_user_id(creds.credentials, settings)
    except jwt.ExpiredSignatureError:
        raise AppError(401, "TOKEN_EXPIRED", "Session expired — log in again") from None
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise AppError(401, "TOKEN_INVALID", "Invalid access token") from None
    user = session.get(User, user_id)
    if user is None:
        raise AppError(401, "TOKEN_INVALID", "User no longer exists")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(user: CurrentUser) -> User:
    if not user.is_admin:
        raise AppError(403, "FORBIDDEN", "Admin only")
    return user


AdminUser = Annotated[User, Depends(require_admin)]
