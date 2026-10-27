"""
UTC-aware time utilities with deterministic demo date support.

Per Unicomply PRD:
- All domain code must use utcnow() and today() from this module.
- No domain code may directly call `date.today()` or `datetime.now()`.
- When DEMO_TODAY is configured in settings, today() deterministically returns that date.
"""

from datetime import date, datetime, timezone
from typing import Optional

from app.core.config import get_settings


def utcnow() -> datetime:
    """Return the current timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


def today(demo_today_override: Optional[date] = None) -> date:
    """
    Return today's date in UTC, or the configured DEMO_TODAY if specified.

    Args:
        demo_today_override: Optional explicit override for testing.

    Returns:
        date: The configured DEMO_TODAY if set, else the current UTC date.
    """
    if demo_today_override is not None:
        return demo_today_override

    settings = get_settings()
    if settings.DEMO_TODAY is not None:
        return settings.DEMO_TODAY

    return utcnow().date()


def iso_utcnow() -> str:
    """
    Return the current UTC timestamp formatted as ISO 8601 string with 'Z' suffix.
    E.g.: '2026-10-27T18:00:00Z'
    """
    dt = utcnow()
    # Replace +00:00 with Z for clean ISO 8601 UTC representation
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
