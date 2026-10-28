from dataclasses import replace
from pathlib import Path

from app.matching.embed import make_embedder
from app.matching.index import build_index
from app.matching.resolve import resolve_institution
from app.matching.thresholds import load_thresholds
from app.matching.types import AliasLite, InstitutionLite

SEED = Path(__file__).resolve().parents[2] / "seed_data" / "tiny"  # the hand-written hero world


def hero_index(mode="tfidf"):
    import json

    registry = json.loads((SEED / "institutions.json").read_text())
    institutions = [InstitutionLite(
        row["permanent_id"], row["name"], row["name_norm"], row.get("acronym"),
        row["district"], row["state"], row["region"], row.get("trust_id"), row.get("parent_id"),
    ) for row in registry["institutions"]]
    aliases = [AliasLite(a["alias_norm"], a["permanent_id"], a["source"]) for a in registry["aliases"]]
    return build_index(institutions, aliases, [], [], make_embedder(mode, "unused"))


def test_hero_typo_resolves_in_offline_mode():
    result = resolve_institution("vindya valley engg college jabalpur", "Madhya Pradesh", None,
                                 hero_index(), load_thresholds(), top_k=3)
    assert result.decision == "auto", [(c.permanent_id, c.score, c.reasons) for c in result.candidates]
    assert result.top.permanent_id == "1-4812730561"
    assert all(candidate.reasons for candidate in result.candidates)


def test_known_wrong_district_is_a_hard_veto():
    result = resolve_institution("Vindhya Valley Institute of Engineering", "Madhya Pradesh", "Pune",
                                 hero_index(), load_thresholds())
    assert all(candidate.district == "Pune" for candidate in result.candidates)
    assert "1-4812730561" not in {candidate.permanent_id for candidate in result.candidates}


def test_duplicate_exact_name_without_state_is_not_auto_linked():
    idx = hero_index()
    original = idx.get_institution("1-4812730561")
    duplicate = replace(original, permanent_id="1-9999999999", state="Other State")
    idx.institutions[duplicate.permanent_id] = duplicate
    idx._ids.append(duplicate.permanent_id)
    idx.name_vectors = __import__("numpy").vstack(
        [idx.name_vectors, idx.name_vectors[idx._name_positions[original.permanent_id]]]
    )
    idx._name_positions[duplicate.permanent_id] = len(idx._ids) - 1
    result = resolve_institution(original.name, None, None, idx, load_thresholds())
    assert result.decision == "pending_review"


def test_permanent_id_exact_tier_and_unknown_id():
    idx = hero_index()
    found = resolve_institution("complaint against 1-4812730561", None, None, idx, load_thresholds())
    assert found.decision == "auto" and found.top.score == 1.0
    assert resolve_institution("complaint against 1-9999999999", None, None, idx, load_thresholds()).decision == "unresolved"
