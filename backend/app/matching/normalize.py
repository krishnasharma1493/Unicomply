"""Deterministic, registry-anchored text normalization for institution names."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import List, Mapping, Optional

PERMANENT_ID_RE = re.compile(r"\b1-\d{6,10}\b")
_WORD_RE = re.compile(r"[A-Z0-9]+")
_STOPWORDS = frozenset({"OF", "AND", "THE", "FOR"})
_DEFAULT_ABBREVIATIONS = {
    "ENG": "ENGINEERING", "ENGG": "ENGINEERING", "INST": "INSTITUTE",
    "INSTT": "INSTITUTE", "TECH": "TECHNOLOGY", "COLL": "COLLEGE",
    "MGMT": "MANAGEMENT", "MGT": "MANAGEMENT", "UNIV": "UNIVERSITY",
    "POLY": "POLYTECHNIC", "JBP": "JABALPUR",
}


def extract_permanent_id(text: str) -> Optional[str]:
    match = PERMANENT_ID_RE.search(text)
    return match.group(0) if match else None


def load_abbreviations(path: Optional[Path] = None) -> Mapping[str, str]:
    """Load normalized aliases; supports a flat map and the structured seed format."""
    source = path or Path(__file__).resolve().parents[2] / "seed_data" / "abbreviations.json"
    if not source.exists():
        return dict(_DEFAULT_ABBREVIATIONS)
    data = json.loads(source.read_text(encoding="utf-8"))
    if "abbreviations" in data or "districts" in data:
        aliases = {**data.get("abbreviations", {}), **data.get("districts", {})}
    else:
        aliases = data
    return {str(k).upper().rstrip("."): str(v).upper() for k, v in aliases.items()}


def tokens(text_norm: str) -> List[str]:
    return _WORD_RE.findall(text_norm.upper())


def normalize_name(text: str, abbreviations: Mapping[str, str]) -> str:
    """Expand abbreviations before removing punctuation and generic connector words."""
    expanded = text.upper().replace("&", " AND ")
    raw_tokens = _WORD_RE.findall(expanded)
    aliases = {str(k).upper().rstrip("."): str(v).upper() for k, v in abbreviations.items()}
    normalized = []
    for token in raw_tokens:
        replacement = aliases.get(token, token)
        normalized.extend(part for part in _WORD_RE.findall(replacement) if part not in _STOPWORDS)
    return " ".join(normalized)


def acronym_of(name_norm: str) -> str:
    return "".join(word[0] for word in tokens(name_norm) if word and word not in _STOPWORDS)


def extract_district_hint(text: str, districts: Mapping[str, str]) -> Optional[str]:
    """Match a full district name or alias as a whole token sequence, longest first."""
    words = tokens(text)
    matches = []
    for spelling, canonical in districts.items():
        key = tokens(spelling)
        if not key:
            continue
        for i in range(len(words) - len(key) + 1):
            if words[i:i + len(key)] == key:
                matches.append((len(key), str(canonical).upper()))
                break
    return max(matches, default=(0, None), key=lambda row: row[0])[1]
