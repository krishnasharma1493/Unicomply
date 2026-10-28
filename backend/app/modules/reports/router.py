import csv
import io
from typing import Annotated, Any, Dict, Union

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response, StreamingResponse

from app.core.db import SessionDep
from app.core.deps import CurrentUser
from app.core.enums import Role
from app.core.errors import ForbiddenError
from app.core.schemas import Envelope, error_responses
from app.modules.reports import service
from app.modules.reports.schemas import AnyReport, ReportKind, ReportParams
from app.modules.users.models import User

router = APIRouter(prefix="/reports", tags=["reports"])

_CSV_RESPONSE: Dict[Union[int, str], Dict[str, Any]] = {
    200: {
        "description": "JSON report, or with `format=csv` a CSV whose header is `columns[].label`",
        "content": {"text/csv": {"schema": {"type": "string"}}},
    }
}


def _report_reader(user: CurrentUser) -> User:
    """Senior management, bureau heads and admins read reports; RO officers and intake operators do not."""
    if user.role not in (Role.senior_mgmt, Role.bureau_head) and not user.is_admin:
        raise ForbiddenError()
    return user


ReportReader = Annotated[User, Depends(_report_reader)]


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
    user: ReportReader, session: SessionDep, kind: ReportKind, params: Annotated[ReportParams, Query()]
) -> Union[Envelope[AnyReport], Response]:
    """Bureau, region, institution, status, ageing, disposal rate, reopen rate, overlaps, periodic.

    Counts cover the cases the caller may open, received between `from` and `to` (default: the last
    three calendar months). `format=csv` downloads the same rows.
    """
    report = service.build(session, user, kind, params)
    if params.format == "csv":
        return report_csv(report)
    return Envelope(data=report)
