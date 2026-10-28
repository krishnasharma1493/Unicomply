"""
Tune the matching weights and cutoffs once, on the DEV split only, and freeze them (PRD §4.4, §9).

`python -m app.eval --split dev --tune` runs this, writes the winner to `seed_data/thresholds.json`, then reports on the
test split. Nothing here reads the test split: `run()` refuses any other.

Two stages, because resolution and overlap detection answer different questions:
  1. Resolution: the weights of the four name-score components, and `t_auto` / `t_review`. Best F1 subject to
     precision >= 0.97 and no hard-negative false link (the same name in another state must never be linked).
  2. Overlap: `t_possible` / `t_probable`, with stage 1's winner fixed. Best pair recall (then most true pairs labelled
     Probable, then precision) subject to no stale pair flagged (a case disposed long ago) and Probable precision >= 0.90.
The margin (0.05) and the pair and level weights are the PRD's values and are left alone.
"""

from __future__ import annotations

import itertools
import json
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, Iterator, List, Optional, Tuple

SEED_DIR = Path(__file__).resolve().parents[2] / "seed_data"

Settings = Dict[str, Any]  # the contents of thresholds.json

MIN_PRECISION = 0.97
MIN_PROBABLE_PRECISION = 0.90

# Candidate (fuzzy, semantic, acronym, location) weights; each sums to 1. The PRD's start is the first.
WEIGHTS: List[Tuple[float, float, float, float]] = [
    (0.45, 0.25, 0.15, 0.15),
    (0.55, 0.15, 0.15, 0.15),
    (0.50, 0.20, 0.15, 0.15),
    (0.60, 0.10, 0.15, 0.15),
    (0.55, 0.20, 0.10, 0.15),
    (0.50, 0.25, 0.10, 0.15),
]
# Highest first throughout: when two settings score the same, the first wins, so ties go to the more conservative cutoff.
T_AUTO = [round(0.70 - 0.04 * i, 2) for i in range(11)]
T_REVIEW = [0.45, 0.40, 0.35, 0.30, 0.25, 0.20]
T_POSSIBLE = [0.45, 0.40, 0.35, 0.30, 0.25, 0.20]
T_PROBABLE = [0.68, 0.60, 0.55, 0.50, 0.45, 0.40, 0.35]


@dataclass(frozen=True)
class Choice:
    values: Dict[str, object]
    score: Tuple[float, ...]
    note: str


def _with(base: Settings, **changes: object) -> Settings:
    out: Settings = json.loads(json.dumps(base))
    for key, value in changes.items():
        out[key] = value
    return out


def _evaluate(base: Settings, seed_dir: Path, split: str, mode: str) -> Any:
    from app.eval import evaluate

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "thresholds.json"
        path.write_text(json.dumps(base), encoding="utf-8")
        return evaluate(seed_dir, split, mode, "real", thresholds_path=path)


def resolution_candidates(base: Settings) -> Iterator[Settings]:
    for (fuzzy, semantic, acronym, location), t_auto, t_review in itertools.product(WEIGHTS, T_AUTO, T_REVIEW):
        if t_review < t_auto:
            yield _with(
                base, t_auto=t_auto, t_review=t_review,
                resolution={"fuzzy": fuzzy, "semantic": semantic, "acronym": acronym, "location": location},
            )


def overlap_candidates(base: Settings) -> Iterator[Settings]:
    for t_possible, t_probable in itertools.product(T_POSSIBLE, T_PROBABLE):
        if t_possible < t_probable:
            yield _with(base, t_possible=t_possible, t_probable=t_probable)


def tune_resolution(base: Settings, seed_dir: Path, split: str, mode: str, say: Callable[[str], None]) -> Settings:
    """Stage 1: the name-score weights, `t_auto` and `t_review`."""
    best: Optional[Tuple[Tuple[float, ...], Settings]] = None
    tried = 0
    for candidate in resolution_candidates(base):
        report = _evaluate(candidate, seed_dir, split, mode)
        tried += 1
        precision, recall, f1 = report.overall.precision, report.overall.recall, report.overall.f1
        if precision is None or f1 is None or recall is None:
            continue
        if precision < MIN_PRECISION or report.hard_negative_false_links > 0:
            continue
        key: Tuple[float, ...] = (round(f1, 4), round(precision, 4), -(report.overall.review_rate or 0.0))
        if best is None or key > best[0]:
            best = (key, candidate)
            say(f"  resolution: F1 {f1:.3f} (P {precision:.3f}, R {recall:.3f}) t_auto={candidate['t_auto']} t_review={candidate['t_review']} weights={candidate['resolution']}")
    if best is None:
        raise RuntimeError(f"No setting reached precision >= {MIN_PRECISION} with no hard-negative false link ({tried} tried)")
    return best[1]


def tune_overlap(base: Settings, seed_dir: Path, split: str, mode: str, say: Callable[[str], None]) -> Settings:
    """Stage 2: `t_possible` and `t_probable`, with the resolution settings in `base` fixed."""
    top: Optional[Tuple[Tuple[float, ...], Settings]] = None
    for candidate in overlap_candidates(base):
        counts = _evaluate(candidate, seed_dir, split, mode).linked
        if counts.stale_flagged > 0:
            continue
        probable = counts.probable_precision
        if probable is not None and probable < MIN_PROBABLE_PRECISION:
            continue
        recall, precision = counts.recall or 0.0, counts.precision or 0.0
        # Recall first; then how many true pairs are labelled Probable (the ground truth says planted institution-level
        # overlaps are Probable, as the PS's example is); then precision.
        key: Tuple[float, ...] = (round(recall, 4), float(counts.probable_true), round(precision, 4))
        if top is None or key > top[0]:
            top = (key, candidate)
            say(f"  overlap: recall {recall:.3f}, precision {precision:.3f} t_possible={candidate['t_possible']} t_probable={candidate['t_probable']}")
    if top is None:
        raise RuntimeError("No overlap setting avoided stale flags with usable Probable precision")
    return top[1]


def run(
    split: str = "dev",
    seed_dir: Path = SEED_DIR,
    mode: str = "tfidf",
    write: bool = True,
    progress: Optional[Callable[[str], None]] = print,
) -> Settings:
    """Search on `split` (must be 'dev') and, with `write`, freeze the winner in thresholds.json. Returns it."""
    if split != "dev":
        raise ValueError("Tuning reads the dev split only; the test split is for reporting (PRD §9)")
    path = seed_dir / "thresholds.json"
    base: Settings = json.loads(path.read_text(encoding="utf-8"))
    say = progress or (lambda _: None)
    chosen = tune_overlap(tune_resolution(base, seed_dir, split, mode, say), seed_dir, split, mode, say)
    if write:
        path.write_text(json.dumps(chosen, indent=2) + "\n", encoding="utf-8")
        say(f"Wrote {path}")
    return chosen
