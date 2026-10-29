# `app.matching` — the Cross-Bureau Overlap Engine

The signature feature (PRD §4.4–4.5): resolve a messy institution mention to a Permanent ID, then find related cases at institution, parent-university and trust level and explain why.

## Rules

- **Pure Python** (PRD §2). Nothing here imports FastAPI, Starlette, SQLModel or SQLAlchemy (`tests/matching/test_interface.py` enforces it). Dataclasses go in, dataclasses come out; the service façade (`app/modules/engine/service.py`, #8) converts table rows and persists results inside the caller's transaction.
- **Registry-anchored groups.** A group is anchored on a Permanent ID, a parent university or a trust (`anchor_key`), never built by chaining pairs. One wrong pair can't merge unrelated cases (no transitive closure).
- **Dismissed pairs never come back.** Once an official dismisses a pair, `detect_overlaps` never returns it again; a new case joining a dismissed group reopens it with only the new pairs.
- **Explanations, not bare scores.** Every `Candidate` and `PairEvidence` carries plain-language `reasons`.
- **No magic numbers.** Every cutoff and weight lives in `Thresholds`, loaded only from `seed_data/thresholds.json` plus env overrides (PRD §9).
- Code against the `MatchIndex` protocol, never SQLite, so the PostgreSQL + pgvector swap touches one file.

## Choosing an engine

`get_engine(mode)` returns a `MatchingEngine`. The caller passes `Settings.MATCHING_ENGINE` (`stub` by default; #38 flips it to `real`).

| Mode | Class | Behaviour |
| --- | --- | --- |
| `stub` | `StubEngine` (`stub.py`) | Canned hero-story results, the same as `contract/fixtures/post_institutions_resolve.json`. Ignores `idx` and `th`. For building and demoing screens before the real engine exists; never tune it |
| `real` | `RealEngine` (`engine.py`) | Delegates to `resolve.py` and `overlap.py`; raises `ValueError` without a `MatchIndex` and `Thresholds` |

## Public API

### `types.py` — data in and out

| Name | What it is |
| --- | --- |
| `InstitutionLite` | Registry row: `permanent_id, name, name_norm, acronym, district, state, region, trust_id, parent_id` |
| `AliasLite` | Known spelling: `alias_norm, permanent_id, source` (seed / review / official) |
| `CaseLite` | `id, case_ref, permanent_id, bureau_id, bureau_code, category_code, description, received_at, status, disposed_at`; `is_open` is derived from `status`. `case_ref` and `bureau_code` are only used in reasons |
| `Candidate` | `permanent_id, name, district, state, score ∈ [0,1], reasons` |
| `ResolutionResult` | `decision` (auto / pending_review / unresolved / provided) + `candidates` best first; `.top`, `.permanent_id` (set only when the decision links one), `.score` |
| `PairEvidence` | `case_a < case_b, level, score ∈ [0,1], reasons`; build with `PairEvidence.of(x, y, …)` in any order |
| `IssueCluster` | `cluster_id, label, case_ids`: cases about the same issue inside a group (complete linkage) |
| `GroupLite` | An existing group: `group_id, level, anchor_key, tier, status, case_ids` |
| `GroupPlan` | What to upsert: `action` (create / extend / reopen), `level, anchor_key, tier, case_ids, pairs, clusters, reasons, group_id` (None only for create); `.banner` |
| `Thresholds` | `t_auto > t_review`, `t_probable > t_possible`, `margin`, plus `ResolutionWeights`, `PairWeights`, `LevelWeights`; validated on construction |
| `BANNER_PROBABLE` | "Potential Overlapping Cases – Coordination Required" (the PS's exact text) |
| `BANNER_POSSIBLE` | "Possible Overlapping Cases – Review Suggested" |

### Functions

| Function | Inputs → output | Owner |
| --- | --- | --- |
| `normalize.extract_permanent_id(text)` | str → first `1-\d{6,11}` in the text, or None | done (#5) |
| `normalize.load_abbreviations(path=None)` | → short form → expansion, from `seed_data/abbreviations.json` | #19 |
| `normalize.normalize_name(text, abbreviations)` | → uppercase, no punctuation, abbreviations expanded, stopwords dropped | #19 |
| `normalize.tokens(text_norm)` | → list of tokens | #19 |
| `normalize.acronym_of(name_norm)` | → e.g. `MAIT` | #19 |
| `normalize.extract_district_hint(text, districts)` | → canonical district (JBP → JABALPUR) or None | #19 |
| `thresholds.load_thresholds(path=None, overrides=None)` | → validated `Thresholds` (file + non-None env overrides) | #19 |
| `embed.make_embedder(mode, model_name)` | → `Embedder` (`fit(corpus)`, `encode(texts)` → L2-normalized array) | #20 |
| `index.build_index(institutions, aliases, cases, dismissed_pairs, embedder)` | → `MatchIndex` | #20 |
| `resolve.resolve_institution(raw_text, raw_state, raw_district, idx, th, top_k=5)` | → `ResolutionResult`: exact tier, state blocking, district **location veto**, weighted score, auto only with the margin rule | #21 |
| `overlap.pair_score(new, other, level, idx, th)` | → float in [0, 1] | #22 |
| `overlap.detect_overlaps(new, related, idx, th)` | → `PairEvidence` list: institution cross-bureau pairs always, others only ≥ `t_possible`, never dismissed pairs | #22 |
| `overlap.issue_clusters(case_ids, pairs, t_possible)` | → `IssueCluster` list (complete linkage) | #22 |
| `overlap.plan_group_updates(new, evidence, existing, idx, th)` | → `GroupPlan` list, anchored on the registry | #22 |
| `engine.get_engine(mode="stub")` | → `StubEngine` or `RealEngine` | done (#5) |

`MatchingEngine` (both engines) exposes `resolve_institution`, `detect_overlaps` and `plan_group_updates` with the same arguments as the functions above.

### `MatchIndex` protocol (`index.py`, built in #20)

| Method | Returns |
| --- | --- |
| `candidates_in_state(state)` | Institutions in the state, or all when the state is unknown (blocking) |
| `get_institution(permanent_id)` | `InstitutionLite` or None |
| `resolve_alias(alias_norm)` | Permanent ID for an exact name or confirmed alias, or None |
| `trust_name(trust_id)` | Trust name, for reasons |
| `name_similarity(query_norm, permanent_ids)` | Semantic similarity per candidate, in [0, 1] |
| `description_similarity(case_a, case_b)` | Semantic similarity of two descriptions, in [0, 1] |
| `level_between(pid_a, pid_b)` | institution / parent / trust / None |
| `related_cases(permanent_id, window_days, today)` | Open cases (or disposed within the window) at the same institution, parent/siblings or trust |
| `is_dismissed(case_a, case_b)` | True if an official dismissed the pair |
| `add_alias(alias_norm, permanent_id)` | Learn a reviewer-confirmed spelling |
| `upsert_case(case)` | Add or refresh a case and its vector |

## Tests

`pytest tests/matching` runs with no database. Per PRD §9, every PR that changes this package pastes the `pytest tests/matching` result (and, once #40 exists, a fresh `python -m app.eval` line) in its description.
