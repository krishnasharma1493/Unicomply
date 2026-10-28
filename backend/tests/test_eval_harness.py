"""Accuracy harness (#40): `python -m app.eval` over the full synthetic seed and its planted ground truth."""

import json
import sys
import types
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pytest

from app import eval as harness
from app.matching.types import Candidate, Level, ResolutionResult

SEED = harness.SEED_DIR


# One real run per configuration for the whole module (a full-seed run takes several seconds).


@pytest.fixture(scope="module", name="real_test")
def real_test_fixture() -> harness.EvalReport:
    return harness.evaluate(SEED, "test", "tfidf", "real")


@pytest.fixture(scope="module", name="stub_test")
def stub_test_fixture() -> harness.EvalReport:
    return harness.evaluate(SEED, "test", "tfidf", "stub")


def result(decision: str, pid: str = "X") -> ResolutionResult:
    cands = (Candidate(pid, "n", "d", "s", 0.9, ("r",)),) if decision != "unresolved" else ()
    return ResolutionResult(decision, cands)  # type: ignore[arg-type]


# ── Metric arithmetic ───────────────────────────────────────────────────────


def test_resolution_counts_follow_the_prd_definitions() -> None:
    c = harness.ResolutionCounts()
    c.add("A", result("auto", "A"))  # correct auto-link
    c.add("A", result("auto", "B"))  # wrong auto-link
    c.add("A", result("pending_review", "A"))  # sent to review
    c.add("A", result("unresolved"))
    c.add(None, result("auto", "A"))  # institution not in the registry, but linked anyway
    assert (c.cases, c.with_truth, c.auto, c.correct_auto, c.review, c.unresolved) == (5, 4, 3, 1, 1, 1)
    assert c.precision == pytest.approx(1 / 3)  # correct auto-links / all auto-links
    assert c.recall == pytest.approx(1 / 4)  # correct auto-links / cases with a true institution
    assert c.f1 == pytest.approx(2 * (1 / 3) * (1 / 4) / (1 / 3 + 1 / 4))
    assert c.review_rate == pytest.approx(1 / 5)


def test_empty_slices_report_no_data_instead_of_dividing_by_zero() -> None:
    c = harness.ResolutionCounts()
    assert c.precision is None and c.recall is None and c.f1 is None and c.review_rate is None
    assert harness.f1_score(0.0, 0.0) is None and harness.ratio(1, 0) is None


def test_overlap_scoring_counts_pairs_tiers_and_hard_negatives() -> None:
    found = harness.Replay({
        (1, 2): ("institution", "probable"),  # true, probable
        (3, 4): ("parent", "possible"),  # true, possible
        (5, 6): ("institution", "probable"),  # not planted: a false probable
        (7, 8): ("institution", "possible"),  # a disposed-long-ago hard negative flagged
        (90, 91): ("institution", "probable"),  # outside the split, ignored
    })
    truth: Dict[Tuple[int, int], Level] = {(1, 2): "institution", (3, 4): "parent", (9, 10): "trust"}
    c = harness.score_overlaps(found, truth, {(7, 8), (11, 12)}, {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12})
    assert (c.true_pairs, c.found_true, c.flagged, c.flagged_true) == (3, 2, 4, 2)
    assert (c.probable, c.probable_true) == (2, 1)
    assert c.recall == pytest.approx(2 / 3) and c.precision == pytest.approx(1 / 2)
    assert c.probable_precision == pytest.approx(1 / 2)
    assert c.found_by_level == {"institution": 1, "parent": 1, "trust": 0}
    assert (c.stale_flagged, c.stale_pairs) == (1, 2)


# ── A full run ──────────────────────────────────────────────────────────────


def test_runs_end_to_end_on_the_full_seed_in_tfidf_mode(real_test: harness.EvalReport) -> None:
    truth = json.loads((SEED / "ground_truth.json").read_text(encoding="utf-8"))
    assert real_test.split == "test" and real_test.embeddings_mode == "tfidf" and real_test.engine == "real"
    assert real_test.split_cases == len(truth["test_case_ids"]) == real_test.overall.cases
    assert real_test.seed == truth["seed"]
    o = real_test.overall
    assert o.auto + o.review + o.unresolved == o.cases
    for value in (o.precision, o.recall, o.f1, o.review_rate):
        assert value is not None and 0.0 <= value <= 1.0
    assert real_test.hard_negative_cases > 0 and real_test.linked.true_pairs > 0 and real_test.linked.stale_pairs > 0


def test_the_engine_beats_the_stub(real_test: harness.EvalReport, stub_test: harness.EvalReport) -> None:
    """The harness also runs against the stub (low numbers, but it runs)."""
    assert stub_test.engine == "stub" and stub_test.overall.cases == real_test.overall.cases
    assert stub_test.overall.recall is not None and real_test.overall.recall is not None
    assert stub_test.overall.recall < real_test.overall.recall


def test_every_case_is_counted_in_some_noise_row(real_test: harness.EvalReport) -> None:
    truth = json.loads((SEED / "ground_truth.json").read_text(encoding="utf-8"))
    tags = {tag for tags in truth["noise"].values() for tag in tags}
    assert tags <= set(harness.NOISE_TYPES)
    assert set(real_test.by_noise) <= {*harness.NOISE_TYPES, "none"}
    assert sum(n.cases for n in real_test.by_noise.values()) >= real_test.overall.cases


