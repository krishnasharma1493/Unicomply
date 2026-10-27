"""Tests for UTC-aware time utilities and deterministic DEMO_TODAY."""

from datetime import date, datetime, timezone
import pytest

from app.core.config import Settings, get_settings
from app.utils.time import iso_utcnow, today, utcnow


def test_utcnow_is_timezone_aware() -> None:
    """utcnow() returns a timezone-aware UTC datetime object."""
    now = utcnow()
    assert isinstance(now, datetime)
    assert now.tzinfo is not None
    assert now.tzinfo == timezone.utc


def test_today_default_returns_current_utc_date(monkeypatch: pytest.MonkeyPatch) -> None:
    """today() returns current UTC date when DEMO_TODAY is None."""
    # Ensure DEMO_TODAY is None
    monkeypatch.setattr(get_settings(), "DEMO_TODAY", None)
    current_date = today()
    assert isinstance(current_date, date)
    assert current_date == utcnow().date()


def test_today_with_demo_today_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    """With DEMO_TODAY=2026-11-20, today() deterministically returns that date."""
    demo_date = date(2026, 11, 20)
    monkeypatch.setattr(get_settings(), "DEMO_TODAY", demo_date)

    result = today()
    assert result == demo_date
    assert result == date(2026, 11, 20)


def test_today_with_explicit_override() -> None:
    """today(demo_today_override=...) takes precedence."""
    override = date(2027, 1, 15)
    assert today(demo_today_override=override) == override


def test_iso_utcnow_format() -> None:
    """iso_utcnow() returns ISO-8601 string ending with Z."""
    ts = iso_utcnow()
    assert isinstance(ts, str)
    assert ts.endswith("Z")
    assert "T" in ts
