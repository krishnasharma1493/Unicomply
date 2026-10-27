"""
Plain dataclasses that go in and out of the matching engine (PRD §4.4–4.5).

Rules for this package (PRD §2): pure Python, no FastAPI, no SQLModel sessions.
Callers (app/modules/engine, #8) build these from table rows and persist the results.
Every dataclass is frozen; collections are tuples so results can't be mutated in place.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal, Optional, Tuple

Decision = Literal["auto", "pending_review", "unresolved", "provided"]
Level = Literal["institution", "parent", "trust"]
Tier = Literal["probable", "possible"]
GroupStatus = Literal["open", "confirmed", "dismissed", "resolved"]
GroupAction = Literal["create", "extend", "reopen"]
AliasSource = Literal["seed", "review", "official"]
EngineMode = Literal["stub", "real"]

# Banner text per tier. The Probable text is the PS's exact wording (PRD §4.5);
# the Possible text matches contract/fixtures (#2).
BANNER_PROBABLE = "Potential Overlapping Cases – Coordination Required"
BANNER_POSSIBLE = "Possible Overlapping Cases – Review Suggested"
BANNERS: dict[Tier, str] = {"probable": BANNER_PROBABLE, "possible": BANNER_POSSIBLE}

OPEN_STATUSES = frozenset(
    {"received", "under_process", "interim_reply", "transferred", "escalated", "reopened"}
)


# ── Registry ─────────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class InstitutionLite:
    """One registry row (PRD §4.1 `institution`)."""

    permanent_id: str
    name: str
    name_norm: str
    acronym: Optional[str]
    district: str
    state: str
    region: str
    trust_id: Optional[int] = None
    parent_id: Optional[str] = None


@dataclass(frozen=True, slots=True)
class AliasLite:
    """A known spelling of an institution (PRD §4.1 `institution_alias`)."""

    alias_norm: str
    permanent_id: str
    source: AliasSource


# ── Cases ────────────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class CaseLite:
    """
    What the overlap engine needs to know about a case.

    `case_ref` and `bureau_code` are only used to write plain-language reasons
    ("Handled by PGRC and RB"); the engine never decides anything from them.
    """

    id: int
    case_ref: str
    permanent_id: Optional[str]
    bureau_id: int
    bureau_code: str
    category_code: str
    description: str
    received_at: date
    status: str
    disposed_at: Optional[date] = None

    @property
    def is_open(self) -> bool:
        """Every status except `disposed` counts as open (PRD §4.1 derived fields)."""
        return self.status in OPEN_STATUSES


# ── Resolution ───────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class Candidate:
    """One ranked institution candidate, always with plain-language reasons (PRD §4.4)."""

    permanent_id: str
    name: str
    district: str
    state: str
    score: float
    reasons: Tuple[str, ...]

    def __post_init__(self) -> None:
        if not 0.0 <= self.score <= 1.0:
            raise ValueError(f"Candidate score must be in [0, 1], got {self.score}")


@dataclass(frozen=True, slots=True)
class ResolutionResult:
    """
    Output of `resolve_institution()`: a decision plus the top-k candidates, best first.

    `provided` is set by the caller when the operator supplied the Permanent ID;
    the engine itself returns only auto / pending_review / unresolved.
    """

    decision: Decision
    candidates: Tuple[Candidate, ...] = ()

    @property
    def top(self) -> Optional[Candidate]:
        return self.candidates[0] if self.candidates else None

    @property
    def permanent_id(self) -> Optional[str]:
        """The linked institution: the top candidate when the decision links one, else None."""
        if self.decision in ("auto", "provided") and self.top is not None:
            return self.top.permanent_id
        return None

    @property
    def score(self) -> Optional[float]:
        return self.top.score if self.top is not None else None


# ── Overlaps ─────────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class PairEvidence:
    """Pairwise overlap evidence (PRD §4.1 `overlap_pair`); always stored with case_a < case_b."""

    case_a: int
    case_b: int
    level: Level
    score: float
    reasons: Tuple[str, ...]

    def __post_init__(self) -> None:
        if self.case_a >= self.case_b:
            raise ValueError("PairEvidence needs case_a < case_b; use PairEvidence.of()")
        if not 0.0 <= self.score <= 1.0:
            raise ValueError(f"Pair score must be in [0, 1], got {self.score}")

    @classmethod
    def of(
        cls, case_x: int, case_y: int, level: Level, score: float, reasons: Tuple[str, ...]
    ) -> PairEvidence:
        """Build a pair in canonical order, whichever case is the new one."""
        a, b = sorted((case_x, case_y))
        return cls(a, b, level, score, reasons)


@dataclass(frozen=True, slots=True)
class IssueCluster:
    """Cases inside a group that are about the same issue (complete linkage, PRD §4.5)."""

    cluster_id: int
    label: str
    case_ids: Tuple[int, ...]


@dataclass(frozen=True, slots=True)
class GroupLite:
    """An existing overlap group, as `plan_group_updates()` needs to see it."""

    group_id: int
    level: Level
    anchor_key: str
    tier: Tier
    status: GroupStatus
    case_ids: Tuple[int, ...]


@dataclass(frozen=True, slots=True)
class GroupPlan:
    """
    What the caller must upsert for one group: create a new one, extend an open or
    confirmed one, or reopen a dismissed one with only the new pairs (PRD §4.5).
    """

    action: GroupAction
    level: Level
    anchor_key: str
    tier: Tier
    case_ids: Tuple[int, ...]
    pairs: Tuple[PairEvidence, ...]
    clusters: Tuple[IssueCluster, ...]
    reasons: Tuple[str, ...]
    group_id: Optional[int] = None  # set for extend / reopen

    def __post_init__(self) -> None:
        if (self.action == "create") != (self.group_id is None):
            raise ValueError("group_id is required for extend/reopen and must be None for create")

    @property
    def banner(self) -> str:
        return BANNERS[self.tier]


# ── Weights & thresholds ─────────────────────────────────────────────────


def _check_weights(name: str, values: Tuple[float, ...]) -> None:
    if any(v < 0 for v in values) or abs(sum(values) - 1.0) > 1e-6:
        raise ValueError(f"{name} weights must be non-negative and sum to 1, got {values}")


@dataclass(frozen=True, slots=True)
class ResolutionWeights:
    """match = fuzzy·s_fuzzy + semantic·s_sem + acronym·s_acronym + location·s_location (PRD §4.4)."""

    fuzzy: float
    semantic: float
    acronym: float
    location: float

    def __post_init__(self) -> None:
        _check_weights("Resolution", (self.fuzzy, self.semantic, self.acronym, self.location))


@dataclass(frozen=True, slots=True)
class PairWeights:
    """pair = w_level × (text·s_text + category·s_category + time·e^(−Δt/decay)) (PRD §4.5)."""

    text: float
    category: float
    time: float
    time_decay_days: float

    def __post_init__(self) -> None:
        _check_weights("Pair", (self.text, self.category, self.time))
        if self.time_decay_days <= 0:
            raise ValueError("time_decay_days must be positive")


@dataclass(frozen=True, slots=True)
class LevelWeights:
    """w_level per overlap level (PRD §4.5)."""

    institution: float
    parent: float
    trust: float

    def __post_init__(self) -> None:
        if not all(0.0 < w <= 1.0 for w in (self.institution, self.parent, self.trust)):
            raise ValueError("Level weights must be in (0, 1]")

    def of(self, level: Level) -> float:
        return {"institution": self.institution, "parent": self.parent, "trust": self.trust}[level]


@dataclass(frozen=True, slots=True)
class Thresholds:
    """
    Every cutoff and weight the engine uses. Loaded only from seed_data/thresholds.json
    plus env overrides (`load_thresholds()`, #19) — never written as numbers in code (PRD §9).
    """

    t_auto: float
    t_review: float
    t_probable: float
    t_possible: float
    margin: float
    resolution: ResolutionWeights
    pair: PairWeights
    level: LevelWeights

    def __post_init__(self) -> None:
        for name in ("t_auto", "t_review", "t_probable", "t_possible", "margin"):
            value = getattr(self, name)
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must be in [0, 1], got {value}")
        if self.t_review >= self.t_auto:
            raise ValueError("t_review must be less than t_auto")
        if self.t_possible >= self.t_probable:
            raise ValueError("t_possible must be less than t_probable")
