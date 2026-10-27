"""Reports API contract (PRD §5, §12.4; PS feature 8). With format=csv the header is `columns[].label`."""

from datetime import date, datetime
from typing import Annotated, Generic, List, Literal, Optional, TypeVar, Union

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import CaseStatus, OverlapGroupStatus, OverlapLevel, OverlapTier, Region
from app.modules.dashboard.schemas import AgeingBucketKey
from app.modules.institutions.schemas import CaseCounts

ReportKind = Literal[
    "bureau", "region", "institution", "status", "ageing", "disposal_rate", "reopen_rate", "overlaps", "periodic"
]
ReportFormat = Literal["json", "csv"]


class ReportParams(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: Optional[date] = Field(default=None, alias="from")
    to: Optional[date] = None
    group_by: Optional[str] = Field(default=None, max_length=20, description="month | quarter for periodic")
    format: ReportFormat = "json"


class ReportColumn(BaseModel):
    key: str
    label: str


RowT = TypeVar("RowT")
TotalsT = TypeVar("TotalsT")


class Report(BaseModel, Generic[RowT, TotalsT]):
    model_config = ConfigDict(populate_by_name=True)

    from_: date = Field(alias="from")
    to: date
    group_by: str
    generated_at: datetime
    columns: List[ReportColumn]
    rows: List[RowT]
    totals: TotalsT


# ── Rows and totals per kind ─────────────────────────────────────────────


class BureauReportRow(CaseCounts):
    bureau_code: str
    bureau_name: str
    avg_open_age_days: Optional[float]


class RegionReportRow(CaseCounts):
    region: Optional[Region]  # null = institution not yet resolved
    region_name: str


class InstitutionReportRow(CaseCounts):
    permanent_id: str
    name: str
    region: Region
    reopened: int
    overlap_groups: int


class StatusReportRow(BaseModel):
    status: CaseStatus
    status_name: str
    count: int


class StatusReportTotals(BaseModel):
    count: int


class AgeingReportRow(BaseModel):
    bucket: AgeingBucketKey
    label: str
    open: int
    beyond_sla: int


class AgeingReportTotals(BaseModel):
    open: int
    beyond_sla: int


class DisposalRateTotals(BaseModel):
    received: int
    disposed: int
    disposal_rate: Optional[float]  # null when nothing was received


class DisposalRateRow(DisposalRateTotals):
    bureau_code: str


class ReopenRateTotals(BaseModel):
    disposed: int  # disposed at least once
    reopened: int
    reopen_rate: Optional[float]  # null when nothing was disposed


class ReopenRateRow(ReopenRateTotals):
    bureau_code: str


class OverlapsReportTotals(BaseModel):
    groups: int
    cases: int


class OverlapsReportRow(OverlapsReportTotals):
    level: OverlapLevel
    tier: OverlapTier
    status: OverlapGroupStatus


class PeriodicReportTotals(BaseModel):
    received: int
    disposed: int
    reopened: int


class PeriodicReportRow(PeriodicReportTotals):
    period: str  # YYYY-MM (monthly) or YYYY-Qn (quarterly)


class BureauReport(Report[BureauReportRow, CaseCounts]):
    kind: Literal["bureau"]


class RegionReport(Report[RegionReportRow, CaseCounts]):
    kind: Literal["region"]


class InstitutionReport(Report[InstitutionReportRow, CaseCounts]):
    kind: Literal["institution"]


class StatusReport(Report[StatusReportRow, StatusReportTotals]):
    kind: Literal["status"]


class AgeingReport(Report[AgeingReportRow, AgeingReportTotals]):
    kind: Literal["ageing"]


class DisposalRateReport(Report[DisposalRateRow, DisposalRateTotals]):
    kind: Literal["disposal_rate"]


class ReopenRateReport(Report[ReopenRateRow, ReopenRateTotals]):
    kind: Literal["reopen_rate"]


class OverlapsReport(Report[OverlapsReportRow, OverlapsReportTotals]):
    kind: Literal["overlaps"]


class PeriodicReport(Report[PeriodicReportRow, PeriodicReportTotals]):
    kind: Literal["periodic"]


AnyReport = Annotated[
    Union[
        BureauReport,
        RegionReport,
        InstitutionReport,
        StatusReport,
        AgeingReport,
        DisposalRateReport,
        ReopenRateReport,
        OverlapsReport,
        PeriodicReport,
    ],
    Field(discriminator="kind"),
]
