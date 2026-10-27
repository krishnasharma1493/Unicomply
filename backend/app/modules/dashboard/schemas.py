"""Dashboard API contract (PRD §5, §7 Dashboard; PS feature 4). All numbers are scoped to the caller."""

from datetime import date
from typing import Dict, Literal, Optional

from pydantic import BaseModel, Field

from app.core.enums import CaseStatus, Region

AgeingBucketKey = Literal["0_7", "8_14", "15_21", "22_45", "45_plus"]


class DashboardSummary(BaseModel):
    """The 8 KPI cards; derived from cases, never stored (PRD §4.1)."""

    as_of: date
    total: int
    pending: int
    under_process: int
    disposed: int
    transferred: int
    escalated: int
    beyond_sla: int
    open_overlaps: int


class WorkloadRow(BaseModel):
    """Open cases per current bureau (GET /dashboard/workload)."""

    bureau_id: int
    bureau_code: str
    bureau_name: str
    open: int
    beyond_sla: int
    by_status: Dict[CaseStatus, int]  # open statuses only


class AgeingBucket(BaseModel):
    """Open cases by days since `received_at` (GET /dashboard/ageing)."""

    bucket: AgeingBucketKey
    label: str
    min_days: int
    max_days: Optional[int]  # null for the open-ended 45+ bucket
    count: int


class InstitutionStatusRow(BaseModel):
    """Institution-wise status table (GET /dashboard/institutions)."""

    permanent_id: str
    name: str
    district: str
    state: str
    region: Region
    total: int
    open: int
    beyond_sla: int
    open_overlap_groups: int
    by_status: Dict[CaseStatus, int]


class DashboardInstitutionsParams(BaseModel):
    limit: int = Field(default=10, ge=1, le=100)
