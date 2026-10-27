"""Tests for configuration parsing, defaults, and validation rules."""

import os
import subprocess
import sys
from datetime import date

import pytest
from pydantic import ValidationError

from app.core.config import Settings, load_and_validate_settings

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def test_default_settings_match_prd() -> None:
    """Defaults follow PRD §3: 21-day SLA, warning on day 17, multilingual model, no threshold overrides."""
    settings = Settings(_env_file=None)
    assert settings.PROJECT_NAME == "Unicomply"
    assert settings.SLA_DEFAULT_DAYS == 21
    assert settings.SLA_WARN_DAY == 17
    assert settings.EMBEDDING_MODEL_NAME == "paraphrase-multilingual-MiniLM-L12-v2"
    assert settings.JWT_EXPIRES_MINUTES == 720
    # Thresholds come from seed_data/thresholds.json unless overridden
    assert settings.MATCH_T_AUTO is None
    assert settings.MATCH_T_REVIEW is None
    assert settings.OVERLAP_T_PROBABLE is None
    assert settings.OVERLAP_T_POSSIBLE is None


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


def test_blank_threshold_overrides_mean_not_set(monkeypatch: pytest.MonkeyPatch) -> None:
    """`MATCH_T_AUTO=` (blank, as in .env.example) means 'use thresholds.json', not an error."""
    for name in ("MATCH_T_AUTO", "MATCH_T_REVIEW", "OVERLAP_T_PROBABLE", "OVERLAP_T_POSSIBLE"):
        monkeypatch.setenv(name, "")
    settings = Settings()
    assert settings.MATCH_T_AUTO is None
    assert settings.OVERLAP_T_POSSIBLE is None


def test_sla_warn_day_greater_than_default_rejected() -> None:
    """SLA_WARN_DAY >= SLA_DEFAULT_DAYS raises ValidationError."""
    with pytest.raises(ValidationError) as exc:
        Settings(SLA_DEFAULT_DAYS=21, SLA_WARN_DAY=25)
    assert "SLA_WARN_DAY" in str(exc.value)


def test_short_jwt_secret_rejected() -> None:
    """JWT_SECRET shorter than 32 characters is rejected."""
    with pytest.raises(ValidationError):
        Settings(JWT_SECRET="too-short")


def test_cors_origins_parsing() -> None:
    """CORS_ORIGINS is a comma-separated string exposed as a trimmed list."""
    s1 = Settings(CORS_ORIGINS="http://localhost:3000, http://localhost:8000/")
    assert s1.cors_origins == ["http://localhost:3000", "http://localhost:8000"]


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


@pytest.mark.parametrize(
    "bad_env",
    [
        {"MATCH_T_AUTO": "0.5", "MATCH_T_REVIEW": "0.9"},
        {"EMBEDDINGS_MODE": "foo"},
    ],
)
def test_app_import_exits_cleanly_on_bad_config(bad_env: dict) -> None:
    """Importing app.main (what uvicorn does) exits with code 1 and a readable message, not a traceback."""
    env = {**os.environ, **bad_env}
    result = subprocess.run(
        [sys.executable, "-c", "import app.main"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 1
    assert "[FATAL] Invalid Unicomply application configuration" in result.stderr
    assert "Traceback" not in result.stderr


def test_env_example_file_valid() -> None:
    """backend/.env.example loads cleanly as Settings, with blank overrides read as None."""
    env_example_path = os.path.join(BACKEND_DIR, ".env.example")
    assert os.path.exists(env_example_path)

    keys = [
        "APP_ENV", "JWT_SECRET", "DEMO_PASSWORD", "EMBEDDINGS_MODE", "MATCH_T_AUTO",
        "MATCH_T_REVIEW", "OVERLAP_T_PROBABLE", "OVERLAP_T_POSSIBLE", "DEMO_TODAY",
        "SLA_DEFAULT_DAYS", "SLA_WARN_DAY", "DATABASE_URL",
    ]
    saved = {k: os.environ.pop(k) for k in keys if k in os.environ}
    try:
        settings = Settings(_env_file=env_example_path)
    finally:
        os.environ.update(saved)
    assert settings.APP_ENV == "development"
    assert settings.EMBEDDINGS_MODE == "model"
    assert settings.MATCH_T_AUTO is None
    assert settings.DEMO_TODAY is None
    assert settings.SLA_DEFAULT_DAYS == 21
    assert settings.SLA_WARN_DAY == 17
