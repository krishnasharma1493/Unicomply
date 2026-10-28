from dataclasses import replace
from pathlib import Path

from app.matching.embed import make_embedder
from app.matching.index import build_index
from app.matching.resolve import resolve_institution
from app.matching.thresholds import load_thresholds
from app.matching.types import AliasLite, InstitutionLite

SEED = Path(__file__).resolve().parents[2] / "seed_data"  # the full generated registry: rare-word weighting needs a real one


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


# ── Sibling institutions and misspelt words (#38) ────────────────────────


def test_a_trust_sibling_that_differs_by_one_word_does_not_tie_with_the_right_institution():
    """VVIET and VVIM share 'Vindhya Valley Institute'; only ENGINEERING separates them for this complaint."""
    result = resolve_institution("vindya valley engg college jabalpur", "Madhya Pradesh", None, hero_index(), load_thresholds(), top_k=3)
    by_id = {c.permanent_id: c.score for c in result.candidates}
    assert result.top.permanent_id == "1-4812730561"
    assert by_id["1-4812730561"] - by_id["1-4812730987"] >= 0.05  # the auto-link margin


def test_a_rare_shared_word_outweighs_common_shared_words():
    """'Narmada Valley College of Engineering' shares VALLEY, COLLEGE, ENGINEERING with the query; VINDHYA is what counts."""
    result = resolve_institution("vindya valley engg college jabalpur", "Madhya Pradesh", None, hero_index(), load_thresholds(), top_k=5)
    by_id = {c.permanent_id: c.score for c in result.candidates}
    assert by_id["1-4812730561"] > by_id["1-4812744105"]


def test_misspelt_words_are_corrected_against_the_registry_vocabulary():
    from app.matching.resolve import _correct_spelling

    idx = hero_index()
    assert _correct_spelling("VINDYA", idx) == "VINDHYA"
    assert _correct_spelling("VINDHYA", idx) == "VINDHYA"  # already a registered word
    assert _correct_spelling("XYZZY", idx) == "XYZZY"  # nothing close enough: left alone
    assert _correct_spelling("OF", idx) == "OF"  # too short to correct safely
    assert _correct_spelling("12345", idx) == "12345"
