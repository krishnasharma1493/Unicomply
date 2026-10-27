"""
Centralized model registration module.

This module acts as the single import point for all SQLModel database tables
so that SQLModel.metadata registers every table before init_db() or reset_db() runs.

Domain table models arrive from issue #6 onward; import each one here, e.g.:
    from app.modules.users.models import User  # noqa: F401
"""

from sqlmodel import SQLModel

# Re-export SQLModel metadata for convenience
metadata = SQLModel.metadata

__all__ = ["SQLModel", "metadata"]
