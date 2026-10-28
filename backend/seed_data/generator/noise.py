"""How complainants write institution names: typos, abbreviations, acronyms (PRD §4.7 name noise)."""

import random
import re
from typing import Dict, List, Mapping, Optional, Tuple

LETTERS = "abcdefghijklmnopqrstuvwxyz"
STOPWORDS = frozenset({"OF", "AND", "THE", "FOR"})
WORD_RE = re.compile(r"[A-Z0-9]+")

# Per-case rates from the PRD. Each is drawn independently.
P_TYPO_CASE = 0.40
P_TYPO_CHAR = 0.03
P_ABBREVIATION = 0.35
P_ACRONYM_ONLY = 0.15
P_DISTRICT_MISSING = 0.20
P_CITY_FOR_DISTRICT = 0.10
P_WRONG_STATE = 0.02
MIN_TEXT = 3  # CaseCreate.raw_institution_text minimum


def name_norm(name: str) -> str:
    """The registry's `name_norm`: upper case, & -> AND, punctuation stripped, connector words dropped."""
    words = WORD_RE.findall(name.upper().replace("&", " AND "))
    return " ".join(w for w in words if w not in STOPWORDS)


def acronym(name: str) -> str:
    return "".join(w[0] for w in name_norm(name).split())


def inverse_abbreviations(abbreviations: Mapping[str, str]) -> Dict[str, List[str]]:
    """{'ENGINEERING': ['ENG', 'ENGG']} from abbreviations.json's `abbreviations` section (read, never written)."""
    inverse: Dict[str, List[str]] = {}
    for short, long in abbreviations.items():
        inverse.setdefault(long.upper(), []).append(short.upper())
    return {long: sorted(shorts, key=lambda s: (-len(s), s)) for long, shorts in inverse.items()}


def abbreviate(rng: random.Random, name: str, inverse: Mapping[str, List[str]]) -> str:
    """Shorten every word that has a known short form, each with probability 0.7 (and at least one)."""
    words = name.replace("&", " & ").split()
    candidates = [i for i, w in enumerate(words) if w.upper().strip(".,") in inverse]
    if not candidates:
        return name
    chosen = [i for i in candidates if rng.random() < 0.7] or [rng.choice(candidates)]
    for i in chosen:
        shorts = inverse[words[i].upper().strip(".,")]
        short = rng.choice(shorts[:2]).title()
        words[i] = short + rng.choice(["", "."])
    return " ".join(words)


def typos(rng: random.Random, text: str) -> str:
    """Insert, delete, substitute or transpose letters, p = 0.03 per character."""
    chars = list(text)
    i = 0
    while i < len(chars):
        if chars[i].isalpha() and rng.random() < P_TYPO_CHAR:
            op = rng.choice(("insert", "delete", "substitute", "transpose"))
            if op == "insert":
                chars.insert(i, rng.choice(LETTERS))
                i += 1
            elif op == "delete":
                chars.pop(i)
                continue
            elif op == "substitute":
                chars[i] = rng.choice(LETTERS)
            elif i + 1 < len(chars) and chars[i + 1].isalpha():
                chars[i], chars[i + 1] = chars[i + 1], chars[i]
                i += 1
        i += 1
    return "".join(chars)


def restyle(rng: random.Random, text: str) -> str:
    roll = rng.random()
    return text.lower() if roll < 0.30 else text.upper() if roll < 0.40 else text


def write_name(
    rng: random.Random,
    name: str,
    acr: str,
    district: Optional[str],
    inverse: Mapping[str, List[str]],
) -> Tuple[str, List[str]]:
    """The raw institution text a complainant types, and the noise tags applied to it."""
    tags: List[str] = []
    if rng.random() < P_ACRONYM_ONLY:
        raw = acr
        tags.append("acronym_only")
    else:
        raw = name
        if rng.random() < P_ABBREVIATION / (1 - P_ACRONYM_ONLY):  # so 35% of all cases, acronym-only ones included
            raw = abbreviate(rng, raw, inverse)
            tags.append("abbreviation")
    if rng.random() < P_TYPO_CASE:
        for _ in range(20):  # a case drawn as "has typos" really gets one (p = 0.03 per character can draw none)
            typed = typos(rng, raw)
            if typed != raw and len(typed) >= MIN_TEXT:  # not an acronym typed down to two letters
                raw = typed
                tags.append("typo")
                break
    if district and rng.random() < 0.5:
        raw = f"{raw} {district}"
    return restyle(rng, raw), tags
