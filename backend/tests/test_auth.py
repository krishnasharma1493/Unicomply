"""Persona login, /users/me, AUTH_DISABLED and /demo/reset (#6)."""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Dict, Generator

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import Settings
from app.core.enums import CaseStatus
from app.core.security import ALGORITHM
from app.modules.cases.models import Case
from tests.conftest import DEMO_PASSWORD, _client_for

FIXTURES = Path(__file__).resolve().parents[2] / "contract" / "fixtures"

PERSONAS = [
    # email, role, bureau_id, region, is_admin
    ("senior@aicte.example", "senior_mgmt", None, None, True),
    ("pgrc.head@aicte.example", "bureau_head", 2, None, False),
    ("rb.head@aicte.example", "bureau_head", 1, None, False),
    ("ro.central@aicte.example", "ro_officer", 5, "central", False),
    ("intake@aicte.example", "intake_operator", None, None, False),
]


def login(client: TestClient, email: str, password: str = DEMO_PASSWORD):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


@pytest.mark.parametrize("email, role, bureau_id, region, is_admin", PERSONAS)
def test_each_persona_logs_in_and_reads_me(
    seeded_client: TestClient, email: str, role: str, bureau_id, region, is_admin: bool
) -> None:
    res = login(seeded_client, email)
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["data"]["token_type"] == "bearer"
    user = body["data"]["user"]
    assert (user["email"], user["role"], user["bureau_id"], user["region"], user["is_admin"]) == (
        email, role, bureau_id, region, is_admin,
    )

    me = seeded_client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {body['data']['access_token']}"}
    )
    assert me.status_code == 200
    assert me.json() == {"success": True, "data": user}


def test_login_and_me_match_the_contract_fixtures(seeded_client: TestClient) -> None:
    """Same shape and values as contract/fixtures (#2): the real API answers like the mocks."""
    body = login(seeded_client, "senior@aicte.example").json()
    expected = json.loads((FIXTURES / "post_auth_login_senior.json").read_text())
    assert set(body["data"]) == set(expected["data"])
    assert body["data"]["user"] == expected["data"]["user"]
    me_expected = json.loads((FIXTURES / "get_users_me_ro_central.json").read_text())
    token = login(seeded_client, "ro.central@aicte.example").json()["data"]["access_token"]
    me = seeded_client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json() == me_expected


def test_token_is_a_12_hour_jwt_for_the_user(seeded_client: TestClient, test_settings: Settings) -> None:
    token = login(seeded_client, "rb.head@aicte.example").json()["data"]["access_token"]
    payload = jwt.decode(token, test_settings.JWT_SECRET, algorithms=[ALGORITHM])
    assert payload["sub"] == "3"
    assert payload["exp"] - payload["iat"] == 12 * 60 * 60


def test_email_is_case_insensitive(seeded_client: TestClient) -> None:
    assert login(seeded_client, "  PGRC.Head@AICTE.example ").status_code == 200


@pytest.mark.parametrize(
    "email, password",
    [
        ("senior@aicte.example", "wrong-password"),  # wrong password
        ("nobody@aicte.example", DEMO_PASSWORD),  # unknown email
        ("sunita.mishra@aicte.example", DEMO_PASSWORD),  # case officer: data only, no login
    ],
)
def test_bad_logins_get_one_generic_401(seeded_client: TestClient, email: str, password: str) -> None:
    res = login(seeded_client, email, password)
    assert res.status_code == 401
    assert res.json() == {
        "success": False,
        "error": {"code": "UNAUTHORIZED", "message": "Invalid email or password"},
    }


def test_me_requires_a_valid_token(seeded_client: TestClient, test_settings: Settings) -> None:
    res = seeded_client.get("/api/v1/users/me")
    assert res.status_code == 401 and res.json()["error"]["code"] == "UNAUTHORIZED"

    res = seeded_client.get("/api/v1/users/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert res.status_code == 401 and res.json()["error"]["code"] == "TOKEN_INVALID"

    past = datetime.now(timezone.utc) - timedelta(hours=13)
    expired = jwt.encode(
        {"sub": "1", "iat": past, "exp": past + timedelta(hours=12)},
        test_settings.JWT_SECRET,
        algorithm=ALGORITHM,
    )
    res = seeded_client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {expired}"})
    assert res.status_code == 401 and res.json()["error"]["code"] == "TOKEN_EXPIRED"

    forged = jwt.encode({"sub": "1"}, "x" * 64, algorithm=ALGORITHM)
    res = seeded_client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {forged}"})
    assert res.status_code == 401 and res.json()["error"]["code"] == "TOKEN_INVALID"


@pytest.fixture(name="auth_disabled_client")
def auth_disabled_client_fixture(test_settings: Settings, seeded_engine) -> Generator[TestClient, None, None]:
    yield from _client_for(seeded_engine, test_settings.model_copy(update={"AUTH_DISABLED": True}))


def test_auth_disabled_acts_as_the_first_user(auth_disabled_client: TestClient) -> None:
    res = auth_disabled_client.get("/api/v1/users/me")
    assert res.status_code == 200
    assert res.json()["data"]["email"] == "senior@aicte.example"


# ── /demo/reset ──────────────────────────────────────────────────────────


@pytest.mark.parametrize("email", [p[0] for p in PERSONAS if not p[4]])
def test_demo_reset_is_admin_only(
    seeded_client: TestClient, auth_headers: Callable[[str], Dict[str, str]], email: str
) -> None:
    res = seeded_client.post("/api/v1/demo/reset", headers=auth_headers(email))
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "FORBIDDEN"


def test_demo_reset_restores_the_seed_and_keeps_tokens_valid(
    seeded_client: TestClient, seeded_engine, auth_headers: Callable[[str], Dict[str, str]]
) -> None:
    senior = auth_headers("senior@aicte.example")
    with Session(seeded_engine) as session:
        case = session.get(Case, 101)
        assert case is not None
        case.status = CaseStatus.disposed
        session.add(case)
        session.commit()

    res = seeded_client.post("/api/v1/demo/reset", headers=senior)
    assert res.status_code == 200
    assert res.json() == json.loads((FIXTURES / "post_demo_reset.json").read_text())

    with Session(seeded_engine) as session:
        restored = session.get(Case, 101)
        assert restored is not None and restored.status == CaseStatus.under_process
    # Ids are stable across resets, so the same token still works.
    assert seeded_client.get("/api/v1/users/me", headers=senior).status_code == 200
