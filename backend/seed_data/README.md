# `seed_data/` — the demo world and its file format

`python -m app.seed [--reset]` (and `POST /api/v1/demo/reset`) loads these files into an empty schema in one transaction, in foreign-key order.

## Two worlds

| Directory | What | Used by |
| --- | --- | --- |
| `seed_data/*.json` | The **full demo world** written by `python -m seed_data.generator --seed 26264` (#23): the real AICTE registry (3,751 institutions in six states, 46 trusts, 70 universities), 1,500 fabricated cases with action histories 458 of those institutions, 45 planted overlaps, 20 hard negatives, review queue, plus `ground_truth.json`. Deterministic: the same seed gives byte-identical files, and a test fails if the checked-in files differ from the generator's output. | the demo, `python -m app.eval` (#40) |
| `seed_data/tiny/` | The hand-written **hero story** (#6): the world described by `contract/fixtures/`. The generator reads it as its base and keeps it verbatim (ids 101–114), so the hero cases are identical after every reset. | the tests (`SEED_SET=tiny`), `python -m app.seed --tiny` |

`SEED_SET=full|tiny` (env, default `full`) picks which one seeding and demo reset load. Everything below describes the file format, which both worlds share.

## Conventions

- Ids are explicit integers (except `permanent_id`, a string `1-` + 6–10 digits, and `case_ref`). Seeding keeps them, so ids are stable across resets and issued tokens keep working.
- Enum values are the snake_case values in `app/core/enums.py` (the same as `frontend/src/lib/api/enums.ts`).
- Dates are `YYYY-MM-DD`; timestamps are UTC ISO 8601 ending in `Z`.
- **Relative dates.** A file with a top-level `as_of` date is shifted on load by `today() - as_of` days (`today()` honours `DEMO_TODAY`). Every date/timestamp **value** moves, plus the day inside each alert `dedupe_key`; dates written inside free text (remarks, `next_action`) do not. With `DEMO_TODAY` equal to `as_of` (2026-11-20) the data is identical to the contract fixtures; on any other day the hero case PGRC/2026/00412 is still on day 19 of 21.
- **Real institutions, fabricated everything else** (PRD A6): institution names, districts, addresses and Permanent IDs are AICTE's own (`aicte_registry.json`, below). Cases, complaint text, complainants, officers and every action are fabricated.
- Files marked *optional* may be omitted (the generator need not write them; the overlap engine creates groups, pairs and alerts at runtime).

## Files

| File | Top-level keys | Rows |
| --- | --- | --- |
| `bureaus.json` | `bureaus` | `{id, code, name, kind (bureau / cell / regional_office), region}`: RB, PGRC, AB, ACAD and the 10 Regional Offices (`region` set only for ROs) |
| `categories.json` | `categories` | `{id, code, name, default_sla_days, default_bureau_code}`: the 12 PRD §4.1 categories |
| `users.json` | `users` | `{id, email, name, role, bureau_id, region, is_admin}`. Roles: `senior_mgmt`, `bureau_head`, `ro_officer`, `intake_operator` (the 5 personas, ids 1–5, which log in) and `case_officer` (data only: they appear as `assigned_officer_id` and can never log in) |
| `institutions.json` | `trusts`, `institutions`, `aliases` | Trusts `{id, name, address, state}`; institutions `{permanent_id, name, name_norm, acronym, address, district, state, pin, region, inst_type, year_est, trust_id, parent_id, is_active}` (a university department has `parent_id` = its university); aliases `{id, permanent_id, alias_norm, source (seed / review / official)}` |
| `cases.json` | `as_of`, `cases` | Every PRD §4.1 `case` column (`id, case_ref, source_channel, external_ref, received_at, complainant_type, complainant_name, raw_institution_text, raw_state, raw_district, permanent_id, match_score, match_status, category_id, category_suggested_id, subject, description, status, current_bureau_id, assigned_officer_id, last_action_type, last_action_at, next_action, expected_disposal_date, sla_due_on, disposed_at, reopen_count, escalation_level, delay_risk, created_by, created_at, updated_at`) plus `actions`: the case's history, oldest first, each `{id, case_id, action_type, actor_id, bureau_id, from_bureau_id, to_bureau_id, to_officer_id, outcome, remarks, created_at}`. `last_action_type` / `last_action_at` must equal the last action |
| `reviews.json` *(optional)* | `as_of`, `reviews` | `{id, case_id, candidates: [{permanent_id, name, district, state, score, reasons}], status (pending / resolved), decided_permanent_id, decided_by, decided_at, created_at}` |
| `overlaps.json` *(optional)* | `as_of`, `groups`, `pairs` | Groups `{id, level, anchor_key, tier, status, coordinator_id, decided_by, decided_at, decision_remark, created_at, updated_at, links: [{case_id, added_at}]}` (`anchor_key` = a Permanent ID, `parent:<permanent_id>` or `trust:<id>`); pairs `{id, case_a_id < case_b_id, level, score, reasons, decision (none / confirmed / dismissed), created_at}` |
| `alerts.json` *(optional)* | `as_of`, `alerts` | `{id, type, severity, recipient_id, case_id, group_id, permanent_id, title, body, dedupe_key (type:recipient:entity:date, unique), is_read, created_at}` |

### `ground_truth.json` (written by the generator, ignored by the loader, read by `python -m app.eval`)

| Key | Meaning |
| --- | --- |
| `case_to_permanent_id` | true Permanent ID per case id (`null` for the four complaints about institutions that are not in the registry) |
| `noise` | per case, the name noise applied to its text: `typo`, `abbreviation`, `acronym_only`, `district_missing`, `city_for_district`, `wrong_state` |
| `overlap_clusters` | the true overlaps: `{group_id, level, anchor_key, tier, case_ids, split}` — the 45 planted ones plus the hero story's three |
| `hard_negatives` | `{kind: same_name_other_state / disposed_long_ago, case_ids, permanent_ids}`: pairs that must **not** be linked or flagged |
| `split_by_family`, `dev_case_ids`, `test_case_ids` | 50/50 dev/test split. Whole institution families (a trust, or a university and its departments) go to one side, so nothing leaks between tuning and reporting |

`aicte_registry.json` is the real institution list the generator reads (see "The real registry" below). `abbreviations.json` and `thresholds.json` belong to the matching engine (#19) and are not loaded into tables. The generator reads `abbreviations.json` (it never writes it) to produce abbreviated names.

### What the generator does

- **Names.** Real: the generator picks institutions from `aicte_registry.json` instead of inventing names. Families come from the registry's trusts and university links; same-name institutions in two states become the hard negatives. Complaints about real institutions that AICTE does not approve (IITs, IIMs, IHM Pusa) are left unresolved on purpose: the engine correctly finds no registry match.
- **Name noise** (per case, PRD §4.7): typos on 40% (p = 0.03 per character), abbreviations 35%, acronym only 15%, district missing 20%, city instead of district 10% (the localities are district aliases in `abbreviations.json`), wrong state 2%. The location rates are exact quotas, not coin flips.
- **No accidental overlaps.** Background cases at one trust or university family always sit in one bureau, so the only cross-bureau overlaps in the data are the planted ones and the ground truth is complete.
- **Planted overlaps.** 30 institution-level, 5 parent-level, 10 trust-level, each with near-identical wording and dates within a few weeks. With the default weights a trust-level pair scores at most 0.6, below `T_probable` (0.68), so the engine cannot find them until #44 settles whether non-institution levels use `T_possible`.
- **Case histories.** Chronological, and every step obeys the §4.3 transition table (a test replays them). A case's status, bureau, officer, SLA and counters are derived from its actions.

## What the tiny seed contains

| | Count | Notes |
| --- | --- | --- |
| Bureaus | 14 | RB 1, PGRC 2, AB 3, ACAD 4, Regional Offices 5–14 (5 = RO-CRO Central, 9 = RO-NWRO North-Western, 14 = RO-WRO Western) |
| Categories | 12 | ragging has a 7-day SLA, the rest 21 days |
| Users | 13 | personas 1–5 (4 = the North-Western RO officer), case officers 6–13 |
| Trusts / institutions / aliases | 2 / 11 / 5 | hero Maharaja Agrasen Institute of Technology (MAIT, Delhi) and its two trust siblings; Bharati Vidyapeeth Deemed University (Pune) with two constituent colleges; National Institute of Technical Teachers' Training and Research in Bhopal and in Chennai (a same-name pair, hard negative for the location veto); two Bhopal institutes that share the acronym MIT; Sinhgad Institute of Technology (Pune) |
| Cases / actions | 13 / 19 | the four §4.7 hero cases (PGRC/2026/00412 day −19 under process, RB/2026/00087 day −10 under process, RO-NWRO/2026/00133 day −5 received, RB/2026/00079 day −30 escalated) and nine others covering every status; actions 1001–1019 |
| Reviews | 2 | pending (cases 112 and 113) |
| Overlap groups / pairs | 4 / 6 | 1 institution probable open (hero), 2 trust possible open, 3 parent possible dismissed, 4 institution possible open |
| Alerts | 6 | for the RB head |

The PRD's hero intake (`maharaja agrsen institute of technology delhi`, live in demo step 4) is **not** seeded; it is created during the demo as PGRC/2026/00519 on the tiny seed (PGRC/2026/00698 on the full seed).

## The real registry (`aicte_registry.json`)

Built by `python -m seed_data.aicte_import` from `aicte_raw/AICTE_Approved_Colleges_Master.xlsx` (provenance in `aicte_raw/SOURCE.md`). The list has no state, PIN or programme column, so the importer:

- finds each state's block of rows (rows are grouped by state; the six demo states' start rows and sizes are recorded in the script and checked against the SHA-256 of the file and each block's districts);
- takes the institution type from the name (engineering, management, pharmacy, polytechnic, hotel management, university); a name that does not say is left out;
- groups institutions into a trust only where a distinctive shared name makes it a family (a hand-reviewed list), and links a university to its campuses only from a hand-checked list. No link is invented;
- cleans names (case, encoding, known misspellings) and drops same-name duplicates in one district.

The committed JSON means the demo never needs the raw file or the network.
