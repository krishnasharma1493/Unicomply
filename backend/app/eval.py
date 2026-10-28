"""
Accuracy evaluation against the planted ground truth (PRD §10): `python -m app.eval [--split test] [--tune]`.

Replays the synthetic case stream through the public matching interface only (`MatchingEngine`,
`MatchIndex`, `Thresholds`): `resolve_institution` on every case of the split, then
`detect_overlaps` / `plan_group_updates` over the stream, oldest case first, each case seeing only the
cases before it. Prints one table and writes it to `docs/pitch/eval_results.md`.

Tuning belongs on the dev split and reporting on the test split (PRD §9): `--tune` is dev-only and
delegates to `app.matching.tune.run(split="dev")` (#44). The output has no timestamps or timings, so the
same inputs regenerate an identical file.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from dataclasses import dataclass, field, replace
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, FrozenSet, Iterable, List, Optional, Sequence, Set, Tuple

from app.core.config import Settings
from app.matching.embed import make_embedder
from app.matching.engine import MatchingEngine, get_engine
from app.matching.index import MatchIndex, build_index
from app.matching.thresholds import load_thresholds
from app.matching.types import (
    AliasLite,
    CaseLite,
    GroupLite,
    InstitutionLite,
    Level,
    PairEvidence,
    ResolutionResult,
    Thresholds,
    Tier,
)

BACKEND = Path(__file__).resolve().parents[1]
SEED_DIR = BACKEND / "seed_data"
DEFAULT_OUT = BACKEND.parent / "docs" / "pitch" / "eval_results.md"

# Same defaults as app.core.config.Settings, read without needing the server's environment.
WINDOW_DAYS: int = Settings.model_fields["OVERLAP_WINDOW_DAYS"].default
MODEL_NAME: str = Settings.model_fields["EMBEDDING_MODEL_NAME"].default

NOISE_TYPES = ("typo", "abbreviation", "acronym_only", "district_missing", "city_for_district", "wrong_state")
NOISE_LABELS = {
    "typo": "Typo",
    "abbreviation": "Abbreviation",
    "acronym_only": "Acronym only",
    "district_missing": "District missing",
    "city_for_district": "City for district",
    "wrong_state": "Wrong state",
    "none": "No noise",
}
LEVELS: Tuple[Level, ...] = ("institution", "parent", "trust")

# PRD §10 targets. `None` means "report it", not a pass/fail target.
TARGETS = {
    "precision": 0.97,
    "recall": 0.85,
    "f1": 0.90,
    "pair_recall": 0.90,
}


# ── Metrics ──────────────────────────────────────────────────────────────


def ratio(part: int, whole: int) -> Optional[float]:
    return part / whole if whole else None


def f1_score(precision: Optional[float], recall: Optional[float]) -> Optional[float]:
    if precision is None or recall is None or precision + recall == 0:
        return None
    return 2 * precision * recall / (precision + recall)


@dataclass
class ResolutionCounts:
    """Tallies for one slice of cases (everything, or the cases with one kind of noise)."""

    cases: int = 0
    with_truth: int = 0
    auto: int = 0
    correct_auto: int = 0
    review: int = 0
    unresolved: int = 0

    def add(self, truth: Optional[str], result: ResolutionResult) -> None:
        self.cases += 1
        self.with_truth += truth is not None
        if result.decision == "auto":
            self.auto += 1
            self.correct_auto += truth is not None and result.permanent_id == truth
        elif result.decision == "pending_review":
            self.review += 1
        else:
            self.unresolved += 1

    @property
    def precision(self) -> Optional[float]:
        return ratio(self.correct_auto, self.auto)

    @property
    def recall(self) -> Optional[float]:
        return ratio(self.correct_auto, self.with_truth)

    @property
    def f1(self) -> Optional[float]:
        return f1_score(self.precision, self.recall)

    @property
    def review_rate(self) -> Optional[float]:
        return ratio(self.review, self.cases)


@dataclass
class OverlapCounts:
    """Pair-level overlap tallies for one way of linking cases to institutions."""

    true_pairs: int = 0
    found_true: int = 0
    flagged: int = 0
    flagged_true: int = 0
    probable: int = 0
    probable_true: int = 0
    found_by_level: Dict[str, int] = field(default_factory=lambda: {lv: 0 for lv in LEVELS})
    true_by_level: Dict[str, int] = field(default_factory=lambda: {lv: 0 for lv in LEVELS})
    stale_flagged: int = 0  # hard negatives: a case disposed long ago must not be flagged
    stale_pairs: int = 0

    @property
    def recall(self) -> Optional[float]:
        return ratio(self.found_true, self.true_pairs)

    @property
    def precision(self) -> Optional[float]:
        return ratio(self.flagged_true, self.flagged)

    @property
    def probable_precision(self) -> Optional[float]:
        return ratio(self.probable_true, self.probable)


@dataclass
class EvalReport:
    split: str
    engine: str
    embeddings_mode: str
    seed: int
    as_of: str
    thresholds: Thresholds
    window_days: int
    overall: ResolutionCounts
    by_noise: Dict[str, ResolutionCounts]
    hard_negative_cases: int
    hard_negative_false_links: int
    linked: OverlapCounts  # cases linked by the engine's own auto decisions (end to end)
    given_truth: OverlapCounts  # cases linked by their true institution (the overlap logic alone)
    split_cases: int = 0
    split_clusters: int = 0


# ── Loading the seed ─────────────────────────────────────────────────────


@dataclass
class World:
    ground_truth: Dict[str, Any]
    institutions: List[InstitutionLite]
    aliases: List[AliasLite]
    trust_names: Dict[int, str]
    cases: Dict[int, Dict[str, Any]]  # raw seed rows by case id
    lites: Dict[int, CaseLite]


def _load(seed_dir: Path, name: str) -> Dict[str, Any]:
    data: Dict[str, Any] = json.loads((seed_dir / f"{name}.json").read_text(encoding="utf-8"))
    return data


def _day(value: Optional[str]) -> Optional[date]:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).date() if value else None


def load_world(seed_dir: Path) -> World:
    registry = _load(seed_dir, "institutions")
    bureaus = {b["id"]: b["code"] for b in _load(seed_dir, "bureaus")["bureaus"]}
    categories = {c["id"]: c["code"] for c in _load(seed_dir, "categories")["categories"]}
    rows = {c["id"]: c for c in _load(seed_dir, "cases")["cases"]}
    return World(
        ground_truth=_load(seed_dir, "ground_truth"),
        institutions=[
            InstitutionLite(
                permanent_id=i["permanent_id"], name=i["name"], name_norm=i["name_norm"], acronym=i["acronym"],
                district=i["district"], state=i["state"], region=i["region"], trust_id=i["trust_id"],
                parent_id=i["parent_id"],
            )
            for i in registry["institutions"]
        ],
        aliases=[AliasLite(a["alias_norm"], a["permanent_id"], a["source"]) for a in registry["aliases"]],
        trust_names={t["id"]: t["name"] for t in registry["trusts"]},
        cases=rows,
        lites={
            cid: CaseLite(
                id=cid, case_ref=c["case_ref"], permanent_id=c["permanent_id"], bureau_id=c["current_bureau_id"],
                bureau_code=bureaus[c["current_bureau_id"]], category_code=categories[c["category_id"]],
                description=c["description"], received_at=date.fromisoformat(c["received_at"]), status=c["status"],
                disposed_at=_day(c["disposed_at"]),
            )
            for cid, c in rows.items()
        },
    )


def build_world_index(world: World, mode: str) -> MatchIndex:
    """The index the app would build, but without the human decisions: no dismissed pairs."""
    return build_index(
        world.institutions, world.aliases, world.lites.values(), [], make_embedder(mode, MODEL_NAME), world.trust_names  # type: ignore[arg-type]
    )


# ── Overlap replay ───────────────────────────────────────────────────────


def _families(idx: MatchIndex) -> Dict[str, FrozenSet[str]]:
    """Institutions that can overlap with each one (same institution, university family, or trust)."""
    ids = list(idx.institutions)
    return {p: frozenset(q for q in ids if idx.level_between(p, q) is not None) for p in ids}


@dataclass
class Replay:
    pairs: Dict[Tuple[int, int], Tuple[Level, Tier]]  # every flagged pair and its strongest tier


def replay(
    stream: Sequence[CaseLite],
    links: Dict[int, Optional[str]],
    idx: MatchIndex,
    th: Thresholds,
    engine: MatchingEngine,
    window_days: int,
    families: Dict[str, FrozenSet[str]],
) -> Replay:
    """Feed cases to the engine oldest first; each one is compared with the earlier cases of its family."""
    seen_by_institution: Dict[str, List[CaseLite]] = defaultdict(list)
    groups: Dict[Tuple[str, str], GroupLite] = {}
    pairs: Dict[Tuple[int, int], Tuple[Level, Tier]] = {}
    for case in stream:
        pid = links.get(case.id)
        new = replace(case, permanent_id=pid)
        if pid is not None and pid in families:
            cutoff = case.received_at.toordinal() - window_days
            related = [
                other for member in families[pid] for other in seen_by_institution.get(member, ())
                if other.is_open or (other.disposed_at is not None and other.disposed_at.toordinal() >= cutoff)
            ]
            evidence = engine.detect_overlaps(new, related, idx, th)
            plans = engine.plan_group_updates(new, evidence, list(groups.values()), idx, th)
            for plan in plans:
                key = (plan.level, plan.anchor_key)
                gid = plan.group_id if plan.group_id is not None else len(groups) + 1
                groups[key] = GroupLite(gid, plan.level, plan.anchor_key, plan.tier, "open", plan.case_ids)
                for pair in plan.pairs:
                    _keep_stronger(pairs, pair, plan.tier)
            seen_by_institution[pid].append(new)
    return Replay(pairs)


def _keep_stronger(pairs: Dict[Tuple[int, int], Tuple[Level, Tier]], pair: PairEvidence, tier: Tier) -> None:
    key = (pair.case_a, pair.case_b)
    if key not in pairs or tier == "probable":
        pairs[key] = (pair.level, tier)


def score_overlaps(
    found: Replay,
    truth: Dict[Tuple[int, int], Level],
    stale_pairs: Set[Tuple[int, int]],
    in_split: Set[int],
) -> OverlapCounts:
    counts = OverlapCounts(true_pairs=len(truth), stale_pairs=len(stale_pairs))
    for level in truth.values():
        counts.true_by_level[level] += 1
    flagged = {p: v for p, v in found.pairs.items() if p[0] in in_split and p[1] in in_split}
    counts.flagged = len(flagged)
    for pair, (_, tier) in flagged.items():
        is_true = pair in truth
        counts.flagged_true += is_true
        if tier == "probable":
            counts.probable += 1
            counts.probable_true += is_true
    for pair, level in truth.items():
        if pair in flagged:
            counts.found_true += 1
            counts.found_by_level[level] += 1
    counts.stale_flagged = sum(pair in flagged for pair in stale_pairs)
    return counts


# ── The evaluation ───────────────────────────────────────────────────────


def _pairs(case_ids: Iterable[int]) -> Set[Tuple[int, int]]:
    ids = sorted(set(case_ids))
    return {(a, b) for i, a in enumerate(ids) for b in ids[i + 1:]}


def evaluate(
    seed_dir: Path = SEED_DIR,
    split: str = "test",
    mode: str = "tfidf",
    engine_name: str = "real",
    thresholds_path: Optional[Path] = None,
) -> EvalReport:
    if split not in ("dev", "test"):
        raise ValueError(f"split must be 'dev' or 'test', got {split!r}")
    world = load_world(seed_dir)
    truth = world.ground_truth
    th = load_thresholds(thresholds_path or seed_dir / "thresholds.json")
    idx = build_world_index(world, mode)
    engine = get_engine(engine_name)  # type: ignore[arg-type]

    in_split = set(truth[f"{split}_case_ids"])
    stream = sorted((world.lites[c] for c in in_split), key=lambda c: (c.received_at, c.id))
    true_pid: Dict[str, Optional[str]] = truth["case_to_permanent_id"]
    noise: Dict[str, List[str]] = truth["noise"]

    overall = ResolutionCounts()
    by_noise: Dict[str, ResolutionCounts] = defaultdict(ResolutionCounts)
    engine_links: Dict[int, Optional[str]] = {}
    results: Dict[int, ResolutionResult] = {}
    for case in stream:
        row = world.cases[case.id]
        result = engine.resolve_institution(
            row["raw_institution_text"], row["raw_state"], row["raw_district"], idx, th
        )
        results[case.id] = result
        engine_links[case.id] = result.permanent_id if result.decision == "auto" else None
        expected = true_pid.get(str(case.id))
        overall.add(expected, result)
        for tag in noise.get(str(case.id)) or ["none"]:
            by_noise[tag].add(expected, result)

    # Hard negatives: the same name in another state must never be auto-linked to the wrong institution.
    hn_cases = {
        c for hn in truth["hard_negatives"] if hn["kind"] == "same_name_other_state" for c in hn["case_ids"]
    } & in_split
    false_links = sum(
        engine_links[c] is not None and engine_links[c] != true_pid.get(str(c)) for c in hn_cases
    )

    clusters = [c for c in truth["overlap_clusters"] if c["split"] == split]
    true_pairs: Dict[Tuple[int, int], Level] = {}
    for cluster in clusters:
        for pair in _pairs(cluster["case_ids"]):
            true_pairs[pair] = cluster["level"]
    stale = {
        pair for hn in truth["hard_negatives"] if hn["kind"] == "disposed_long_ago"
        for pair in _pairs(hn["case_ids"]) if pair[0] in in_split and pair[1] in in_split
    }

    families = _families(idx)
    truth_links = {c.id: true_pid.get(str(c.id)) for c in stream}
    linked = score_overlaps(
        replay(stream, engine_links, idx, th, engine, WINDOW_DAYS, families), true_pairs, stale, in_split
    )
    given = score_overlaps(
        replay(stream, truth_links, idx, th, engine, WINDOW_DAYS, families), true_pairs, stale, in_split
    )
    return EvalReport(
        split=split, engine=engine.name, embeddings_mode=mode, seed=truth["seed"], as_of=truth["as_of"],
        thresholds=th, window_days=WINDOW_DAYS, overall=overall, by_noise=dict(by_noise),
        hard_negative_cases=len(hn_cases), hard_negative_false_links=false_links, linked=linked,
        given_truth=given, split_cases=len(stream), split_clusters=len(clusters),
    )


# ── Output ───────────────────────────────────────────────────────────────


def _fmt(value: Optional[float]) -> str:
    return "n/a" if value is None else f"{value:.3f}"


def _count(num: int, den: int) -> str:
    return f"{num}/{den}"


def _status(value: Optional[float], target: float) -> str:
    if value is None:
        return "no data"
    return "met" if value >= target else "**missed**"


def render(report: EvalReport) -> str:
    o, th = report.overall, report.thresholds
    link, given = report.linked, report.given_truth
    zero = report.hard_negative_false_links == 0
    lines = [
        f"# Accuracy evaluation: {report.split} split",
        "",
        f"Synthetic data with planted ground truth (generator seed {report.seed}, as of {report.as_of}). "
        f"The {report.split} split holds {report.split_cases} cases and {report.split_clusters} planted overlap clusters. "
        "Whole institution families sit on one side of the split, so nothing leaks between tuning (dev) and reporting (test).",
        "",
        "| Setting | Value |",
        "| --- | --- |",
        f"| Split | {report.split} |",
        f"| Engine | {report.engine} |",
        f"| Embeddings mode | {report.embeddings_mode} |",
        f"| Overlap window | {report.window_days} days |",
        f"| t_auto / t_review | {th.t_auto} / {th.t_review} |",
        f"| t_probable / t_possible | {th.t_probable} / {th.t_possible} |",
        f"| Margin | {th.margin} |",
        f"| Resolution weights (fuzzy / semantic / acronym / location) | "
        f"{th.resolution.fuzzy} / {th.resolution.semantic} / {th.resolution.acronym} / {th.resolution.location} |",
        f"| Pair weights (text / category / time), decay | {th.pair.text} / {th.pair.category} / {th.pair.time}, "
        f"{th.pair.time_decay_days} days |",
        f"| Level weights (institution / parent / trust) | {th.level.institution} / {th.level.parent} / {th.level.trust} |",
        "",
        "## Results",
        "",
        "| Metric | Value | Counts | Target | Status |",
        "| --- | --- | --- | --- | --- |",
        f"| Resolution precision | {_fmt(o.precision)} | {_count(o.correct_auto, o.auto)} | >= {TARGETS['precision']} | "
        f"{_status(o.precision, TARGETS['precision'])} |",
        f"| Resolution recall | {_fmt(o.recall)} | {_count(o.correct_auto, o.with_truth)} | >= {TARGETS['recall']} | "
        f"{_status(o.recall, TARGETS['recall'])} |",
        f"| Resolution F1 | {_fmt(o.f1)} | | >= {TARGETS['f1']} | {_status(o.f1, TARGETS['f1'])} |",
        f"| Review rate | {_fmt(o.review_rate)} | {_count(o.review, o.cases)} | report | |",
        f"| Unresolved rate | {_fmt(ratio(o.unresolved, o.cases))} | {_count(o.unresolved, o.cases)} | report | |",
        f"| Overlap pair recall (Probable + Possible) | {_fmt(link.recall)} | {_count(link.found_true, link.true_pairs)} | "
        f">= {TARGETS['pair_recall']} | {_status(link.recall, TARGETS['pair_recall'])} |",
        f"| Overlap precision (Probable) | {_fmt(link.probable_precision)} | {_count(link.probable_true, link.probable)} | "
        "report | |",
        f"| Overlap precision (all flagged) | {_fmt(link.precision)} | {_count(link.flagged_true, link.flagged)} | report | |",
        f"| Hard-negative false links (same name, other state) | {report.hard_negative_false_links} | "
        f"{_count(report.hard_negative_false_links, report.hard_negative_cases)} | 0 | {'met' if zero else '**missed**'} |",
        f"| Hard-negative false flags (disposed long ago) | {link.stale_flagged} | "
        f"{_count(link.stale_flagged, link.stale_pairs)} | 0 | {'met' if link.stale_flagged == 0 else '**missed**'} |",
        "",
        "Precision and recall are always shown with F1 (Hand and Christen: F1 alone hides the trade-off). "
        "Resolution counts only `auto` decisions as links; cases sent to review or left unresolved lower recall, "
        "not precision. Overlaps are linked by the engine's own resolution (end to end).",
        "",
        "## Overlap pair recall by planted level",
        "",
        "| Level | Found, engine-linked | Found, true institution known |",
        "| --- | --- | --- |",
    ]
    for level in LEVELS:
        lines.append(
            f"| {level} | {_count(link.found_by_level[level], link.true_by_level[level])} "
            f"({_fmt(ratio(link.found_by_level[level], link.true_by_level[level]))}) | "
            f"{_count(given.found_by_level[level], given.true_by_level[level])} "
            f"({_fmt(ratio(given.found_by_level[level], given.true_by_level[level]))}) |"
        )
    lines += [
        f"| **all** | {_count(link.found_true, link.true_pairs)} ({_fmt(link.recall)}) | "
        f"{_count(given.found_true, given.true_pairs)} ({_fmt(given.recall)}) |",
        "",
        "The right-hand column feeds the overlap logic the true institution of every case, so it isolates the overlap "
        "scoring from resolution mistakes.",
        "",
        "## Resolution by noise type",
        "",
        "A case can carry several noise types, so rows overlap.",
        "",
        "| Noise | Cases | Precision | Recall | F1 | Review rate |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for tag in (*NOISE_TYPES, "none"):
        n = report.by_noise.get(tag)
        if n is not None:
            lines.append(
                f"| {NOISE_LABELS[tag]} | {n.cases} | {_fmt(n.precision)} | {_fmt(n.recall)} | {_fmt(n.f1)} | "
                f"{_fmt(n.review_rate)} |"
            )
    lines += ["", "Reproduce: `python -m app.eval" + f" --split {report.split} --mode {report.embeddings_mode}"
              + (f" --engine {report.engine}" if report.engine != "real" else "") + "`", ""]
    return "\n".join(lines)


# ── Command line ─────────────────────────────────────────────────────────


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.eval", description="Accuracy of resolution and overlap detection on the planted ground truth.")
    parser.add_argument("--split", choices=("dev", "test"), default="test", help="report on the test split; tune on dev")
    parser.add_argument("--mode", choices=("model", "tfidf"), default="tfidf", help="embeddings: sentence-transformers or the offline TF-IDF fallback")
    parser.add_argument("--engine", choices=("real", "stub"), default="real")
    parser.add_argument("--tune", action="store_true", help="tune weights and thresholds on the dev split first (#44)")
    parser.add_argument("--seed-dir", type=Path, default=SEED_DIR, help=argparse.SUPPRESS)
    parser.add_argument("--out", type=Path, default=None, help="where to write the markdown table (default: docs/pitch/eval_results.md for the test split; a dev report is only printed)")
    args = parser.parse_args(argv)

    if args.tune:
        if args.split != "dev":
            parser.error("--tune only runs on the dev split; test is for reporting (PRD §9)")
        from app.matching import tune

        tune.run(split="dev")

    report = evaluate(args.seed_dir, args.split, args.mode, args.engine)
    text = render(report)
    print(text)
    out = args.out or (DEFAULT_OUT if args.split == "test" else None)  # the committed file is the test-split report
    if out is not None:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
        print(f"Wrote {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
