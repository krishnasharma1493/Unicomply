"""
StubEngine: canned results for the hero story (PRD §4.7) so intake, review and overlap
screens work before the real engine (#19–#22) exists. It knows three institutions, matches
the hero spellings with a crude token check, and returns the same candidates, scores and
reasons as contract/fixtures/post_institutions_resolve.json. Not a matcher: never tune it.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Sequence, Set, Tuple

from app.matching.index import MatchIndex
from app.matching.normalize import extract_permanent_id
from app.matching.types import (
    CaseLite,
    Candidate,
    EngineMode,
    GroupAction,
    GroupLite,
    GroupPlan,
    InstitutionLite,
    IssueCluster,
    PairEvidence,
    ResolutionResult,
    Thresholds,
    Tier,
)

HERO = InstitutionLite(
    permanent_id="1-4812730561",
    name="Vindhya Valley Institute of Engineering & Technology",
    name_norm="VINDHYA VALLEY INSTITUTE ENGINEERING TECHNOLOGY",
    acronym="VVIET",
    district="Jabalpur",
    state="Madhya Pradesh",
    region="central",
    trust_id=1,
)
HERO_SIBLING = InstitutionLite(
    permanent_id="1-4812730987",
    name="Vindhya Valley Institute of Management",
    name_norm="VINDHYA VALLEY INSTITUTE MANAGEMENT",
    acronym="VVIM",
    district="Jabalpur",
    state="Madhya Pradesh",
    region="central",
    trust_id=1,
)
NEIGHBOUR = InstitutionLite(
    permanent_id="1-4812744105",
    name="Narmada Valley College of Engineering",
    name_norm="NARMADA VALLEY COLLEGE ENGINEERING",
    acronym="NVCE",
    district="Jabalpur",
    state="Madhya Pradesh",
    region="central",
)
STUB_REGISTRY: Dict[str, InstitutionLite] = {
    i.permanent_id: i for i in (HERO, HERO_SIBLING, NEIGHBOUR)
}


def _candidate(inst: InstitutionLite, score: float, reasons: Tuple[str, ...]) -> Candidate:
    return Candidate(inst.permanent_id, inst.name, inst.district, inst.state, score, reasons)


# Same values as contract/fixtures/post_institutions_resolve.json (a test keeps them in sync).
HERO_CANDIDATES: Tuple[Candidate, ...] = (
    _candidate(
        HERO,
        0.93,
        (
            "Name 88% similar after expanding ENGG",
            "District Jabalpur matches",
            "Acronym VVIET matches a confirmed alias",
        ),
    ),
    _candidate(
        HERO_SIBLING,
        0.71,
        (
            "Name 74% similar after expanding ENGG",
            "District Jabalpur matches",
            "Management institute; the text mentions engineering",
        ),
    ),
    _candidate(
        NEIGHBOUR,
        0.58,
        ("Name 61% similar (shares VALLEY, ENGINEERING, COLLEGE)", "District Jabalpur matches"),
    ),
)
SIBLING_CANDIDATES: Tuple[Candidate, ...] = (
    _candidate(
        HERO_SIBLING,
        0.91,
        ("Name 90% similar after expanding INST and MGMT", "District Jabalpur matches"),
    ),
    _candidate(
        HERO,
        0.64,
        ("Name 70% similar", "District Jabalpur matches", "Engineering institute; the text mentions management"),
    ),
)

# Stand-ins for thresholds.json values; the stub only needs a rough probable/possible split.
_STUB_PROBABLE = 0.7
_SAME_CATEGORY_SCORE = 0.84
_RELATED_CATEGORY_SCORE = 0.73
_OTHER_CATEGORY_SCORE = 0.33

# Related categories from PRD §4.5 (s_category = 0.5 in the real engine).
_RELATED_CATEGORIES = (
    frozenset({"fee_refund", "certificate_withheld", "scholarship"}),
    frozenset({"faculty_shortage", "infrastructure_deficiency", "unapproved_course"}),
    frozenset({"ragging", "harassment"}),
)


def _related(a: str, b: str) -> bool:
    return any(a in group and b in group for group in _RELATED_CATEGORIES)


_HERO_STATES = {"MADHYA PRADESH", "MP", "M P"}
_HERO_DISTRICTS = {"JABALPUR", "JBP"}
_MANAGEMENT = {"MANAGEMENT", "MGMT", "MGT"}
_ENGINEERING = {"ENGINEERING", "ENGG", "ENG", "TECH", "TECHNOLOGY", "IET", "VVIET"}


def _clean(text: str) -> str:
    return " ".join(re.sub(r"[^A-Z0-9]+", " ", text.upper()).split())


def _tokens(text: str) -> Set[str]:
    return set(_clean(text).split())


def _is_vindhya_valley(tokens: Set[str]) -> bool:
    if "VVIET" in tokens or "VVIM" in tokens:
        return True
    return any(t.startswith("VIND") for t in tokens) and bool(tokens & {"VALLEY", "VALLY", "VLY"})


def _location_ok(raw_state: Optional[str], raw_district: Optional[str]) -> bool:
    """Location veto: a known state or district that isn't the hero's rules the match out."""
    if raw_state and _clean(raw_state) not in _HERO_STATES:
        return False
    if raw_district and not (_tokens(raw_district) & _HERO_DISTRICTS):
        return False
    return True


def _category_label(code: str) -> str:
    return code.replace("_", " ")


class StubEngine:
    """Implements `MatchingEngine` with hero-story results; `idx` and `th` are ignored."""

    name: EngineMode = "stub"

    def resolve_institution(
        self,
        raw_text: str,
        raw_state: Optional[str],
        raw_district: Optional[str],
        idx: Optional[MatchIndex] = None,
        th: Optional[Thresholds] = None,
        top_k: int = 5,
    ) -> ResolutionResult:
        pid = extract_permanent_id(raw_text)
        if pid is not None and pid in STUB_REGISTRY:
            inst = STUB_REGISTRY[pid]
            return ResolutionResult(
                "auto", (_candidate(inst, 1.0, (f"Permanent ID {pid} found in the text",)),)
            )

        tokens = _tokens(raw_text) | _tokens(raw_district or "")
        if not _is_vindhya_valley(tokens) or not _location_ok(raw_state, raw_district):
            return ResolutionResult("unresolved", ())

        management_only = bool(tokens & _MANAGEMENT) and not tokens & _ENGINEERING
        candidates = SIBLING_CANDIDATES if management_only else HERO_CANDIDATES
        return ResolutionResult("auto", candidates[:top_k])

    def detect_overlaps(
        self,
        new: CaseLite,
        related: Sequence[CaseLite],
        idx: Optional[MatchIndex] = None,
        th: Optional[Thresholds] = None,
    ) -> List[PairEvidence]:
        """Institution level only: every cross-bureau pair, plus same-bureau pairs on the same issue."""
        if new.permanent_id is None:
            return []
        out: List[PairEvidence] = []
        for other in related:
            if other.id == new.id or other.permanent_id != new.permanent_id:
                continue
            cross_bureau = other.bureau_id != new.bureau_id
            same_category = other.category_code == new.category_code
            related_issue = not same_category and _related(other.category_code, new.category_code)
            if not (cross_bureau or same_category or related_issue):
                continue
            if same_category:
                score = _SAME_CATEGORY_SCORE
            elif related_issue:
                score = _RELATED_CATEGORY_SCORE
            else:
                score = _OTHER_CATEGORY_SCORE
            reasons = [f"Same institution {new.permanent_id}"]
            reasons.append(
                f"Handled by {new.bureau_code} and {other.bureau_code}"
                if cross_bureau
                else f"Both with {new.bureau_code} (possible duplicate)"
            )
            if same_category:
                reasons.append(f"Both about {_category_label(new.category_code)}")
            elif related_issue:
                reasons.append(
                    f"Related issues: {_category_label(new.category_code)} and "
                    f"{_category_label(other.category_code)}"
                )
            reasons.append(f"Received {abs((new.received_at - other.received_at).days)} days apart")
            out.append(PairEvidence.of(new.id, other.id, "institution", score, tuple(reasons)))
        return out

    def plan_group_updates(
        self,
        new: CaseLite,
        evidence: Sequence[PairEvidence],
        existing: Sequence[GroupLite],
        idx: Optional[MatchIndex] = None,
        th: Optional[Thresholds] = None,
    ) -> List[GroupPlan]:
        """One institution-level group anchored on the new case's Permanent ID."""
        pairs = tuple(p for p in evidence if p.level == "institution")
        if not pairs or new.permanent_id is None:
            return []

        anchor = new.permanent_id
        tier: Tier = "probable" if any(p.score >= _STUB_PROBABLE for p in pairs) else "possible"
        members = {new.id} | {c for p in pairs for c in (p.case_a, p.case_b)}
        reasons = tuple(dict.fromkeys(r for p in pairs for r in p.reasons))

        current = next(
            (
                g
                for g in existing
                if g.level == "institution" and g.anchor_key == anchor and g.status != "resolved"
            ),
            None,
        )
        if current is None:
            case_ids = tuple(sorted(members))
            return [
                GroupPlan("create", "institution", anchor, tier, case_ids, pairs,
                          (IssueCluster(1, "All linked cases", case_ids),), reasons)
            ]

        if current.tier == "probable":
            tier = "probable"
        case_ids = tuple(sorted(set(current.case_ids) | members))
        action: GroupAction = "reopen" if current.status == "dismissed" else "extend"
        return [
            GroupPlan(action, "institution", anchor, tier, case_ids, pairs,
                      (IssueCluster(1, "All linked cases", case_ids),), reasons,
                      group_id=current.group_id)
        ]