def test_dev_and_test_splits_are_disjoint_and_cover_every_case_with_a_true_institution() -> None:
    truth = json.loads((SEED / "ground_truth.json").read_text(encoding="utf-8"))
    dev, test = set(truth["dev_case_ids"]), set(truth["test_case_ids"])
    resolvable = {int(c) for c, pid in truth["case_to_permanent_id"].items() if pid is not None}
    assert not dev & test and dev | test == resolvable  # cases about unregistered institutions are in neither


def test_unknown_split_is_rejected() -> None:
    with pytest.raises(ValueError, match="split"):
        harness.evaluate(SEED, "all")


# ── Output ──────────────────────────────────────────────────────────────────


def test_precision_recall_and_f1_always_appear_together(real_test: harness.EvalReport) -> None:
    text = harness.render(real_test)
    for row in ("| Resolution precision |", "| Resolution recall |", "| Resolution F1 |"):
        assert row in text
    assert text.index("| Resolution precision |") < text.index("| Resolution recall |") < text.index("| Resolution F1 |")


def test_the_table_names_the_split_seed_mode_and_thresholds(real_test: harness.EvalReport) -> None:
    text = harness.render(real_test)
    th = real_test.thresholds
    assert "# Accuracy evaluation: test split" in text and f"generator seed {real_test.seed}" in text
    assert "| Embeddings mode | tfidf |" in text
    assert f"| t_auto / t_review | {th.t_auto} / {th.t_review} |" in text
    assert f"| t_probable / t_possible | {th.t_probable} / {th.t_possible} |" in text
    for noise in ("Typo", "Abbreviation", "Acronym only", "District missing"):
        assert f"| {noise} |" in text
    for metric in ("Review rate", "Overlap pair recall", "Overlap precision (Probable)", "Hard-negative false links"):
        assert metric in text


def test_misses_are_flagged_not_hidden(real_test: harness.EvalReport) -> None:
    text = harness.render(real_test)
    missed = [m for m, v in (("recall", real_test.overall.recall), ("f1", real_test.overall.f1),
                             ("pair_recall", real_test.linked.recall)) if v is not None and v < harness.TARGETS[m]]
    assert text.count("**missed**") >= len(missed)


def test_rerunning_regenerates_an_identical_file(real_test: harness.EvalReport, tmp_path: Path) -> None:
    out = tmp_path / "pitch" / "eval_results.md"
    assert harness.main(["--split", "test", "--mode", "tfidf", "--out", str(out)]) == 0
    first = out.read_text(encoding="utf-8")
    assert first == harness.render(real_test)  # also stable against the cached index of a previous run
    assert harness.main(["--split", "test", "--mode", "tfidf", "--out", str(out)]) == 0
    assert out.read_text(encoding="utf-8") == first


def test_the_committed_results_file_matches_a_fresh_run(real_test: harness.EvalReport) -> None:
    committed = harness.DEFAULT_OUT.read_text(encoding="utf-8")
    assert committed == harness.render(real_test), "regenerate it: python -m app.eval"


# ── Command line ────────────────────────────────────────────────────────────


@pytest.fixture(name="fast")
def fast_fixture(monkeypatch: pytest.MonkeyPatch, real_test: harness.EvalReport) -> List[Dict[str, Any]]:
    """`main` without a second full run: evaluate() returns the report we already have."""
    calls: List[Dict[str, Any]] = []

    def evaluate(seed_dir: Path, split: str, mode: str, engine: str) -> harness.EvalReport:
        calls.append({"split": split, "mode": mode, "engine": engine})
        return real_test

    monkeypatch.setattr(harness, "evaluate", evaluate)
    return calls


def test_flags_are_passed_through_and_the_table_is_printed(
    fast: List[Dict[str, Any]], tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert harness.main(["--split", "dev", "--mode", "model", "--engine", "stub", "--out", str(tmp_path / "r.md")]) == 0
    assert fast == [{"split": "dev", "mode": "model", "engine": "stub"}]
    assert "## Results" in capsys.readouterr().out


def test_default_split_is_test(fast: List[Dict[str, Any]], tmp_path: Path) -> None:
    harness.main(["--out", str(tmp_path / "r.md")])
    assert fast[0]["split"] == "test" and fast[0]["mode"] == "tfidf" and fast[0]["engine"] == "real"


def test_tuning_is_refused_on_the_test_split(fast: List[Dict[str, Any]], tmp_path: Path) -> None:
    with pytest.raises(SystemExit) as exc:
        harness.main(["--tune", "--split", "test", "--out", str(tmp_path / "r.md")])
    assert exc.value.code == 2 and fast == []


def test_tune_delegates_to_the_tuner_on_dev_then_evaluates(
    fast: List[Dict[str, Any]], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    order: List[str] = []
    tuner = types.ModuleType("app.matching.tune")
    tuner.run = lambda split="dev": order.append(f"tune:{split}")  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "app.matching.tune", tuner)
    monkeypatch.setattr("app.matching.tune", tuner, raising=False)
    assert harness.main(["--tune", "--split", "dev", "--out", str(tmp_path / "r.md")]) == 0
    assert order == ["tune:dev"] and fast == [{"split": "dev", "mode": "tfidf", "engine": "real"}]
