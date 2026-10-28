"""Pytest configuration, shared fixtures, test database, and test client."""

import os
import sys
from datetime import date
from typing import Callable, Dict, Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

# Ensure backend root is on sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Runs before the app is imported: required settings + an in-memory DB, so tests never
# depend on a developer's backend/.env or create app.db.
os.environ.update(
    APP_ENV="test",
    DATABASE_URL="sqlite://",
    JWT_SECRET="t" * 64,
    DEMO_PASSWORD="test-demo-pass",
    AUTH_DISABLED="false",
    ENABLE_REALTIME="false",
    ENABLE_SCHEDULER="false",
    SEED_ON_STARTUP="false",
    MATCHING_ENGINE="stub",  # the contract-world tests (tiny seed) expect the canned hero results; real-engine tests opt in
    SEED_SET="tiny",  # the hand-written hero world: small, and what the contract fixtures describe
    EMBEDDINGS_MODE="tfidf",
)

from app.core.config import Settings, get_settings
from app.core.db import get_session, sqlite_savepoints
from app.main import create_app
from app.seed import TINY_SEED_DIR, load_seed

DEMO_PASSWORD = "test-demo-pass"
# The date the seed files (and contract fixtures) are written for.
SEED_AS_OF = date(2026, 11, 20)


@pytest.fixture(name="test_settings")
def test_settings_fixture() -> Settings:
    """Provide deterministic test configuration."""
    return Settings(
        PROJECT_NAME="Unicomply Test",
        APP_ENV="test",
        DATABASE_URL="sqlite://",
        CORS_ORIGINS="http://testserver",
        JWT_SECRET="t" * 64,
        DEMO_PASSWORD=DEMO_PASSWORD,
        SEED_ON_STARTUP=False,
        EMBEDDINGS_MODE="tfidf",
        DEMO_TODAY=None,
    )


def _memory_engine() -> Engine:
    return sqlite_savepoints(
        create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    )


@pytest.fixture(name="test_engine")
def test_engine_fixture():
    """Create an isolated in-memory SQLite engine for tests."""
    engine = _memory_engine()
    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="seeded_engine")
def seeded_engine_fixture():
    """In-memory engine loaded with the tiny seed (seed_data/tiny), dated as the contract fixtures (2026-11-20)."""
    engine = _memory_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        load_seed(session, TINY_SEED_DIR, today=SEED_AS_OF)
    yield engine
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="session")
def session_fixture(test_engine) -> Generator[Session, None, None]:
    """Yield a test session bound to the in-memory test database."""
    with Session(test_engine) as session:
        yield session


def _client_for(engine: Engine, settings: Settings) -> Generator[TestClient, None, None]:
    app = create_app(custom_settings=settings)

    def override_get_session() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_settings] = lambda: settings

    with TestClient(app, raise_server_exceptions=False) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture(name="client")
def client_fixture(test_settings, test_engine) -> Generator[TestClient, None, None]:
    """Provide a TestClient connected to an app instance with overridden test database."""
    yield from _client_for(test_engine, test_settings)


@pytest.fixture(name="seeded_client")
def seeded_client_fixture(test_settings, seeded_engine) -> Generator[TestClient, None, None]:
    """TestClient over the seeded demo world."""
    yield from _client_for(seeded_engine, test_settings)


@pytest.fixture(name="auth_headers")
def auth_headers_fixture(seeded_client: TestClient) -> Callable[[str], Dict[str, str]]:
    """`auth_headers("pgrc.head@aicte.example")` → Authorization header for that persona."""

    def make(email: str) -> Dict[str, str]:
        res = seeded_client.post("/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD})
        assert res.status_code == 200, res.text
        return {"Authorization": f"Bearer {res.json()['data']['access_token']}"}

    return make


@pytest.fixture(name="real_engine")
def real_engine_fixture(monkeypatch: pytest.MonkeyPatch) -> None:
    """Run the request under the real matching engine (the test environment defaults to the stub)."""
    from app.matching import get_engine
    from app.modules.engine import service

    monkeypatch.setattr(service, "current_engine", lambda: get_engine("real"))
    service.reset_indexes()
    yield
    service.reset_indexes()


@pytest.fixture(name="full_engine")
def full_engine_fixture():
    """In-memory engine loaded with the full generated world (seed_data/), dated as the contract fixtures."""
    from app.seed import SEED_DIR

    engine = _memory_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        load_seed(session, SEED_DIR, today=SEED_AS_OF)
    yield engine
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="full_client")
def full_client_fixture(test_settings, full_engine, real_engine) -> Generator[TestClient, None, None]:
    """TestClient over the full world, running the real matching engine."""
    yield from _client_for(full_engine, test_settings)
