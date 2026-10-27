"""Tests for configuration parsing, defaults, and validation rules."""

from datetime import date
import pytest
from pydantic_core import ValidationError

from app.core.config import Settings, load_and_validate_settings


def test_default_settings_valid() -> None:
    """Default settings validate without error."""
    settings = Settings()
    assert settings.PROJECT_NAME == "Unicomply"
    assert settings.EMBEDDINGS_MODE in ["tfidf", "model"]
    assert settings.MATCH_T_REVIEW < settings.MATCH_T_AUTO
    assert settings.OVERLAP_T_POSSIBLE < settings.OVERLAP_T_PROBABLE
    assert settings.SLA_WARN_DAY < settings.SLA_DEFAULT_DAYS


def test_invalid_match_thresholds_rejected() -> None:
    """MATCH_T_REVIEW >= MATCH_T_AUTO raises ValidationError."""
    with pytest.raises(ValidationError) as exc:
        Settings(MATCH_T_AUTO=0.70, MATCH_T_REVIEW=0.75)
    assert "MATCH_T_REVIEW" in str(exc.value)


def test_invalid_overlap_thresholds_rejected() -> None:
    """OVERLAP_T_POSSIBLE >= OVERLAP_T_PROBABLE raises ValidationError."""
    with pytest.raises(ValidationError) as exc:
        Settings(OVERLAP_T_PROBABLE=0.50, OVERLAP_T_POSSIBLE=0.60)
    assert "OVERLAP_T_POSSIBLE" in str(exc.value)


def test_invalid_embeddings_mode_rejected() -> None:
    """Invalid EMBEDDINGS_MODE is rejected by Literal validation."""
    with pytest.raises(ValidationError):
        Settings(EMBEDDINGS_MODE="invalid_mode")  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "field,value",
    [
        ("MATCH_T_AUTO", 1.5),
        ("MATCH_T_AUTO", -0.1),
        ("MATCH_T_REVIEW", 1.2),
        ("OVERLAP_T_PROBABLE", -0.5),
        ("OVERLAP_T_POSSIBLE", 2.0),
    ],
)
def test_thresholds_out_of_range_rejected(field: str, value: float) -> None:
    """Thresholds outside [0.0, 1.0] raise ValidationError."""
    kwargs = {field: value}
    with pytest.raises(ValidationError):
        Settings(**kwargs)


def test_sla_warn_day_greater_than_default_rejected() -> None:
    """SLA_WARN_DAY >= SLA_DEFAULT_DAYS raises ValidationError."""
    with pytest.raises(ValidationError) as exc:
        Settings(SLA_DEFAULT_DAYS=30, SLA_WARN_DAY=35)
    assert "SLA_WARN_DAY" in str(exc.value)


def test_cors_origins_parsing() -> None:
    """CORS_ORIGINS parses strings and JSON arrays."""
    s1 = Settings(CORS_ORIGINS="http://localhost:3000, http://localhost:8000")  # type: ignore[arg-type]
    assert s1.CORS_ORIGINS == ["http://localhost:3000", "http://localhost:8000"]

    s2 = Settings(CORS_ORIGINS='["http://example.com", "http://app.local"]')  # type: ignore[arg-type]
    assert s2.CORS_ORIGINS == ["http://example.com", "http://app.local"]


def test_demo_today_parsing() -> None:
    """DEMO_TODAY parses valid ISO date strings or empty string to None."""
    s1 = Settings(DEMO_TODAY="2026-11-20")  # type: ignore[arg-type]
    assert s1.DEMO_TODAY == date(2026, 11, 20)

    s2 = Settings(DEMO_TODAY="")  # type: ignore[arg-type]
    assert s2.DEMO_TODAY is None


def test_load_and_validate_settings_exits_on_error(monkeypatch: pytest.MonkeyPatch) -> None:
    """load_and_validate_settings terminates process with code 1 on fatal error."""
    monkeypatch.setenv("MATCH_T_AUTO", "0.50")
    monkeypatch.setenv("MATCH_T_REVIEW", "0.90")
    with pytest.raises(SystemExit) as exc:
        load_and_validate_settings()
    assert exc.value.code == 1


def test_env_example_file_valid() -> None:
    """Verify that backend/.env.example can be loaded cleanly as Settings."""
    import os
    env_example_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", ".env.example")
    )
    assert os.path.exists(env_example_path)

    # Initialize Settings pointing explicitly to .env.example
    settings = Settings(_env_file=env_example_path)
    assert settings.PROJECT_NAME == "Unicomply"
    assert settings.EMBEDDINGS_MODE in ["tfidf", "model"]
    assert settings.MATCH_T_REVIEW < settings.MATCH_T_AUTO
    assert settings.OVERLAP_T_POSSIBLE < settings.OVERLAP_T_PROBABLE

