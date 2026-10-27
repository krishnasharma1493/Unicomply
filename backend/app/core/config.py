"""Centralized application configuration using Pydantic Settings."""

import json
import logging
import sys
from datetime import date
from functools import lru_cache
from typing import Any, List, Literal, Optional, Union

from pydantic import Field, field_validator, model_validator
from pydantic_core import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("unicomply.config")


class Settings(BaseSettings):
    """Application settings with environment variable loading and validation."""

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Base settings
    PROJECT_NAME: str = Field(default="Unicomply", description="Application name")
    ENVIRONMENT: Literal["development", "staging", "production", "test"] = Field(
        default="development", description="Runtime environment"
    )
    DEBUG: bool = Field(default=True, description="Enable debug mode")
    API_V1_PREFIX: str = Field(default="/api/v1", description="API v1 route prefix")
    DATABASE_URL: str = Field(
        default="sqlite:///./app.db", description="SQLModel/SQLAlchemy database connection URL"
    )
    CORS_ORIGINS: Union[List[str], str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://localhost:3000"],
        description="Allowed CORS origins",
    )
    SECRET_KEY: str = Field(
        default="unicomply-dev-secret-key-change-in-production",
        description="Cryptographic secret key for signing tokens",
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=720, description="Access token expiration in minutes (default 12 hours)"
    )

    # PRD §3 Domain block
    EMBEDDINGS_MODE: Literal["model", "tfidf"] = Field(
        default="tfidf", description="Embeddings mode: 'model' or 'tfidf'"
    )
    EMBEDDING_MODEL_NAME: str = Field(
        default="sentence-transformers/all-MiniLM-L6-v2",
        description="Pretrained embedding model identifier",
    )
    MATCH_TOP_K: int = Field(
        default=5, ge=1, description="Number of top candidate matches to return"
    )
    MATCH_T_AUTO: Optional[float] = Field(
        default=0.85, description="Score threshold for automated institution resolution"
    )
    MATCH_T_REVIEW: Optional[float] = Field(
        default=0.65, description="Score threshold for routing to manual review"
    )
    OVERLAP_T_PROBABLE: Optional[float] = Field(
        default=0.75, description="Score threshold for probable cross-bureau overlap"
    )
    OVERLAP_T_POSSIBLE: Optional[float] = Field(
        default=0.50, description="Score threshold for possible cross-bureau overlap"
    )
    OVERLAP_WINDOW_DAYS: int = Field(
        default=180, ge=1, description="Historical lookback window in days for overlap search"
    )
    SLA_DEFAULT_DAYS: int = Field(
        default=30, ge=1, description="Default complaint resolution SLA in calendar days"
    )
    SLA_WARN_DAY: int = Field(
        default=20, ge=1, description="Elapsed day at which warning alert is raised"
    )
    NO_ACTION_REMINDER_DAYS: int = Field(
        default=7, ge=1, description="Days of officer inactivity before reminder is sent"
    )
    JOB_TICK_SECONDS: int = Field(
        default=60, ge=1, description="Polling interval in seconds for background jobs"
    )
    DEMO_TODAY: Optional[date] = Field(
        default=None, description="Deterministic mock date for demo / testing (YYYY-MM-DD)"
    )

    @field_validator("CORS_ORIGINS", mode="after")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> List[str]:
        """Support comma-separated string or JSON string for CORS_ORIGINS."""
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return []
            if v.startswith("[") and v.endswith("]"):
                try:
                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except Exception:
                    pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        if isinstance(v, list):
            return [str(origin).strip() for origin in v if str(origin).strip()]
        return v

    @field_validator("DEMO_TODAY", mode="before")
    @classmethod
    def parse_demo_today(cls, v: Any) -> Optional[Any]:
        """Convert empty string to None for DEMO_TODAY."""
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

        # 2. MATCH_T_REVIEW must be strictly less than MATCH_T_AUTO
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


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()


def load_and_validate_settings() -> Settings:
    """
    Load settings at application startup and exit with code 1 and a human-readable
    message if the configuration is invalid.
    """
    try:
        return Settings()
    except ValidationError as exc:
        sys.stderr.write(f"\n[FATAL] Invalid Unicomply application configuration:\n")
        for err in exc.errors():
            loc = " -> ".join(str(l) for l in err.get("loc", []))
            msg = err.get("msg", "")
            sys.stderr.write(f"  * {loc}: {msg}\n")
        sys.stderr.write("\nCheck your environment variables or .env file.\n\n")
        sys.stderr.flush()
        sys.exit(1)
