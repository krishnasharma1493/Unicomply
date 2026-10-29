"""Category suggestion at intake (#61, PRD N1): the classifier, its endpoint, and staying off when there is no model."""

import json
from pathlib import Path
from typing import Callable, Dict, Iterator, List, Tuple

import pytest
from fastapi.testclient import TestClient

from app import eval as harness
from app.core.config import get_settings
from app.core.fixtures import load_fixture
from app.matching import classify
from app.modules.cases import classifier
from tests.test_contract_shapes import paths

Headers = Callable[[str], Dict[str, str]]
SEED = harness.SEED_DIR


def _labelled(split: str) -> Tuple[List[str], List[str]]:
    codes = {c["id"]: c["code"] for c in json.loads((SEED / "categories.json").read_text())["categories"]}
    ids = set(json.loads((SEED / "ground_truth.json").read_text())[f"{split}_case_ids"])
    rows = [c for c in json.loads((SEED / "cases.json").read_text())["cases"] if c["id"] in ids]
    return [f'{c["subject"]}. {c["description"]}' for c in rows], [codes[c["category_id"]] for c in rows]


@pytest.fixture(name="trained_model")
def trained_model_fixture(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    """Train on the dev split into a temp file and point the settings at it."""
    path = tmp_path / "category.joblib"
    texts, codes = _labelled("dev")
    classify.save(classify.train(texts, codes), path)
    monkeypatch.setattr(get_settings(), "CLASSIFIER_MODEL_PATH", path)
    classifier._loaded.clear()
    yield path
    classifier._loaded.clear()


def test_classifier_reaches_high_accuracy_on_the_test_split() -> None:
    model = classify.train(*_labelled("dev"))
    texts, codes = _labelled("test")
    assert model.accuracy(texts, codes) > 0.95


def test_confidence_is_a_ranking_score_between_zero_and_one() -> None:
    model = classify.train(*_labelled("dev"))
    for s in model.suggest_many(["The college refused to refund my fee after withdrawal", "", "xyz"]):
        assert s.code in model.codes
        assert 0 <= s.confidence <= 1


def test_training_needs_enough_labelled_examples() -> None:
    with pytest.raises(ValueError):
        classify.train(["a"] * 5, ["x"] * 5)


def test_a_missing_or_corrupt_file_loads_as_none(tmp_path: Path) -> None:
    assert classify.load(tmp_path / "absent.joblib") is None
    bad = tmp_path / "bad.joblib"
    bad.write_bytes(b"not a model")
    assert classify.load(bad) is None


def test_classify_endpoint_returns_a_category_and_confidence(seeded_client: TestClient, auth_headers: Headers, trained_model: Path) -> None:
    res = seeded_client.post("/api/v1/cases/101/classify", headers=auth_headers("intake@aicte.example"))
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert data["category_code"] == "fee_refund" and 0 < data["confidence"] <= 1
    expected = load_fixture("post_cases_id_classify")
    assert paths(res.json()) == paths(expected)


def test_classify_does_not_change_the_case(seeded_client: TestClient, auth_headers: Headers, trained_model: Path) -> None:
    before = seeded_client.get("/api/v1/cases/101", headers=auth_headers("senior@aicte.example")).json()
    seeded_client.post("/api/v1/cases/101/classify", headers=auth_headers("intake@aicte.example"))
    assert seeded_client.get("/api/v1/cases/101", headers=auth_headers("senior@aicte.example")).json() == before


def test_classify_is_off_without_a_model_file(seeded_client: TestClient, auth_headers: Headers, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "CLASSIFIER_MODEL_PATH", tmp_path / "absent.joblib")
    classifier._loaded.clear()
    res = seeded_client.post("/api/v1/cases/101/classify", headers=auth_headers("intake@aicte.example"))
    assert res.status_code == 503 and res.json()["error"]["code"] == "CLASSIFIER_UNAVAILABLE"


def test_classify_is_off_when_the_flag_is_off(seeded_client: TestClient, auth_headers: Headers, trained_model: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "CLASSIFIER_ENABLED", False)
    res = seeded_client.post("/api/v1/cases/101/classify", headers=auth_headers("intake@aicte.example"))
    assert res.status_code == 503


def test_classify_respects_roles_and_scope(seeded_client: TestClient, auth_headers: Headers, trained_model: Path) -> None:
    assert seeded_client.post("/api/v1/cases/101/classify", headers=auth_headers("ro.nw@aicte.example")).status_code == 403
    assert seeded_client.post("/api/v1/cases/999999/classify", headers=auth_headers("intake@aicte.example")).status_code == 404


def test_intake_records_the_suggestion_but_keeps_the_operators_category(seeded_client: TestClient, auth_headers: Headers, trained_model: Path) -> None:
    body = json.loads((Path(__file__).resolve().parents[2] / "contract" / "fixtures" / "requests" / "post_cases.json").read_text())
    res = seeded_client.post("/api/v1/cases", json=body, headers=auth_headers("intake@aicte.example"))
    assert res.status_code == 201, res.text
    case = res.json()["data"]["case"]
    assert case["category_suggested_id"] is not None
    assert case["category_id"] == body["category_id"]


def test_intake_leaves_the_suggestion_empty_without_a_model(seeded_client: TestClient, auth_headers: Headers, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "CLASSIFIER_MODEL_PATH", tmp_path / "absent.joblib")
    classifier._loaded.clear()
    body = json.loads((Path(__file__).resolve().parents[2] / "contract" / "fixtures" / "requests" / "post_cases.json").read_text())
    res = seeded_client.post("/api/v1/cases", json=body, headers=auth_headers("intake@aicte.example"))
    assert res.status_code == 201 and res.json()["data"]["case"]["category_suggested_id"] is None
