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
    result = resolve_institution("maharaja agrsen institute of technology delhi", "Delhi", None,
                                 hero_index(), load_thresholds(), top_k=3)
    assert result.decision == "auto", [(c.permanent_id, c.score, c.reasons) for c in result.candidates]
    assert result.top.permanent_id == "1-43655981521"
    assert all(candidate.reasons for candidate in result.candidates)


def test_known_wrong_district_is_a_hard_veto():
    result = resolve_institution("Maharaja Agrasen Institute of Technology", "Delhi", "Pune",
                                 hero_index(), load_thresholds())
    assert all(candidate.district == "Pune" for candidate in result.candidates)
    assert "1-43655981521" not in {candidate.permanent_id for candidate in result.candidates}


def test_duplicate_exact_name_without_state_is_not_auto_linked():
    idx = hero_index()
    original = idx.get_institution("1-43655981521")
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
    found = resolve_institution("complaint against 1-43655981521", None, None, idx, load_thresholds())
    assert found.decision == "auto" and found.top.score == 1.0
    assert resolve_institution("complaint against 1-9999999999", None, None, idx, load_thresholds()).decision == "unresolved"


# ── Sibling institutions and misspelt words (#38) ────────────────────────


def test_a_trust_sibling_that_differs_by_one_word_does_not_tie_with_the_right_institution():
    """MAIT and MAIMS share 'Maharaja Agrasen Institute'; only TECHNOLOGY separates them for this complaint."""
    result = resolve_institution("maharaja agrsen institute of technology delhi", "Delhi", None, hero_index(), load_thresholds(), top_k=3)
    by_id = {c.permanent_id: c.score for c in result.candidates}
    assert result.top.permanent_id == "1-43655981521"
    assert by_id["1-43655981521"] - by_id["1-44079581354"] >= 0.05  # the auto-link margin


def test_a_rare_shared_word_outweighs_common_shared_words():
    """'Maharaja Surajmal Institute of Technology' shares MAHARAJA, INSTITUTE, TECHNOLOGY with the query; AGRASEN is what counts."""
    result = resolve_institution("maharaja agrsen institute of technology delhi", "Delhi", None, hero_index(), load_thresholds(), top_k=5)
    by_id = {c.permanent_id: c.score for c in result.candidates}
    assert by_id["1-43655981521"] > by_id["1-43665063453"]  # Maharaja Surajmal Institute of Technology


def test_misspelt_words_are_corrected_against_the_registry_vocabulary():
    from app.matching.resolve import _correct_spelling

    idx = hero_index()
    assert _correct_spelling("AGRSEN", idx) == "AGRASEN"
    assert _correct_spelling("AGRASEN", idx) == "AGRASEN"  # already a registered word
    assert _correct_spelling("XYZZY", idx) == "XYZZY"  # nothing close enough: left alone
    assert _correct_spelling("OF", idx) == "OF"  # too short to correct safely
    assert _correct_spelling("12345", idx) == "12345"


def test_two_equally_close_registry_words_always_give_the_same_correction():
    """A frozenset iterates in hash order, so a tie used to be settled differently from one run to the next."""
    from rapidfuzz import fuzz

    from app.matching.resolve import SPELLING_CUTOFF, _correct_spelling

    idx = hero_index()
    for token in ("TECHNLOGY", "INSTITUE", "MANAGMENT", "ENGINERING", "POLYTECHNC", "PHARMCY", "COLEGE", "SCHOL"):
        scores = {word: fuzz.ratio(token, word) for word in idx.vocabulary}
        best = max(scores.values())
        if best < SPELLING_CUTOFF:
            continue
        tied = sorted(word for word, score in scores.items() if score == best)
        assert _correct_spelling(token, idx) == tied[0], token


# ── Acronym-only complaints and localities (#44) ─────────────────────────


def test_a_complaint_that_is_just_the_acronym_resolves_with_the_district():
    result = resolve_institution("MAIT", "Delhi", "West Delhi", hero_index(), load_thresholds(), top_k=3)
    assert result.decision == "auto" and result.top.permanent_id == "1-43655981521"
    assert result.top.reasons


def test_an_acronym_shared_by_two_institutions_in_one_district_is_not_guessed():
    """MIT is the acronym of two Bhopal institutions in the hand-written world: that has to be a human's call."""
    import json

    tiny = json.loads((Path(__file__).resolve().parents[2] / "seed_data" / "tiny" / "institutions.json").read_text())
    insts = [InstitutionLite(r["permanent_id"], r["name"], r["name_norm"], r.get("acronym"), r["district"], r["state"], r["region"], r.get("trust_id"), r.get("parent_id")) for r in tiny["institutions"]]
    idx = build_index(insts, [], [], [], make_embedder("tfidf", "unused"))
    result = resolve_institution("MIT Bhopal", "Madhya Pradesh", None, idx, load_thresholds(), top_k=3)
    assert result.decision != "auto"
    assert {c.permanent_id for c in result.candidates} >= {"1-43657291568", "1-43658435413"}


def test_a_locality_given_instead_of_the_district_is_read_as_its_district():
    """'Pimpri' is a locality of Pune: it must not veto the Pune institution."""
    result = resolve_institution("Sinhgad Institute of Technology", "Maharashtra", "Pimpri",
                                 hero_index(), load_thresholds(), top_k=3)
    assert result.decision == "auto" and result.top.permanent_id == "1-43658264742"
    wrong = resolve_institution("Sinhgad Institute of Technology", "Maharashtra", "Nagpur",
                                hero_index(), load_thresholds(), top_k=3)
    assert "1-43658264742" not in {c.permanent_id for c in wrong.candidates}  # a different district still vetoes


def test_locality_aliases_come_from_the_seed_file_and_cover_every_generator_locality():
    from app.matching.normalize import load_district_aliases
    from seed_data.generator.vocab import LOCALITIES

    aliases = load_district_aliases()
    for district, locality in LOCALITIES.items():
        assert aliases[locality.upper()] == district.upper()
