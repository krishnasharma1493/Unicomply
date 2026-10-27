from datetime import datetime
from typing import Optional

from pydantic import BaseModel
from sqlmodel import SQLModel

from app.core.schemas import PageParams
from app.modules.alerts.models import AlertBase

# ── Table schemas (#6) ───────────────────────────────────────────────────


class AlertCreate(AlertBase):
    pass


class AlertUpdate(SQLModel):
    is_read: Optional[bool] = None


class AlertRecord(AlertBase):
    """Every stored §4.1 `alert` column."""

    id: int
    is_read: bool
    created_at: datetime


# ── API contract (PRD §5) ────────────────────────────────────────────────


class AlertRead(AlertRecord):
    """An alert as the API returns it; the extra fields let the UI group per institution per day."""

    case_ref: Optional[str]
    institution_name: Optional[str]


class AlertListParams(PageParams):
    unread_only: bool = False


class ReadAllResult(BaseModel):
    updated: int
