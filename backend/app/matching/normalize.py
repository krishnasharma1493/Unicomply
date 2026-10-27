"""Text normalization for institution names (PRD §4.4 step 1). Implemented in #19."""

from __future__ import annotations

import re
from pathlib import Path
from typing import List, Mapping, Optional

# A Permanent ID anywhere in free text (PRD §4.4 step 2).
PERMANENT_ID_RE = re.compile(r"\b1-\d{6,10}\b")


def extract_permanent_id(text: str) -> Optional[str]:
    """Return the first Permanent ID found in `text`, or None."""
    match = PERMANENT_ID_RE.search(text)
    return match.group(0) if match else None


def load_abbreviations(path: Optional[Path] = None) -> Mapping[str, str]:
    """Load short form → expansion from seed_data/abbreviations.json (ENGG → ENGINEERING, …)."""
    raise NotImplementedError("Implemented in #19")


def normalize_name(text: str, abbreviations: Mapping[str, str]) -> str:
    """
    Uppercase, strip punctuation, collapse spaces, expand abbreviations, drop stopwords
    (OF, AND, THE, FOR). "Vindhya Valley Inst. of Engg. & Tech." and the registry name
    must normalize to the same string.
    """
    raise NotImplementedError("Implemented in #19")


def tokens(text_norm: str) -> List[str]:
    """Split an already-normalized string into tokens."""
    raise NotImplementedError("Implemented in #19")


def acronym_of(name_norm: str) -> str:
    """Acronym of a normalized registry name, e.g. VVIET."""
    raise NotImplementedError("Implemented in #19")


def extract_district_hint(text: str, districts: Mapping[str, str]) -> Optional[str]:
    """
    Find a district in raw text using known district names and short forms
    (`districts` maps every spelling, e.g. JBP, to the canonical name JABALPUR).
    """
    raise NotImplementedError("Implemented in #19")
