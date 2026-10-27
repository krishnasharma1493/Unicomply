"""
Centralized model registration module.

This module acts as the single import point for all SQLModel database tables
so that SQLModel.metadata registers every table before init_db() or reset_db() runs.

Domain models are implemented in upcoming issues (Issue #6 onward):
- app.modules.auth.models (User)
- app.modules.bureau.models (Bureau)
- app.modules.institutions.models (Institution, Trust, InstitutionAlias)
- app.modules.cases.models (Case, CaseAction, Category)
- app.modules.overlaps.models (OverlapGroup, OverlapPair, OverlapLink)
- app.modules.alerts.models (Alert)
- app.modules.audit.models (AuditLog)

Future models should be imported here:
    # from app.modules.auth.models import User # noqa: F401
"""

from sqlmodel import SQLModel

# Re-export SQLModel metadata for convenience
metadata = SQLModel.metadata

__all__ = ["SQLModel", "metadata"]
