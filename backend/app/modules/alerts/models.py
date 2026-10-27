"""In-app alerts (PRD §4.1, §4.6). `dedupe_key` makes each thing alert at most once per day per person."""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.core.enums import AlertSeverity, AlertType
from app.utils.time import utcnow


class AlertBase(SQLModel):
    type: AlertType
    severity: AlertSeverity
    recipient_id: int = Field(foreign_key="user.id", index=True)
    case_id: Optional[int] = Field(default=None, foreign_key="case.id", index=True)
    group_id: Optional[int] = Field(default=None, foreign_key="overlap_group.id")
    permanent_id: Optional[str] = Field(
        default=None, foreign_key="institution.permanent_id", index=True, max_length=12
    )
    title: str = Field(max_length=200)
    body: str = Field(max_length=1000)
    # type:recipient:entity:date, e.g. sla_breach:3:case-104:2026-11-20
    dedupe_key: str = Field(unique=True, index=True, max_length=200)


class Alert(AlertBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    is_read: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=utcnow, index=True)
