from datetime import datetime

from app.modules.audit.models import AuditLogBase


class AuditLogCreate(AuditLogBase):
    pass


class AuditLogRead(AuditLogBase):
    """Append-only, so there is no update schema (PRD §6)."""

    id: int
    created_at: datetime
