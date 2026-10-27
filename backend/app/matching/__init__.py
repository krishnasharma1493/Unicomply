"""
Signature feature: the Cross-Bureau Overlap Engine (PRD §4.4–4.5).

Pure Python by design (PRD §2): this package never imports FastAPI or SQLModel sessions.
It takes plain dataclasses in and returns plain dataclasses out. See README.md.
"""

from app.matching.engine import MatchingEngine, RealEngine, get_engine
from app.matching.types import (
    BANNER_POSSIBLE,
    BANNER_PROBABLE,
    AliasLite,
    Candidate,
    CaseLite,
    EngineMode,
    GroupLite,
    GroupPlan,
    InstitutionLite,
    IssueCluster,
    LevelWeights,
    PairEvidence,
    PairWeights,
    ResolutionResult,
    ResolutionWeights,
    Thresholds,
)

__all__ = [
    "BANNER_POSSIBLE",
    "BANNER_PROBABLE",
    "AliasLite",
    "Candidate",
    "CaseLite",
    "EngineMode",
    "GroupLite",
    "GroupPlan",
    "InstitutionLite",
    "IssueCluster",
    "LevelWeights",
    "MatchingEngine",
    "PairEvidence",
    "PairWeights",
    "RealEngine",
    "ResolutionResult",
    "ResolutionWeights",
    "Thresholds",
    "get_engine",
]
