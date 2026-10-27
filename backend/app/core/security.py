"""Demo-grade auth: one shared demo password, 12-hour JWTs (base blueprint §4, PRD A3)."""

import hmac
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import Settings

ALGORITHM = "HS256"


def check_demo_password(candidate: str, settings: Settings) -> bool:
    """Timing-safe comparison with the shared demo password."""
    return hmac.compare_digest(candidate.encode(), settings.DEMO_PASSWORD.encode())


def create_access_token(user_id: int, settings: Settings) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=settings.JWT_EXPIRES_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)


def decode_user_id(token: str, settings: Settings) -> int:
    """Raises jwt.ExpiredSignatureError, jwt.InvalidTokenError, KeyError or ValueError on a bad token."""
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
    return int(payload["sub"])
