"""Field-level audit trail written by services on every state change (PRD §4.1, §6)."""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.utils.time import utcnow


class AuditLogBase(SQLModel):
    actor_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    entity: str = Field(max_length=40)  # e.g. "case", "overlap_group"
    entity_id: str = Field(max_length=40)
    field: str = Field(max_length=60)
    old_value: Optional[str] = Field(default=None, max_length=2000)
    new_value: Optional[str] = Field(default=None, max_length=2000)


class AuditLog(AuditLogBase, table=True):
    """Append-only: no update or delete endpoints (PRD §6)."""

    __tablename__ = "audit_log"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=utcnow, index=True)
