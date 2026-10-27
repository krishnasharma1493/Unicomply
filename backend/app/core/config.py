"""Centralized application configuration using Pydantic Settings."""

import logging
import sys
from datetime import date
from functools import lru_cache
from typing import Any, List, Literal, Optional

from pydantic import Field, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("unicomply.config")


class Settings(BaseSettings):
    """Application settings: base blueprint §3 variables plus the PRD §3 domain block."""

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Server ──────────────────────────────────────────────────────────
    PROJECT_NAME: str = Field(default="Unicomply", description="Application name")
    APP_ENV: Literal["development", "demo", "test"] = Field(
        default="development", description="Runtime environment"
    )
    PORT: int = Field(default=8000, description="Port uvicorn listens on")
    API_V1_PREFIX: str = Field(default="/api/v1", description="API v1 route prefix")

    # ── Database ────────────────────────────────────────────────────────
    DATABASE_URL: str = Field(
        default="sqlite:///./app.db", description="SQLModel/SQLAlchemy database connection URL"
    )

    # ── Auth (demo-grade) ───────────────────────────────────────────────
    JWT_SECRET: str = Field(min_length=32, description="Secret used to sign JWTs")
    JWT_EXPIRES_MINUTES: int = Field(
        default=720, ge=5, le=60 * 48, description="Access token lifetime (default 12 hours)"
    )
    DEMO_PASSWORD: str = Field(min_length=8, description="Shared password for seeded personas")
    AUTH_DISABLED: bool = Field(
        default=False, description="Emergency switch: every request acts as the first seeded user"
    )

    # ── CORS ────────────────────────────────────────────────────────────
    CORS_ORIGINS: str = Field(
        default="http://localhost:5173",
        description="Comma-separated exact origins, no trailing slash",
    )

    # ── Demo data & optional features ───────────────────────────────────
    SEED_ON_STARTUP: bool = Field(default=True, description="Seed an empty DB on boot")
    ENABLE_REALTIME: bool = Field(default=False, description="python-socketio on the same port")
    ENABLE_SCHEDULER: bool = Field(default=False, description="asyncio background job loop")

    # ── Matching & overlap engine (PRD §3) ──────────────────────────────
    MATCHING_ENGINE: Literal["stub", "real"] = Field(
        default="stub", description="'stub' = canned hero results until the real engine is wired (#38)"
    )
    EMBEDDINGS_MODE: Literal["model", "tfidf"] = Field(
        default="model", description="'model' = sentence-transformers, 'tfidf' = offline fallback"
    )
    EMBEDDING_MODEL_NAME: str = Field(
        default="paraphrase-multilingual-MiniLM-L12-v2",
        description="Multilingual sentence-transformers model (downloaded before the event)",
    )
    MATCH_TOP_K: int = Field(
        default=5, ge=1, description="Candidates returned to intake preview / review queue"
    )
    # Thresholds live in seed_data/thresholds.json; these only override the file when set.
    MATCH_T_AUTO: Optional[float] = Field(default=None, description="Override: auto-link cutoff")
    MATCH_T_REVIEW: Optional[float] = Field(default=None, description="Override: review cutoff")
    OVERLAP_T_PROBABLE: Optional[float] = Field(
        default=None, description="Override: 'Coordination Required' cutoff"
    )
    OVERLAP_T_POSSIBLE: Optional[float] = Field(
        default=None, description="Override: 'Possible overlap' cutoff"
    )
    OVERLAP_WINDOW_DAYS: int = Field(
        default=180, ge=1, description="Compare with cases received / active in this window"
    )

    # ── SLA & alerts ────────────────────────────────────────────────────
    SLA_DEFAULT_DAYS: int = Field(
        default=21, ge=1, description="CPGRAMS disposal limit (DARPG, Aug 2024)"
    )
    SLA_WARN_DAY: int = Field(default=17, ge=1, description="SLA-warning alert from this day")
    NO_ACTION_REMINDER_DAYS: int = Field(
        default=7, ge=1, description="Reminder if no case action in N days"
    )
    JOB_TICK_SECONDS: int = Field(default=60, ge=1, description="Background job loop interval")

    # ── Demo ────────────────────────────────────────────────────────────
    DEMO_TODAY: Optional[date] = Field(
        default=None, description="Freeze 'today' so ageing/SLA numbers match the demo script"
    )

    @field_validator(
        "MATCH_T_AUTO",
        "MATCH_T_REVIEW",
        "OVERLAP_T_PROBABLE",
        "OVERLAP_T_POSSIBLE",
        "DEMO_TODAY",
        mode="before",
    )
    @classmethod
    def blank_to_none(cls, v: Any) -> Any:
        """Treat an empty env value (e.g. `MATCH_T_AUTO=`) as 'not set'."""
        if isinstance(v, str) and not v.strip():
            return None
        return v

    @model_validator(mode="after")
    def validate_rules_and_relationships(self) -> "Settings":
        """Validate threshold ranges, ordering, and SLA relationships."""
        # 1. Enforce thresholds in [0.0, 1.0]
        threshold_names = [
            "MATCH_T_AUTO",
            "MATCH_T_REVIEW",
            "OVERLAP_T_PROBABLE",
            "OVERLAP_T_POSSIBLE",
        ]
        for name in threshold_names:
            val = getattr(self, name)
            if val is not None and not (0.0 <= val <= 1.0):
                raise ValueError(f"Threshold '{name}' must be between 0.0 and 1.0; received {val}")

        # 2. MATCH_T_REVIEW must be strictly less than MATCH_T_AUTO (when both are overridden;
        #    app/matching/thresholds.py validates the merged file + env values)
        if self.MATCH_T_REVIEW is not None and self.MATCH_T_AUTO is not None:
            if self.MATCH_T_REVIEW >= self.MATCH_T_AUTO:
                raise ValueError(
                    f"MATCH_T_REVIEW ({self.MATCH_T_REVIEW}) must be strictly less than "
                    f"MATCH_T_AUTO ({self.MATCH_T_AUTO})"
                )

        # 3. OVERLAP_T_POSSIBLE must be strictly less than OVERLAP_T_PROBABLE
        if self.OVERLAP_T_POSSIBLE is not None and self.OVERLAP_T_PROBABLE is not None:
            if self.OVERLAP_T_POSSIBLE >= self.OVERLAP_T_PROBABLE:
                raise ValueError(
                    f"OVERLAP_T_POSSIBLE ({self.OVERLAP_T_POSSIBLE}) must be strictly less than "
                    f"OVERLAP_T_PROBABLE ({self.OVERLAP_T_PROBABLE})"
                )

        # 4. SLA relationships: SLA_WARN_DAY must be strictly less than SLA_DEFAULT_DAYS
        if self.SLA_WARN_DAY >= self.SLA_DEFAULT_DAYS:
            raise ValueError(
                f"SLA_WARN_DAY ({self.SLA_WARN_DAY}) must be strictly less than "
                f"SLA_DEFAULT_DAYS ({self.SLA_DEFAULT_DAYS})"
            )

        return self

    @property
    def cors_origins(self) -> List[str]:
        """CORS_ORIGINS as a list, trimmed and without trailing slashes."""
        return [o.strip().rstrip("/") for o in self.CORS_ORIGINS.split(",") if o.strip()]


def load_and_validate_settings() -> Settings:
    """
    Load settings and exit with code 1 and a human-readable message if the
    configuration is invalid. Never run with bad config.
    """
    try:
        return Settings()  # type: ignore[call-arg]  # values come from env vars / .env
    except ValidationError as exc:
        sys.stderr.write("\n[FATAL] Invalid Unicomply application configuration:\n")
        for err in exc.errors():
            loc = " -> ".join(str(part) for part in err.get("loc", []))
            msg = err.get("msg", "")
            sys.stderr.write(f"  * {loc or 'settings'}: {msg}\n")
        sys.stderr.write("\nCheck your environment variables or backend/.env file.\n\n")
        sys.stderr.flush()
        sys.exit(1)


@lru_cache
def get_settings() -> Settings:
    """Return the cached, validated settings instance (exits on invalid config)."""
    return load_and_validate_settings()
