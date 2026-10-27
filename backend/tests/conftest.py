"""Pytest configuration, shared fixtures, test database, and test client."""

import os
import sys
from typing import Generator

import pytest
from fastapi.testclient import TestClient
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
    EMBEDDINGS_MODE="tfidf",
)

from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.main import create_app


@pytest.fixture(name="test_settings")
def test_settings_fixture() -> Settings:
    """Provide deterministic test configuration."""
    return Settings(
        PROJECT_NAME="Unicomply Test",
        APP_ENV="test",
        DATABASE_URL="sqlite://",
        CORS_ORIGINS="http://testserver",
        JWT_SECRET="t" * 64,
        DEMO_PASSWORD="test-demo-pass",
        EMBEDDINGS_MODE="tfidf",
        DEMO_TODAY=None,
    )


@pytest.fixture(name="test_engine")
def test_engine_fixture():
    """Create an isolated in-memory SQLite engine for tests."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="session")
def session_fixture(test_engine) -> Generator[Session, None, None]:
    """Yield a test session bound to the in-memory test database."""
    with Session(test_engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(test_settings, test_engine) -> Generator[TestClient, None, None]:
    """Provide a TestClient connected to an app instance with overridden test database."""
    app = create_app(custom_settings=test_settings)

    def override_get_session() -> Generator[Session, None, None]:
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_settings] = lambda: test_settings

    with TestClient(app, raise_server_exceptions=False) as client:
        yield client

    app.dependency_overrides.clear()
