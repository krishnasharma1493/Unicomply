"""
MatchIndex: the in-memory view of the registry and cases the engine queries (PRD §1, §4.4–4.5).
Implemented in #20. Matching code depends on this protocol, never on SQLite specifics,
so the production swap to PostgreSQL + pgvector touches one file.
"""

from __future__ import annotations

from datetime import date
from typing import Iterable, Mapping, Optional, Protocol, Sequence, Tuple

from app.matching.embed import Embedder
from app.matching.types import AliasLite, CaseLite, InstitutionLite, Level


class MatchIndex(Protocol):
    def candidates_in_state(self, state: Optional[str]) -> Sequence[InstitutionLite]:
        """Blocking: institutions in `state`, or every institution when the state is unknown."""
        ...

    def get_institution(self, permanent_id: str) -> Optional[InstitutionLite]:
        ...

    def resolve_alias(self, alias_norm: str) -> Optional[str]:
        """Permanent ID for an exact normalized name or confirmed alias, else None."""
        ...

    def trust_name(self, trust_id: int) -> Optional[str]:
        ...

    def name_similarity(self, query_norm: str, permanent_ids: Sequence[str]) -> Mapping[str, float]:
        """Semantic (embedding) similarity in [0, 1] of the query to each candidate's name + district."""
        ...

    def description_similarity(self, case_a: int, case_b: int) -> float:
        """Semantic similarity in [0, 1] of two case descriptions."""
        ...

    def level_between(self, pid_a: str, pid_b: str) -> Optional[Level]:
        """institution (same ID) | parent (same university or sibling departments) | trust | None."""
        ...

    def related_cases(self, permanent_id: str, window_days: int, today: date) -> Sequence[CaseLite]:
        """
        Cases at the same institution, parent/sibling departments or trust that are open,
        or were disposed within `window_days` of `today` (PRD §4.5 "What it compares").
        """
        ...

    def is_dismissed(self, case_a: int, case_b: int) -> bool:
        """True if an official dismissed this pair; dismissed pairs never re-alert."""
        ...

    def add_alias(self, alias_norm: str, permanent_id: str) -> None:
        """Make a reviewer-confirmed spelling resolve exactly from now on (PRD §4.4 step 6)."""
        ...

    def upsert_case(self, case: CaseLite) -> None:
        """Add or refresh a case (and its description vector) after intake or an update."""
        ...


def build_index(
    institutions: Iterable[InstitutionLite],
    aliases: Iterable[AliasLite],
    cases: Iterable[CaseLite],
    dismissed_pairs: Iterable[Tuple[int, int]],
    embedder: Embedder,
) -> MatchIndex:
    """Build the index at startup; vectors are cached under seed_data/.cache/."""
    raise NotImplementedError("Implemented in #20")
