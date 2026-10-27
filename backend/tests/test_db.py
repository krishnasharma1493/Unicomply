"""Tests for database engine, session lifecycle, and table initialization."""

from typing import Generator
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Field, SQLModel, Session, create_engine, select
from sqlmodel.pool import StaticPool

from app.core.db import SessionDep, get_session, init_db, reset_db


class DummyItem(SQLModel, table=True):
    """Temporary test table for verifying database operations."""

    id: int | None = Field(default=None, primary_key=True)
    name: str


def test_init_db_and_reset_db() -> None:
    """init_db creates tables and reset_db drops and recreates tables."""
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    init_db(target_engine=test_engine)

    with Session(test_engine) as session:
        item = DummyItem(name="Test Item")
        session.add(item)
        session.commit()
        session.refresh(item)
        assert item.id is not None

        items = session.exec(select(DummyItem)).all()
        assert len(items) == 1

    # Reset DB should wipe data and recreate schema
    reset_db(target_engine=test_engine)

    with Session(test_engine) as session:
        items = session.exec(select(DummyItem)).all()
        assert len(items) == 0


def test_get_session_lifecycle() -> None:
    """get_session yields an active session that closes cleanly."""
    gen = get_session()
    session = next(gen)
    assert isinstance(session, Session)
    assert session.is_active

    # Consume generator to test closing
    try:
        next(gen)
    except StopIteration:
        pass


def test_session_dep_in_endpoint() -> None:
    """SessionDep injects an active session into route handlers."""
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(test_engine)

    app = FastAPI()
    router = APIRouter()

    @router.post("/items")
    def create_item(session: SessionDep, name: str):
        item = DummyItem(name=name)
        session.add(item)
        session.commit()
        session.refresh(item)
        return {"id": item.id, "name": item.name}

    app.include_router(router)

    def override_get_session() -> Generator[Session, None, None]:
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    client = TestClient(app)

    response = client.post("/items?name=FastAPI")
    assert response.status_code == 200
    assert response.json()["name"] == "FastAPI"
    assert response.json()["id"] == 1
