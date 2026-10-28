"""
Every dashboard number must open exactly the cases it counts (#49, PRD §7, §1A M8). The drill-down URLs are read from the
frontend source (features/dashboard/drilldown.ts), so the two sides cannot drift apart unnoticed.
"""

import re
from datetime import date, timedelta
from pathlib import Path
from typing import Dict
from urllib.parse import parse_qsl

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from tests.conftest import DEMO_PASSWORD, SEED_AS_OF

DRILLDOWN = Path(__file__).resolve().parents[2] / "frontend" / "src" / "features" / "dashboard" / "drilldown.ts"
API = "/api/v1"


@pytest.fixture(autouse=True)
def demo_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "DEMO_TODAY", SEED_AS_OF)  # the world is dated 2026-11-20


def kpi_queries() -> Dict[str, str]:
    block = re.search(r"export const KPI_QUERY[^{]*\{(.*?)\n\};", DRILLDOWN.read_text(), re.S)
    assert block, "KPI_QUERY not found in drilldown.ts"
    return {k: v for k, v in re.findall(r"^\s*(\w+):\s*'([^']*)'", block.group(1), re.M)}


def login(client: TestClient, email: str) -> Dict[str, str]:
    res = client.post(f"{API}/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    return {"Authorization": f"Bearer {res.json()['data']['access_token']}"}


def count(client: TestClient, headers: Dict[str, str], query: str) -> int:
    res = client.get(f"{API}/cases?limit=1&{query}", headers=headers)
    assert res.status_code == 200, f"{query}: {res.text}"
    return res.json()["pagination"]["total"]  # type: ignore[no-any-return]


@pytest.mark.parametrize("email", ["senior@aicte.example", "pgrc.head@aicte.example", "rb.head@aicte.example", "ro.central@aicte.example"])
def test_every_kpi_opens_exactly_the_cases_it_counts(full_client: TestClient, email: str) -> None:
    h = login(full_client, email)
    summary = full_client.get(f"{API}/dashboard/summary", headers=h).json()["data"]
    queries = kpi_queries()
    assert set(queries) == set(summary) - {"as_of"}
    for key, query in queries.items():
        if key == "open_overlaps":
            continue  # counts overlap groups, and opens the Overlap Center: see the next test
        assert count(full_client, h, query) == summary[key], f"{email}: KPI {key} ({query!r})"


def test_open_overlaps_opens_the_overlap_center_where_the_groups_are(full_client: TestClient) -> None:
    """The KPI counts groups awaiting a decision (status open): exactly the Probable + Possible tabs of the Overlap Center."""
    h = login(full_client, "senior@aicte.example")
    summary = full_client.get(f"{API}/dashboard/summary", headers=h).json()["data"]
    assert kpi_queries()["open_overlaps"] == "@/overlaps"  # a group count opens the list of groups, not of cases
    tabs = sum(
        full_client.get(f"{API}/overlaps?tier={tier}&status=open&limit=1", headers=h).json()["pagination"]["total"]
        for tier in ("probable", "possible")
    )
    assert tabs == summary["open_overlaps"] > 0


def test_each_workload_bar_opens_the_open_cases_of_its_bureau(full_client: TestClient) -> None:
    h = login(full_client, "senior@aicte.example")
    rows = full_client.get(f"{API}/dashboard/workload", headers=h).json()["data"]
    assert len(rows) > 3
    for row in rows:
        assert count(full_client, h, f"pending=true&bureau_id={row['bureau_id']}") == row["open"], row["bureau_code"]


def test_each_ageing_bar_opens_the_open_cases_received_in_its_range(full_client: TestClient) -> None:
    h = login(full_client, "senior@aicte.example")
    buckets = full_client.get(f"{API}/dashboard/ageing", headers=h).json()["data"]
    today = SEED_AS_OF
    for b in buckets:
        parts = ["pending=true", f"to={today - timedelta(days=b['min_days'])}"]
        if b["max_days"] is not None:
            parts.append(f"from={today - timedelta(days=b['max_days'])}")
        assert count(full_client, h, "&".join(parts)) == b["count"], b["label"]


def test_the_frontend_builds_the_same_urls(full_client: TestClient) -> None:
    """ageingUrl() in drilldown.ts: from = today - max_days, to = today - min_days."""
    source = DRILLDOWN.read_text()
    assert "from=${addDays(today, -bucket.max_days)}" in source and "to=${addDays(today, -bucket.min_days)}" in source
    assert "pending=true&bureau_id=" in source
