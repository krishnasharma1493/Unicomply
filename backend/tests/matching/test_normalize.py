import json

import pytest

from app.matching.normalize import (
    acronym_of,
    extract_district_hint,
    extract_permanent_id,
    load_abbreviations,
    normalize_name,
    tokens,
)
from app.matching.thresholds import load_thresholds


def test_abbreviations_and_punctuation_normalize_to_registry_form():
    abbreviations = load_abbreviations()
    messy = normalize_name("Vindhya Valley Inst. of Engg. & Tech.", abbreviations)
    registry = normalize_name("Vindhya Valley Institute of Engineering & Technology", abbreviations)
    assert messy == registry == "VINDHYA VALLEY INSTITUTE ENGINEERING TECHNOLOGY"


def test_acronym_district_alias_and_token_helpers():
    abbreviations = load_abbreviations()
    text = "VVIET Jabalpur"
    assert "VVIET" in tokens(normalize_name(text, abbreviations))
    assert extract_district_hint(text, {"JABALPUR": "JABALPUR", "JBP": "JABALPUR"}) == "JABALPUR"
    assert extract_district_hint("VVIET JBP", {"JABALPUR": "JABALPUR", "JBP": "JABALPUR"}) == "JABALPUR"
    assert acronym_of("VINDHYA VALLEY INSTITUTE ENGINEERING TECHNOLOGY") == "VVIET"


def test_permanent_id_extraction_is_bounded():
    assert extract_permanent_id("please review 1-4812730561 urgently") == "1-4812730561"
    assert extract_permanent_id("id 2-4812730561") is None
    assert extract_permanent_id("1-12345") is None


def test_threshold_loader_overrides_and_order_validation(tmp_path):
    thresholds = load_thresholds(overrides={"MATCH_T_AUTO": 0.9, "MATCH_T_REVIEW": 0.6})
    assert (thresholds.t_auto, thresholds.t_review) == (0.9, 0.6)
    path = tmp_path / "thresholds.json"
    data = json.loads((__import__("pathlib").Path(__file__).resolve().parents[2] / "seed_data" / "thresholds.json").read_text())
    data["t_review"] = data["t_auto"]
    path.write_text(json.dumps(data))
    with pytest.raises(ValueError, match="t_review must be less than"):
        load_thresholds(path)


def test_threshold_overrides_reject_invalid_order():
    with pytest.raises(ValueError, match="t_review must be less than"):
        load_thresholds(overrides={"MATCH_T_AUTO": 0.5, "MATCH_T_REVIEW": 0.6})
