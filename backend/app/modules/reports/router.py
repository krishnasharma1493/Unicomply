import csv
import io
from typing import Annotated, Any, Dict, Union

from fastapi import APIRouter, Query
from fastapi.responses import Response, StreamingResponse

from app.core.deps import CurrentUser
from app.core.fixtures import fixture
from app.core.schemas import Envelope, error_responses
from app.modules.reports.schemas import AnyReport, ReportKind, ReportParams

router = APIRouter(prefix="/reports", tags=["reports"])

_CSV_RESPONSE: Dict[Union[int, str], Dict[str, Any]] = {
    200: {
        "description": "JSON report, or with `format=csv` a CSV whose header is `columns[].label`",
        "content": {"text/csv": {"schema": {"type": "string"}}},
    }
}


def report_csv(report: Any) -> StreamingResponse:
    """CSV built server-side from the scoped report (never client-side, PRD §8)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([c.label for c in report.columns])
    for row in report.rows:
        values = row.model_dump(mode="json")
        writer.writerow(["" if values[c.key] is None else values[c.key] for c in report.columns])
    filename = f"unicomply-{report.kind}-{report.from_}-{report.to}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/{kind}",
    response_model=Envelope[AnyReport],
    responses={**_CSV_RESPONSE, **error_responses(400, 401, 403)},
)
def get_report(
    _: CurrentUser, kind: ReportKind, params: Annotated[ReportParams, Query()]
) -> Union[Envelope[AnyReport], Response]:
    """Bureau, region, institution, status, ageing, disposal rate, reopen rate, overlaps, periodic.

    Stub (#7): serves contract/fixtures/get_reports_<kind>.json until #37.
    """
    envelope = fixture(f"get_reports_{kind}", Envelope[AnyReport])
    if params.format == "csv":
        return report_csv(envelope.data)
    return envelope
