"""The demo must survive no Wi-Fi and a missing model (#45, PRD A8, §10B)."""

import logging
import time
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.matching import embed
from app.matching.embed import make_embedder
from app.matching.index import build_index
from tests.test_intake_real import HERO_REFS, VVIET, hero_body, login


class NoModel:
    """A sentence-transformers model that cannot be loaded: no folder, no network."""

    def __init__(self, *_: Any, **__: Any) -> None:
        raise OSError("model folder not found and no network to download it")


def test_a_missing_model_falls_back_to_tfidf_with_one_clear_log_line(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    monkeypatch.setattr(embed, "_SentenceTransformerEmbedder", NoModel)
    with caplog.at_level(logging.WARNING, logger="unicomply.matching"):
        embedder = make_embedder("model", "paraphrase-multilingual-MiniLM-L12-v2")
    assert embedder.mode == "tfidf"
    [line] = [r.getMessage() for r in caplog.records if "falling back" in r.getMessage()]
    assert "paraphrase-multilingual-MiniLM-L12-v2" in line and "OSError" in line and "no network" in line


def test_the_package_not_installed_is_the_same_story(caplog: pytest.LogCaptureFixture) -> None:
    pytest.importorskip("numpy")
    try:
        import sentence_transformers  # noqa: F401
        pytest.skip("sentence-transformers is installed here")
    except ImportError:
        pass
    with caplog.at_level(logging.WARNING, logger="unicomply.matching"):
        assert make_embedder("model", "any").mode == "tfidf"
    assert any("ImportError" in r.getMessage() or "RuntimeError" in r.getMessage() for r in caplog.records)


def test_the_accuracy_harness_never_falls_back_silently(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(embed, "_SentenceTransformerEmbedder", NoModel)
    with pytest.raises(OSError):
        make_embedder("model", "x", fallback=False)  # a report must not say `model` while measuring `tfidf`


def test_tfidf_mode_never_touches_the_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(embed, "_SentenceTransformerEmbedder", NoModel)
    assert make_embedder("tfidf", "x").mode == "tfidf"


def test_the_app_started_in_model_mode_without_the_model_still_flags_the_hero(
    full_client: TestClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    from app.modules.engine import service

    monkeypatch.setattr(embed, "_SentenceTransformerEmbedder", NoModel)
    monkeypatch.setattr(get_settings(), "EMBEDDINGS_MODE", "model")  # the shipped default
    service.reset_indexes()
    with caplog.at_level(logging.INFO):
        started = time.perf_counter()
        res = full_client.post("/api/v1/cases", json=hero_body(), headers=login(full_client, "intake@aicte.example"))
        elapsed = time.perf_counter() - started
    assert res.status_code == 201, res.text
    data = res.json()["data"]
    assert (data["case"]["permanent_id"], data["resolution"]["decision"]) == (VVIET, "auto")
    [group] = data["overlaps"]
    assert {c["case_ref"] for c in group["cases"]} == HERO_REFS
    assert elapsed < 2.0  # includes building the index from scratch
    assert sum("falling back" in r.getMessage() for r in caplog.records) == 1  # said once, not per request


def test_the_index_is_reused_across_restarts_and_its_timing_is_logged(
    full_engine, caplog: pytest.LogCaptureFixture
) -> None:
    from sqlmodel import Session

    from app.modules.engine import service

    with Session(full_engine) as session, caplog.at_level(logging.INFO, logger="unicomply.matching"):
        service.reset_indexes()
        service.current_index(session)
        service.reset_indexes()  # a restart: nothing in memory
        service.current_index(session)
    lines = [r.getMessage() for r in caplog.records if r.getMessage().startswith("Match index")]
    assert any("built" in l or "loaded from cache" in l for l in lines)
    assert "loaded from cache" in lines[-1] and "ms" in lines[-1]  # the second start reads the cache


def test_each_intake_logs_how_long_it_took(full_client: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger="unicomply.cases"):
        full_client.post("/api/v1/cases", json=hero_body(), headers=login(full_client, "intake@aicte.example"))
    [line] = [r.getMessage() for r in caplog.records if "created" in r.getMessage()]
    assert " ms)" in line
    for secret in ("Sushila", "mark sheets", "vindya"):
        assert secret not in line  # ids and timings only
