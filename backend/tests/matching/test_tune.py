"""The tuner (#44): dev split only, honest objectives, and the file it writes."""

import json
from types import SimpleNamespace
from pathlib import Path
from typing import Any, List

import pytest

from app.matching import tune
from app.matching.thresholds import load_thresholds

WIN_AUTO, WIN_REVIEW = tune.T_AUTO[5], tune.T_REVIEW[2]  # points on the search grid
BASE = json.loads((Path(__file__).resolve().parents[2] / "seed_data" / "thresholds.json").read_text())


def test_it_refuses_the_test_split(tmp_path: Path) -> None:
    (tmp_path / "thresholds.json").write_text(json.dumps(BASE))
    with pytest.raises(ValueError, match="dev split only"):
        tune.run(split="test", seed_dir=tmp_path, write=False)


def test_every_candidate_is_a_valid_thresholds_file(tmp_path: Path) -> None:
    candidates = list(tune.resolution_candidates(BASE)) + list(tune.overlap_candidates(BASE))
    assert len(candidates) > 100
    for candidate in candidates[:: max(1, len(candidates) // 40)]:
        path = tmp_path / "t.json"
        path.write_text(json.dumps(candidate))
        th = load_thresholds(path) if candidate["t_possible"] < candidate["t_probable"] and candidate["t_review"] < candidate["t_auto"] else None
        assert th is not None
        assert abs(sum(candidate["resolution"].values()) - 1.0) < 1e-9
    assert all(c["t_review"] < c["t_auto"] for c in tune.resolution_candidates(BASE))
    assert all(c["t_possible"] < c["t_probable"] for c in tune.overlap_candidates(BASE))
    assert all(c["margin"] == 0.05 and c["pair"] == BASE["pair"] and c["level"] == BASE["level"] for c in candidates)  # the PRD's values stay


def fake_report(precision: float, recall: float, false_links: int = 0, stale: int = 0, probable_precision: Any = 1.0, overlap_recall: float = 0.5):
    f1 = 2 * precision * recall / (precision + recall)
    overall = SimpleNamespace(precision=precision, recall=recall, f1=f1, review_rate=0.1)
    linked = SimpleNamespace(recall=overlap_recall, precision=0.8, stale_flagged=stale, probable_precision=probable_precision, probable_true=3)
    return SimpleNamespace(overall=overall, hard_negative_false_links=false_links, linked=linked)


def test_it_picks_the_best_f1_that_keeps_precision_and_never_links_a_hard_negative(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "thresholds.json").write_text(json.dumps(BASE))
    splits: List[str] = []

    def fake(candidate: dict, seed_dir: Path, split: str, mode: str) -> Any:
        splits.append(split)
        if candidate["t_auto"] == WIN_AUTO and candidate["t_review"] == WIN_REVIEW and candidate["resolution"]["fuzzy"] == 0.55 and candidate["resolution"]["acronym"] == 0.15 and candidate["resolution"]["semantic"] == 0.15:
            return fake_report(0.99, 0.90)  # the winner
        if candidate["t_auto"] <= tune.T_AUTO[1]:
            return fake_report(0.99, 0.95, false_links=1)  # best F1, but it links a hard negative
        if candidate["t_auto"] == tune.T_AUTO[2]:
            return fake_report(0.90, 0.99)  # best recall, but precision under the floor
        return fake_report(0.99, 0.60, overlap_recall=0.1 + candidate["t_possible"])

    monkeypatch.setattr(tune, "_evaluate", fake)
    chosen = tune.run(split="dev", seed_dir=tmp_path, write=True, progress=None)
    assert (chosen["t_auto"], chosen["t_review"]) == (WIN_AUTO, WIN_REVIEW)
    assert chosen["resolution"] == {"fuzzy": 0.55, "semantic": 0.15, "acronym": 0.15, "location": 0.15}
    assert set(splits) == {"dev"}  # it never looked at the test split
    assert json.loads((tmp_path / "thresholds.json").read_text()) == chosen  # and froze the winner


def test_overlap_stage_wants_recall_but_never_a_stale_flag_or_weak_probable_precision(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "thresholds.json").write_text(json.dumps(BASE))

    def fake(candidate: dict, seed_dir: Path, split: str, mode: str) -> Any:
        possible, probable = candidate["t_possible"], candidate["t_probable"]
        if possible == 0.20:
            return fake_report(0.99, 0.9, stale=1, overlap_recall=0.99)  # flags a case disposed long ago
        if possible == 0.25:
            return fake_report(0.99, 0.9, probable_precision=0.5, overlap_recall=0.98)  # Probable is mostly wrong
        return fake_report(0.99, 0.9, overlap_recall=0.8 if (possible, probable) == (0.30, 0.45) else 0.4)

    monkeypatch.setattr(tune, "_evaluate", fake)
    chosen = tune.run(split="dev", seed_dir=tmp_path, write=False, progress=None)
    assert (chosen["t_possible"], chosen["t_probable"]) == (0.30, 0.45)
    assert (tmp_path / "thresholds.json").read_text() == json.dumps(BASE)  # write=False leaves the file alone


def test_it_says_so_when_nothing_is_acceptable(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "thresholds.json").write_text(json.dumps(BASE))
    monkeypatch.setattr(tune, "_evaluate", lambda *a, **k: fake_report(0.5, 0.5))
    with pytest.raises(RuntimeError, match="precision"):
        tune.run(split="dev", seed_dir=tmp_path, write=False, progress=None)
