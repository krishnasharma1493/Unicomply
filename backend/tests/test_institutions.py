from typing import Callable, Dict

from fastapi.testclient import TestClient

Headers = Callable[[str], Dict[str, str]]
SENIOR = "senior@aicte.example"
RO = "ro.central@aicte.example"
INTAKE = "intake@aicte.example"


def test_registry_search_matches_partial_names_ids_and_filters(seeded_client: TestClient, auth_headers: Headers):
    headers = auth_headers(SENIOR)
    by_name = seeded_client.get("/api/v1/institutions?q=Vindhya%20Valley", headers=headers)
    by_id = seeded_client.get("/api/v1/institutions?q=1-4812730561", headers=headers)
    assert by_name.status_code == 200 and any(row["permanent_id"] == "1-4812730561" for row in by_name.json()["data"])
    assert [row["permanent_id"] for row in by_id.json()["data"]] == ["1-4812730561"]
    acronym = seeded_client.get("/api/v1/institutions?q=VVIET", headers=headers)
    assert any(row["permanent_id"] == "1-4812730561" for row in acronym.json()["data"])


def test_institution_360_groups_hero_cases_and_exposes_trust_family(seeded_client: TestClient, auth_headers: Headers):
    response = seeded_client.get("/api/v1/institutions/1-4812730561", headers=auth_headers(SENIOR))
    assert response.status_code == 200, response.text
    body = response.json()["data"]
    assert {case["case_ref"] for column in body["cases_by_bureau"] for case in column["cases"]} == {
        "PGRC/2026/00412", "RB/2026/00087", "RO-CRO/2026/00133"
    }
    assert {column["bureau_code"] for column in body["cases_by_bureau"]} == {"PGRC", "RB", "RO-CRO"}
    assert body["trust"]["name"]
    assert "1-4812730987" in {inst["permanent_id"] for inst in body["trust_institutions"]}
    assert body["overlap_groups"]


def test_out_of_scope_institution_cases_are_summary_cards(seeded_client: TestClient, auth_headers: Headers):
    body = seeded_client.get("/api/v1/institutions/1-3156608124", headers=auth_headers(RO)).json()["data"]
    cards = [case for column in body["cases_by_bureau"] for case in column["cases"]
             if case.get("in_scope") is False]
    assert cards
    assert all("description" not in case and "complainant_name" not in case for case in cards)


def test_resolve_preview_role_gate_and_registered_candidates(seeded_client: TestClient, auth_headers: Headers):
    path = "/api/v1/institutions/resolve"
    body = {"raw_text": "Vindhya Valley Inst. of Engg.", "state": "Madhya Pradesh", "district": "Jabalpur"}
    forbidden = seeded_client.post(path, json=body, headers=auth_headers(RO))
    assert forbidden.status_code == 403
    response = seeded_client.post(path, json=body, headers=auth_headers(INTAKE))
    assert response.status_code == 200, response.text
    assert response.json()["data"]["candidates"][0]["permanent_id"] == "1-4812730561"


def test_meta_is_database_backed_and_includes_demo_date(seeded_client: TestClient, auth_headers: Headers):
    response = seeded_client.get("/api/v1/meta", headers=auth_headers(SENIOR))
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data["bureaus"]) == 14 and len(data["categories"]) == 12
    assert data["today"]
    assert any(officer["id"] == 6 for officer in data["officers"])
