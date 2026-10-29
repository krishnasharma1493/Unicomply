from typing import Callable, Dict

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.enums import MatchStatus, ReviewStatus
from app.modules.cases.models import Case
from app.modules.reviews.models import MatchReview

Headers = Callable[[str], Dict[str, str]]
INTAKE = "intake@aicte.example"
SENIOR = "senior@aicte.example"
RB = "rb.head@aicte.example"
RO = "ro.nw@aicte.example"


def test_queue_is_paginated_oldest_first_and_role_gated(seeded_client: TestClient, auth_headers: Headers):
    response = seeded_client.get("/api/v1/reviews?status=pending", headers=auth_headers(INTAKE))
    assert response.status_code == 200
    rows = response.json()["data"]
    assert len(rows) == 2 and rows[0]["id"] == 2
    for persona in (RB, RO):
        forbidden = seeded_client.get("/api/v1/reviews", headers=auth_headers(persona))
        assert forbidden.status_code == 403


def test_permanent_id_decision_updates_case_and_closes_queue(seeded_client, auth_headers, seeded_engine):
    response = seeded_client.post("/api/v1/reviews/1/decide", headers=auth_headers(INTAKE),
                                  json={"permanent_id": "1-43657291568"})
    assert response.status_code == 200, response.text
    body = response.json()["data"]
    assert body["review"]["status"] == "resolved"
    assert body["case"]["permanent_id"] == "1-43657291568"
    assert body["case"]["match_status"] == "reviewed"
    assert body["alias"]["source"] == "review"
    with Session(seeded_engine) as session:
        assert session.get(MatchReview, 1).status == ReviewStatus.resolved
        assert session.get(Case, 112).match_status == MatchStatus.reviewed
    again = seeded_client.post("/api/v1/reviews/1/decide", headers=auth_headers(INTAKE),
                               json={"permanent_id": "1-43657291568"})
    assert again.status_code == 409 and again.json()["error"]["code"] == "ALREADY_DECIDED"


def test_none_decision_closes_review_but_keeps_case_unresolved(seeded_client, auth_headers, seeded_engine):
    response = seeded_client.post("/api/v1/reviews/2/decide", headers=auth_headers(SENIOR), json={"none": True})
    assert response.status_code == 200, response.text
    assert response.json()["data"]["review"]["status"] == "resolved"
    assert response.json()["data"]["review"]["decided_permanent_id"] is None
    with Session(seeded_engine) as session:
        case = session.get(Case, 113)
        assert case.permanent_id is None and case.match_status == MatchStatus.unresolved


def test_unknown_permanent_id_is_not_found(seeded_client, auth_headers):
    response = seeded_client.post("/api/v1/reviews/1/decide", headers=auth_headers(INTAKE),
                                  json={"permanent_id": "1-9999999999"})
    assert response.status_code == 404
