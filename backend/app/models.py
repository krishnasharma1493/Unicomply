"""
Centralized model registration module.

This module acts as the single import point for all SQLModel database tables
so that SQLModel.metadata registers every table before init_db() or reset_db() runs.

Every table model (PRD §4.1) is imported below; add new ones here.
"""

from sqlmodel import SQLModel

from app.modules.alerts.models import Alert  # noqa: F401
from app.modules.audit.models import AuditLog  # noqa: F401
from app.modules.cases.models import Case, CaseAction  # noqa: F401
from app.modules.institutions.models import Institution, InstitutionAlias, Trust  # noqa: F401
from app.modules.meta.models import Bureau, Category  # noqa: F401
from app.modules.overlaps.models import OverlapGroup, OverlapLink, OverlapPair  # noqa: F401
from app.modules.reviews.models import MatchReview  # noqa: F401
from app.modules.users.models import User  # noqa: F401

# Re-export SQLModel metadata for convenience
metadata = SQLModel.metadata

__all__ = ["SQLModel", "metadata"]
