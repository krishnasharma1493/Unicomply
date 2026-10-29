# Unicomply — Integrated Complaint Monitoring Dashboard

SIH 2026 · PS 26264 (AICTE) · Hackathon PRD v1.0 · Oct 27, 2026 · @hi lol

## How to use this PRD

This PRD applies the team's Hackathon Blueprint v3.0 to SIH problem statement 26264 and is the single source of truth for scope and the API contract. Keep both files in `docs/`: generic patterns (error handlers, JWT, token store, Axios client, seed/reset, smoke-test style) are used **verbatim from the base blueprint**; this file defines everything domain-specific.

| # | Change vs base blueprint | Why |
| --- | --- | --- |
| 1 | `items` replaced by the AICTE domain: institutions, trusts, bureaus, cases, case actions, overlap groups, alerts | PS 26264 data model |
| 2 | Per-user `owner_id` scoping replaced by **role + bureau + region scoping** (`scope_cases()`) | PS requires authorized officials across RB, PGRC, other cells and Regional Offices |
| 3 | Signature feature = **Cross-Bureau Overlap Engine** (institution resolution + overlap detection + explanations) | The PS's "Innovation Expected" section |
| 4 | Fixture fallback replaced by **offline fallback model**: TF-IDF character n-grams when the embedding model is unavailable | Overlap detection must still run with no Wi-Fi |
| 5 | Background job loop is **Must**, not optional | PS demands SLA, reminder and escalation alerts |
| 6 | Added: synthetic data generator with ground truth + accuracy evaluation script | No real AICTE data; judges will ask how it was tested |
| 7 | Added: research evidence appendix mapping each design choice to a study | Defensible design in Q&A |
| 8 | Database stays SQLite for the demo; PostgreSQL + pg\_trgm + pgvector is the documented production path (§1) | Laptop-first, offline demo; matching runs in Python at demo scale |
| 9 | Project named Unicomply; tech stack frozen: FastAPI + SQLModel, SQLite for the demo → PostgreSQL in production, React + Vite + TypeScript | Team decision |
| 10 | Auth simplified to a one-click persona switcher with 5 personas; per-user accounts and hardening moved to the production-readiness slide (§12A) | Judges score role-based workflows, not login hardening |

## §0 Hackathon Brief & Assumptions

Unicomply gives AICTE officials one live view of every institution-related complaint across RB, PGRC, other cells and Regional Offices, and automatically flags when two units are acting on the same institution.

| Field | Value |
| --- | --- |
| **Project name** | Unicomply |
| **Problem statement** | SIH 26264 — Integrated Dashboard for Monitoring and Tracking Institution-Related Complaint Cases Across AICTE Bureaus/Cells |
| **One-line pitch** | AICTE officials can see every complaint about an institution in one place and get alerted when RB, PGRC or a Regional Office are acting on the same institution, so actions are coordinated instead of duplicated or contradictory |
| **Domain** | GovTech / e-governance / grievance redressal |
| **Primary resources** | `cases` (complaints + regulatory actions), `institutions` (AICTE Permanent ID registry) |
| **Secondary resources** | `trusts`, `bureaus`, `case_actions`, `overlap_groups`, `alerts`, `match_reviews` |
| **Signature feature** | **Cross-Bureau Overlap Engine**: resolves messy institution names to a Permanent ID, detects overlapping cases at institution, parent-university and trust level, and shows "Potential Overlapping Cases – Coordination Required" with the reasons |
| **Users** | AICTE officials only (no student-facing portal). Demo: 5 seeded personas, switched in one click |
| **Judging criteria** | `<PASTE THE OFFICIAL SIH RUBRIC HERE>` and map each criterion to a step in §10A |

### The problem in one paragraph

Complaints about the same institution reach AICTE through several channels (CPGRAMS, AICTE's feedback portal, email to complaint@aicte-india.org, letters, Regional Offices) and are handled by different units. RB can also act on its own (inspections, approval actions). With no shared view, the same institution can face parallel or conflicting actions, duplicate effort, delays, and no clarity on which unit owns a case.

### Personas

| Persona (demo account) | Role key | What they need from Unicomply |
| --- | --- | --- |
| Senior officer (`senior@aicte.example`, also `is_admin` for demo reset) | `senior_mgmt` | All-India KPIs, overlaps, SLA breaches, monthly/quarterly reports |
| PGRC head (`pgrc.head@aicte.example`) | `bureau_head` | PGRC workload, CPGRAMS cases near the 21-day limit, overlaps involving PGRC |
| RB head (`rb.head@aicte.example`) | `bureau_head` | RB workload + every overlap that involves RB |
| North-Western RO officer (`ro.nw@aicte.example`) | `ro_officer` | Cases of institutions in the North-Western region |
| Intake operator (`intake@aicte.example`) | `intake_operator` | Register email/letter cases; resolve uncertain institution matches |

Case officers are **not** logins in the demo: `assigned_officer_id` stays a data field with seeded officer names, and the bureau head acts for the bureau. Production adds per-officer logins (§12A).

### Goal

A working, end-to-end product that shows the core idea **reliably in 3–5 minutes**, on stage, offline if needed: a new complaint typed with a misspelt college name is resolved to the right Permanent ID and immediately surfaces an overlap with an RB action and a Regional Office case, with reasons an official can trust.

### Non-goals

Student-facing complaint portal, real CPGRAMS/email integration, real AICTE data, Parichay SSO, payments, multi-tenancy, scaling/HA, queues, microservices, compliance certification. Where a non-goal matters for production, §12A says how it would be done.

### Assumptions

| # | Assumption | Why |
| --- | --- | --- |
| A1 | Backend is FastAPI only (no Flask, no Node). All business logic, matching and ML live in the backend | Base blueprint A1–A2; the ML stack is Python |
| A2 | Database: **SQLite via SQLModel** for the demo. Fuzzy matching (RapidFuzz) and vector similarity (NumPy) run in Python over an in-memory index built at startup | Demo scale (\~500 institutions, \~1,500 cases) is tiny; zero setup, offline, reset by deleting a file. Production path in §1 |
| A3 | Auth is demo-grade: a one-click persona switcher logs in through the base blueprint login (one shared demo password, one 12-hour JWT), plus the `AUTH_DISABLED` switch (base blueprint) | Judges score role-based workflows, not login hardening; a user identity is still needed for the audit trail and bureau-scoped views |
| A4 | **Scoping is by role, bureau and region**, not by owner. Out-of-scope records return 404 | PS: authorized officials, bureau/cell-wise views |
| A5 | Officials are the only users. Complaints enter via an intake API that stands in for CPGRAMS/portal/email feeds; the demo uses an intake form | Target users in the PS are all AICTE officials |
| A6 | **Institutions are real, everything else is synthetic.** Institution names, districts, addresses and Permanent IDs (format `1-` followed by 6 to 11 digits) come from AICTE's public approved-institution list. Cases, complaint text, complainants, officers and all case history are fabricated for the demo | No real complaints or personal data exist in the system; the registry the matcher searches is realistic |
| A7 | Default SLA = **21 days**, matching the CPGRAMS limit; an interim reply records a revised expected date but the case still counts as beyond the prescribed timeline after day 21 | DARPG reduced the CPGRAMS limit from 30 to 21 days (Aug 2024) |
| A8 | The embedding model is downloaded once before the event; `EMBEDDINGS_MODE=tfidf` is the offline fallback with no download | The signature feature must never fail on stage |
| A9 | JSON is snake\_case; ids are integers except `permanent_id` (string) and `case_ref` (human-readable, e.g. `PGRC/2026/00412`) | Base blueprint A6 + real-looking references |
| A10 | Primary demo runs on a team laptop at localhost; a hosted link is a bonus | Base blueprint A7 |

### Success metrics (demo and judging)

| Metric | Target |
| --- | --- |
| Demo path runs end to end with no restart | 3 consecutive clean rehearsals |
| Demo length | 3:30–4:30 inside a 5:00 slot |
| New complaint → institution resolved + overlap alert shown | Under 2 s |
| Institution resolution on the synthetic test set (§10) | F1 ≥ 0.90, reported live from `python -m app.eval` |
| Overlap detection on planted scenarios (§10) | Recall ≥ 0.90 at Probable + Possible; precision reported honestly |
| Every PS "Key Feature" (1–8) | Mapped to a screen and a demo moment (§7, §10A) |
| Crashes or blank screens during demo | 0; every screen has loading, empty and error states |
| Recovery if something breaks | Under 30 s using §10B |
| Fresh-clone setup | ≤ 10 minutes by someone who didn't write the README |

## §1 Tech Stack

The base blueprint stack stays; this PRD adds a Python matching/ML layer and a charting library. **No version numbers here, on purpose**: follow the base blueprint's Version Safety Rule (search + `pip index versions` / `npm show`, then freeze).

| Layer | Choice | Notes |
| --- | --- | --- |
| Backend framework | FastAPI (`fastapi[standard]`) + Uvicorn | `/docs` is the live API contract |
| ORM / DB | SQLModel on **SQLite** (`app.db`) | Production: PostgreSQL (see below) |
| Validation / config | Pydantic + `pydantic-settings` | Exit on bad config |
| Auth | One-click persona switcher → base blueprint demo login + PyJWT (12 h) | `role`, `bureau_id`, `region` claims read from DB, not token |
| Fuzzy name matching | **RapidFuzz** | token-set ratio, partial ratio, Jaro-Winkler; runs over a same-state candidate block |
| Semantic similarity | **sentence-transformers** with a multilingual model (e.g. `paraphrase-multilingual-MiniLM-L12-v2`) | Candidate retrieval + issue-text similarity. Model downloaded before the event |
| Offline fallback | scikit-learn `TfidfVectorizer` (char n-grams 3–5) | `EMBEDDINGS_MODE=tfidf`; no download, deterministic |
| Vector search | NumPy cosine over an in-memory matrix | \~1,500 vectors; sub-millisecond. FAISS/pgvector only at production scale |
| Category classifier (N1) | scikit-learn TF-IDF + `LinearSVC`, `class_weight='balanced'` | Suggests a category at intake; trained on synthetic labelled complaints |
| Threshold calibration | scikit-learn `GaussianMixture` (2 components) on match scores | ZeroER-style cutoffs without labels; written to `seed_data/thresholds.json` |
| Delay-risk model (N4) | XGBoost + SHAP | Predicts SLA breach at intake, with the top reasons |
| Background jobs | `asyncio` loop in FastAPI lifespan | SLA warnings/breaches, reminders, overlap re-scan |
| Real-time (N2) | python-socketio ↔ socket.io-client | Overlap alert appears on another official's screen live |
| Exports | stdlib `csv` (Must); `openpyxl` for .xlsx (N5) | Reports module |
| Frontend | React + Vite + TypeScript strict, react-router-dom, TanStack Query, Axios, React Hook Form + Zod, DOMPurify | Unchanged from base blueprint |
| Domain UI | **Recharts** (charts), TanStack Table (case tables), a small UI kit (shadcn/ui or Ant Design: pick one at kickoff) | Dashboard-heavy UI |
| Testing | pytest + `TestClient` (smoke + matching unit tests), `python -m app.eval` (accuracy) | §10 |

### Database decision: SQLite for the demo, PostgreSQL in production

The data is relational at its core (institution ↔ trust ↔ parent, case ↔ actions ↔ bureau ↔ officer, overlap group ↔ cases) and the reports are joins and group-bys, so a relational database is right. MongoDB is not chosen: overlap detection and reports are joins and GROUP BYs; one intake must write case, action, overlap links and alerts atomically; case and audit records need a fixed schema; and Mongo's fuzzy and vector search (Atlas Search) is cloud-only, which breaks the offline demo and raises data-sovereignty questions. Raw channel payloads, the one document-shaped part, go in a JSON (JSONB in Postgres) column.

- **Demo (this PRD):** SQLite. At \~500 institutions and \~1,500 cases, RapidFuzz and NumPy in Python are instant, the demo runs offline, and `python -m app.seed --reset` restores state in seconds.
- **Production (pitch slide + §12A):** PostgreSQL with `pg_trgm` (fuzzy name search in the DB), `pgvector` (embeddings), JSONB for raw channel payloads, Alembic migrations. With SQLModel the switch is a `DATABASE_URL` change plus moving two queries into SQL.
- **Rule:** write matching code against the `MatchIndex` interface (§4), never against SQLite specifics, so the production swap touches one file.

## §1A MVP Scope

**Rule:** nothing from "Nice to have" starts until every "Must have" row is done and the demo path (§10A) has run once end to end. Each Must row names the PS Key Feature it satisfies.

### Must have

| # | Feature | PS feature | Done when |
| --- | --- | --- | --- |
| M1 | Persona switcher + role-scoped views | Target users | 5 persona cards log in with one click (JWT per persona); PGRC head sees PGRC cases, RB head RB cases, North-Western RO officer only North-Western-region cases; out-of-scope ids return 404 |
| M2 | Institution registry + **Institution 360** page | 1 | Search by name or Permanent ID; profile shows address, region, trust, parent/departments, and every case grouped by bureau with status |
| M3 | **Case intake** with live institution resolution | 2, 3 | Intake form (channel, raw institution text, state/district, category, description) shows top-3 candidate institutions with scores while typing; submit creates a case with a `case_ref` |
| M4 | **Overlap Engine** (signature) | 3, Innovation | On every new or re-matched case: resolve → find related open cases at institution/parent/trust level → score → create or extend an overlap group → alert. Works with `EMBEDDINGS_MODE=tfidf` offline |
| M5 | **Overlap Center** | 3 | List groups by tier/status/level; side-by-side cases with "Why flagged" reasons; Confirm / Dismiss / Assign coordinator; confirmed links shown on every linked case |
| M6 | **Match Review queue** | 3 | Mid-confidence matches wait for an intake operator; picking an institution saves an alias and re-runs overlap detection |
| M7 | **Case Detail + workflow** | 2, 5 | All tracking fields; actions: assign, transfer, escalate, interim reply, remark, dispose, reopen (validated state machine); chronological action history with officer, bureau, timestamp, remarks |
| M8 | **Home dashboard** (scoped KPIs) | 4 | Cards: total, pending, under process, disposed, transferred, escalated, beyond SLA, open overlaps; bureau workload bar chart; ageing buckets; institution-wise status table |
| M9 | **Search & filters** | 6 | Cases filterable by institution name, Permanent ID, case ref, bureau, region, category, status, date range; paginated |
| M10 | **Alerts** (bell + page) + SLA job | 7 | Job loop creates overlap, SLA-warning (day 17), SLA-breach (day 21+), escalation and no-action-reminder (7 days) alerts; grouped per institution per day; mark read |
| M11 | **Reports** + CSV export | 8 | Bureau-wise, region-wise, institution-wise history, status-wise, ageing, disposal rate, reopen rate, overlaps, monthly/quarterly; CSV download |
| M12 | Synthetic data generator + seed/reset + **accuracy eval** | — | `python -m app.seed --reset` < 10 s; `python -m app.eval` prints precision/recall/F1 for resolution and overlap on planted ground truth |
| M13 | Consistent errors + UI states, `/docs`, clean-clone README, backup demo video | — | As base blueprint M6–M9 |

### Nice to have (priority order)

| # | Feature | Why it's worth it |
| --- | --- | --- |
| N1 | Category classifier suggestion at intake (TF-IDF + LinearSVC) | Shows AI triage; feeds the overlap score |
| N2 | Real-time: overlap alert pops on the RB head's screen when PGRC confirms | The most visible "coordination" moment in the demo |
| N3 | Feedback-tuned thresholds: dismissed pairs never re-alert; `python -m app.calibrate` refits GMM cutoffs | Answers "what about false alarms?" |
| N4 | Delay-risk score at intake (XGBoost + SHAP top-3 reasons) | Proactive SLA management |
| N5 | .xlsx and PDF report export | Officials live in Excel |
| N6 | Document upload on actions (local `uploads/`, type + size checks) | PS mentions supporting documents |
| N7 | Hindi / Hinglish complaint text in seed data + MuRIL embeddings | Real complaints are code-mixed |
| N8 | Admin settings page (SLA days per category, thresholds, bureaus) | Configurability story |
| N9 | Public deployed link, dark mode, mobile polish | Polish |

### Explicitly out

Student-facing portal, per-user passwords and account management, real CPGRAMS/email/IMAP ingestion, Parichay SSO, OCR of scanned letters, real email/SMS notifications, Postgres migration, multi-language UI. Each has a production note in §12A.

## §2 Repository Structure

Same layout and rules as the base blueprint §2 (root `.gitignore`, `.cursorignore`, `main` always runnable); domain modules replace `items/`, and a `matching/` package holds the signature feature.

```
unicomply/
├── backend/
│   ├── app/
│   │   ├── main.py                  # lifespan: init_db, seed_if_empty, build MatchIndex, start job loop
│   │   ├── models.py                # imports every table model
│   │   ├── seed.py                  # python -m app.seed [--reset]  (loads seed_data/*.json)
│   │   ├── eval.py                  # python -m app.eval  → P/R/F1 vs ground truth
│   │   ├── calibrate.py             # python -m app.calibrate → GMM thresholds (N3)
│   │   ├── realtime.py              # python-socketio (N2)
│   │   ├── jobs.py                  # SLA / reminder / escalation / overlap re-scan loop
│   │   ├── core/                    # config, db, security, deps (+ scope.py), errors, schemas — base blueprint
│   │   │   └── scope.py             # scope_cases(), get_case_in_scope_or_404(), require_roles()
│   │   ├── matching/                # SIGNATURE FEATURE — pure Python, no FastAPI imports
│   │   │   ├── normalize.py         # clean text, expand abbreviations, acronyms, Permanent-ID regex
│   │   │   ├── embed.py             # Embedder: sentence-transformers | tfidf fallback
│   │   │   ├── index.py             # MatchIndex: institutions by state, vectors, aliases
│   │   │   ├── resolve.py           # resolve_institution() → candidates + decision + reasons
│   │   │   ├── overlap.py           # detect_overlaps() → groups, tiers, reasons (complete linkage)
│   │   │   └── thresholds.py        # loads seed_data/thresholds.json
│   │   ├── modules/
│   │   │   ├── auth/  users/  demo/ # base blueprint
│   │   │   ├── meta/                # GET /meta: bureaus, regions, categories, statuses
│   │   │   ├── institutions/        # registry, search, 360 profile, resolve preview
│   │   │   ├── cases/               # intake, list/search, detail, actions (workflow), service.py
│   │   │   ├── reviews/             # match review queue
│   │   │   ├── overlaps/            # overlap groups, decisions
│   │   │   ├── alerts/              # list, mark read
│   │   │   ├── dashboard/           # KPI summary, workload, ageing
│   │   │   └── reports/             # report endpoints + CSV
│   │   └── utils/time.py
│   ├── seed_data/
│   │   ├── generator/               # python -m seed_data.generator  → writes the JSON below
│   │   ├── institutions.json        # ~500 synthetic institutions, ~60 trusts, ~15 universities w/ departments
│   │   ├── users.json  bureaus.json  categories.json
│   │   ├── cases.json               # ~1,500 cases with actions, incl. the demo hero story
│   │   ├── ground_truth.json        # true permanent_id per case + true overlap clusters
│   │   ├── abbreviations.json       # ENGG→ENGINEERING, INST→INSTITUTE, ...
│   │   └── thresholds.json          # match + overlap cutoffs
│   ├── tests/  conftest.py  test_smoke.py  test_matching.py  test_workflow.py
│   ├── .env.example  requirements.txt  requirements.lock.txt  README.md
├── frontend/
│   └── src/
│       ├── lib/  auth/  components/              # base blueprint
│       ├── features/
│       │   ├── dashboard/  cases/  intake/  reviews/
│       │   ├── overlaps/  institutions/  alerts/  reports/  admin/
│       └── pages/                               # one page per §7 route
└── docs/
    ├── HACKATHON_PRD.md                         # base blueprint
    ├── UNICOMPLY_PRD.md                          # this document (export as Markdown)
    └── pitch/                                   # slides, architecture image, backup video
```

**Extra rules for this project:**

- `app/matching/` never imports FastAPI or SQLModel sessions; it takes plain dataclasses in and returns plain dataclasses out. This keeps it unit-testable and swappable for Postgres later.
- Seed JSON (including `ground_truth.json`) is committed; `app.db` never is.
- The embedding model cache folder (e.g. `~/.cache/huggingface`) is copied to the demo laptop before the event.

## §3 Environment Variables

Keep every base blueprint variable (server, DB, auth, CORS, seed, realtime, scheduler); add the domain block below to `backend/.env.example` and to `Settings` in `app/core/config.py`. Thresholds live in `seed_data/thresholds.json` (so calibration can rewrite them); env values override the file when set.

```env
# ── Matching & overlap engine ───────────────────────────────────────────
EMBEDDINGS_MODE=model               # model | tfidf  (tfidf = offline fallback, no download)
EMBEDDING_MODEL_NAME=paraphrase-multilingual-MiniLM-L12-v2
MATCH_TOP_K=5                       # candidates returned to intake preview / review queue
MATCH_T_AUTO=                       # optional override of thresholds.json (auto-link cutoff)
MATCH_T_REVIEW=                     # optional override (below this → unresolved, still reviewed)
OVERLAP_T_PROBABLE=                 # optional override ("Coordination Required")
OVERLAP_T_POSSIBLE=                 # optional override ("Possible overlap")
OVERLAP_WINDOW_DAYS=180             # compare with cases received / active in this window

# ── SLA & alerts ────────────────────────────────────────────────────────
SLA_DEFAULT_DAYS=21                 # CPGRAMS limit (DARPG, Aug 2024)
SLA_WARN_DAY=17                     # SLA-warning alert from this day
NO_ACTION_REMINDER_DAYS=7           # reminder if no case_action in N days
JOB_TICK_SECONDS=60                 # demo: 60; set 10 while rehearsing alerts

# ── Demo ────────────────────────────────────────────────────────────────
DEMO_TODAY=2026-11-20               # optional: freeze "today" so ageing/SLA numbers match the script
```

Frontend `.env.example` is unchanged from the base blueprint; set `VITE_DEMO_EMAIL=senior@aicte.example` so the login is pre-filled with the persona the demo starts as.

**Validation rules:** `EMBEDDINGS_MODE` is a `Literal["model","tfidf"]`; thresholds are floats in \[0, 1\] with `MATCH_T_REVIEW < MATCH_T_AUTO` and `OVERLAP_T_POSSIBLE < OVERLAP_T_PROBABLE` (a `model_validator` exits on violation); `DEMO_TODAY` is an optional ISO date used by `utils.time.today()` everywhere instead of `date.today()`.

## §4 Backend Architecture

One FastAPI process owns everything: intake, the overlap engine, workflow, alerts and reports; the matching code is a pure-Python package the routers call. Base blueprint §4 patterns (middleware order, error shape, `AppError`, JWT deps, seed/reset) apply unchanged.

&#91;embedded content: system architecture · 5 channels, 1 engine, 1 dashboard\]

Every channel posts to one intake API; the engine resolves and links before anything is stored, and the job loop turns stored state into alerts.

### 4.1 Data model

All tables are SQLModel `table=True` models with separate Create / Update / Read schemas (base blueprint pattern). Timestamps UTC.

| Table | Key columns | Notes |
| --- | --- | --- |
| `trust` | `id`, `name`, `address`, `state` | One trust runs many institutions → trust-level overlap |
| `institution` | **`permanent_id`** (str PK, `1-XXXXXXXXXX`), `name`, `name_norm`, `acronym`, `address`, `district`, `state`, `pin`, `region`, `inst_type`, `year_est`, `trust_id` → trust, `parent_id` → institution (self), `is_active` | The registry. `parent_id` links a university department to its university |
| `institution_alias` | `id`, `permanent_id`, `alias_norm`, `source` (seed / review / official), `created_by`, `created_at`; unique (`permanent_id`, `alias_norm`) | Grows each time a reviewer confirms a match |
| `bureau` | `id`, `code` (RB, PGRC, AB, ACAD, RO-CRO, …), `name`, `kind` (bureau / cell / regional\_office), `region` | Bureaus, cells and the 10 Regional Offices |
| `user` | `id`, `email`, `name`, `role`, `bureau_id`, `region`, `is_admin` | `is_admin` kept for base blueprint `/demo/reset` |
| `category` | `id`, `code`, `name`, `default_sla_days`, `default_bureau_code` | fee\_refund, certificate\_withheld, admission\_irregularity, faculty\_shortage, infrastructure\_deficiency, salary\_non\_payment, ragging, unapproved\_course, scholarship, harassment, exam\_result, other |
| `case` | `id`, **`case_ref`** (unique, e.g. `PGRC/2026/00412`), `source_channel`, `external_ref`, `received_at`, `complainant_type`, `complainant_name`, **`raw_institution_text`**, `raw_state`, `raw_district`, `permanent_id` (nullable), `match_score`, `match_status`, `category_id`, `category_suggested_id`, `subject`, `description` (≤ 4000), **`status`**, `current_bureau_id`, `assigned_officer_id`, `last_action_type`, `last_action_at`, `next_action`, `expected_disposal_date`, `sla_due_on`, `disposed_at`, `reopen_count`, `escalation_level`, `delay_risk`, `created_by`, `created_at`, `updated_at` | Covers every PS "Complaint/Case Tracking" field |
| `case_action` | `id`, `case_id`, `action_type`, `actor_id`, `bureau_id`, `from_bureau_id`, `to_bureau_id`, `to_officer_id`, `outcome`, `remarks` (≤ 2000), `created_at` | **The** workflow and action history (PS feature 5) |
| `document` (N6) | `id`, `case_id`, `action_id`, `filename`, `stored_path`, `mime`, `size_bytes`, `uploaded_by`, `created_at` | Supporting documents |
| `match_review` | `id`, `case_id`, `candidates` (JSON: permanent\_id, score, reasons), `status` (pending / resolved), `decided_permanent_id`, `decided_by`, `decided_at` | Human-in-the-loop queue for mid-confidence matches |
| `overlap_pair` | `id`, `case_a_id` < `case_b_id`, `level`, `score`, `reasons` (JSON list), `decision` (none / confirmed / dismissed), `created_at` | Pairwise evidence; dismissed pairs never re-alert |
| `overlap_group` | `id`, `level` (institution / parent / trust), `anchor_key`, `tier` (probable / possible), `status` (open / confirmed / dismissed / resolved), `coordinator_id`, `decided_by`, `decided_at`, `decision_remark`, `created_at`, `updated_at` | One group = cases that must be coordinated |
| `overlap_link` | `id`, `group_id`, `case_id`, `added_at`; unique (`group_id`, `case_id`) | Group membership |
| `alert` | `id`, `type` (overlap / sla\_warning / sla\_breach / escalation / reminder), `severity` (info / warning / critical), `recipient_id`, `case_id`, `group_id`, `permanent_id`, `title`, `body`, `dedupe_key` (unique), `is_read`, `created_at` | `dedupe_key` = type + recipient + entity + date → one alert per thing per day |
| `audit_log` | `id`, `actor_id`, `entity`, `entity_id`, `field`, `old_value`, `new_value`, `created_at` | Written by services on every state change |

**Derived, never stored:** *pending* = status ≠ disposed; *under process* = status ∈ {under\_process, interim\_reply}; *beyond SLA* = open and `today() > sla_due_on`; *ageing bucket* = 0–7 / 8–14 / 15–21 / 22–45 / 45+ days since `received_at`. Vectors are not stored in the DB in the demo; `MatchIndex` builds them at startup and caches them under `seed_data/.cache/`.

### 4.2 Roles and scoping

Every list query goes through `scope_cases(stmt, user)`; every by-id load goes through `get_case_in_scope_or_404()` (404, never 403, as in the base blueprint).

| Role | Persona | Can see (full detail) | Can do |
| --- | --- | --- | --- |
| `senior_mgmt` | Senior officer (`is_admin=true`) | Everything | Overlap decisions, escalate, remark, all reports, demo reset |
| `bureau_head` | PGRC head, RB head | Cases whose `current_bureau_id` = own bureau | Every case action on own-bureau cases (set assigned officer, transfer, escalate, interim reply, dispose, reopen); decide overlaps involving own bureau |
| `ro_officer` | North-Western RO officer | Cases of institutions in own region (any bureau) | Case actions where `current_bureau_id` = own RO |
| `intake_operator` | Intake operator | Cases they created + review queue | Create cases, decide match reviews |

**Permission checks are one dependency**, `require_roles(*roles)`, on case actions, overlap decisions and review decisions; no permission matrix. Wherever §5 or §7 says `admin`, read: the senior officer persona with `is_admin=true`. Authentication is demo-grade by design; the production plan is in §12A.

**Coordination rule:** if any case an official can see sits in an overlap group, they also see a **summary card** of the other cases in that group (case ref, bureau, status, category, assigned officer, last action and date), even outside their scope. Full detail still needs scope. This is the minimum needed for bureaus to coordinate without opening every file to everyone.

```python
# app/core/scope.py (sketch)
def scope_cases(stmt, user: User):
    if user.role == "senior_mgmt":
        return stmt
    if user.role == "bureau_head":
        return stmt.where(Case.current_bureau_id == user.bureau_id)
    if user.role == "ro_officer":
        return stmt.join(Institution).where(Institution.region == user.region)
    if user.role == "intake_operator":
        return stmt.where(Case.created_by == user.id)
    return stmt.where(False)

def require_roles(*roles: str):
    def dep(user: CurrentUser) -> User:
        if user.role not in roles:
            raise AppError(403, "FORBIDDEN", "Your role cannot do this")
        return user
    return Depends(dep)
```

### 4.3 Case workflow (state machine)

One endpoint, `POST /cases/{id}/actions`, applies every action through a transition table; an illegal transition returns 400 `INVALID_TRANSITION`. Each action writes one `case_action` row, updates `last_action_type/at`, writes `audit_log`, and may raise alerts.

&#91;embedded content: case status state machine · 6 open states, 1 closed\]

Every open state counts as pending; only dispose closes a case, and reopen sends it back with a fresh 21-day clock.

```python
# app/modules/cases/workflow.py
OPEN = {"received", "under_process", "interim_reply", "transferred", "escalated", "reopened"}
ALLOWED = {
    "assign":        ({"received", "transferred", "escalated", "reopened"}, "under_process"),
    "transfer":      (OPEN, "transferred"),       # requires to_bureau_id + remarks; clears assigned officer
    "escalate":      (OPEN, "escalated"),         # requires remarks; escalation_level += 1; alert senior_mgmt
    "interim_reply": ({"under_process", "escalated", "reopened"}, "interim_reply"),  # requires expected_disposal_date
    "remark":        (OPEN | {"disposed"}, None), # no status change
    "dispose":       (OPEN, "disposed"),          # requires outcome + remarks; sets disposed_at
    "reopen":        ({"disposed"}, "reopened"),  # requires remarks; reopen_count += 1; sla_due_on = today + SLA
}
```

| Rule | Detail |
| --- | --- |
| SLA clock | `sla_due_on = received_at + category.default_sla_days` (default 21). Transfers do **not** reset it; reopen does |
| Mandatory remarks | transfer, escalate, dispose, reopen and every overlap dismiss (research: disposal without a recorded action is the weak point of grievance systems) |
| Dispose outcome | `redressed`, `action_taken_against_institution`, `rejected_not_maintainable`, `forwarded_to_institution_grc` |
| Overlap guard | Disposing a case that sits in an **open** overlap group shows a warning listing the linked cases and asks for confirmation (UI) — the PS's "prevent conflicting or parallel actions" |
| Reopen rate | `reopen_count > 0` feeds the reopen-rate report (quality, not just speed) |

### 4.4 Institution resolution (signature, part 1)

`resolve_institution(raw_text, raw_state, raw_district)` maps a messy name to a Permanent ID with a tiered, registry-anchored pipeline: exact first, fuzzy only on the leftovers, location as a veto. This is the pattern that reached 0.97 precision / 0.93 recall against an official registry, while unconstrained fuzzy matching inflated false positives (Kang et al., 2026).

1. **Normalize:** uppercase, strip punctuation, collapse spaces; expand abbreviations from `abbreviations.json` (ENGG/ENGG./ENG → ENGINEERING, INST/INSTT → INSTITUTE, TECH → TECHNOLOGY, COLL → COLLEGE, MGMT/MGT → MANAGEMENT, UNIV → UNIVERSITY, POLY → POLYTECHNIC, & → AND); drop stopwords (OF, AND, THE, FOR); pull out a district hint by matching known district names and their short forms (JBP → JABALPUR).
2. **Exact tier:** a Permanent ID in the text (regex `\b1-\d{6,11}\b`) → linked, score 1.0. An exact `name_norm` or confirmed `alias_norm` match → score 0.99.
3. **Blocking + location veto:** compare only with institutions in `raw_state` (all states, with a penalty, if missing). If a district is known and a candidate's district differs, the candidate is **removed**, however similar the name.
4. **Score** each remaining candidate (formula below): fuzzy name similarity (RapidFuzz token-set and partial ratio), semantic similarity (embedding cosine of name + district), acronym match (query token equals the candidate's acronym, e.g. MAIT; Smash-style handling of acronyms, abbreviations and typos together, Wu et al., 2024), and location agreement.
5. **Decide:** top score ≥ `T_auto` **and** a margin ≥ 0.05 over the runner-up → `auto` link. Top score ≥ `T_review` → `pending_review` with the top-k in the review queue. Below → `unresolved`, also queued (operator searches manually).
6. **Learn:** a reviewer's choice saves `institution_alias(alias_norm → permanent_id, source='review')`, so the same spelling resolves exactly next time.

```latex
\text{match} = 0.45\,s_{\text{fuzzy}} + 0.25\,s_{\text{sem}} + 0.15\,s_{\text{acronym}} + 0.15\,s_{\text{location}}
```

Weights are starting values; tune them once on the synthetic dev split with `python -m app.eval --tune`, then freeze. Thresholds come from a 2-component Gaussian mixture fitted on unlabeled score distributions (ZeroER approach, Wu et al., 2019), written to `thresholds.json`.

Every candidate carries plain-language **reasons** shown in the UI: "Name 92% similar", "Acronym MAIT matches", "District West Delhi matches", "Spelling previously confirmed by a reviewer". Embeddings only **retrieve** candidates; the decision is the score plus thresholds, because better embeddings raise candidate recall but barely move final accuracy (Qi et al., 2026).

### 4.5 Overlap engine (signature, part 2)

An overlap group is anchored on the registry (Permanent ID, parent university or trust), never built by chaining pairs, so one wrong pairwise link cannot merge unrelated cases (the transitive-closure failure; Christen et al., 2024).

&#91;embedded content: overlap engine pipeline · resolution, then overlap detection\]

Resolution decides which institution a case is about; only then does overlap detection compare it with related cases, and only an official turns a flag into a link.

**When it runs:** right after a case gets a `permanent_id` (auto or review), after a transfer, and on each job tick for cases updated since the last tick.

**What it compares:** the new case against cases at the same institution, the same parent or sibling departments, and the same trust, that are open or were disposed within `OVERLAP_WINDOW_DAYS`.

| Level | Group created when | Default tier |
| --- | --- | --- |
| Institution | ≥ 2 open cases on one Permanent ID are with **different** bureaus/ROs (the PS's RB + PGRC example) | **Probable** if any cross-bureau pair ≥ `T_probable`, else **Possible** |
| Institution, same bureau | Two open cases, same bureau, pair score ≥ `T_probable` | Possible duplicate |
| Parent university | Pair across departments of one university ≥ `T_probable` | Possible |
| Trust | Pair across institutions of one trust ≥ `T_probable` | Possible |

```latex
\text{pair} = w_{\text{level}} \times \left(0.60\,s_{\text{text}} + 0.25\,s_{\text{category}} + 0.15\,e^{-\Delta t/60}\right), \quad w = 1.0,\ 0.8,\ 0.6
```

- `s_text` = cosine similarity of description embeddings (text alone is not enough, so it is fused with category and time; Chen et al., 2025). `s_category` = 1 same category, 0.5 related (fee refund \~ certificate withheld \~ scholarship; faculty shortage \~ infrastructure \~ unapproved course; ragging \~ harassment), else 0. Δt = days between `received_at`. `w_level` = institution / parent / trust.
- **Issue clusters inside a group** use complete linkage: a case joins a cluster only if it passes `T_possible` with **every** member (Mamun et al., 2016). The side-by-side view groups cases by cluster.
- **Reasons** (stored in `overlap_pair.reasons`): "Same institution 1-4XXXXXXXXXX", "Handled by PGRC and RB", "Both about certificates being withheld", "Description similarity 0.81", "Received 9 days apart", "Both run by Vindhya Valley Education Trust".
- **Banner text** for Probable groups is exactly the PS's wording: **"Potential Overlapping Cases – Coordination Required"**.

**Human decision (always required for linking):**

| Decision | Effect |
| --- | --- |
| Confirm + assign coordinator | Group `confirmed`; links shown on every member case; alert to every involved bureau head, the RO and senior management; coordinator's name on each case |
| Dismiss (remark required) | Group `dismissed`; its pairs marked `dismissed` and never re-alert; a **new** case joining reopens it with only the new pairs |
| Resolve | Auto when all member cases are disposed, or manually by the coordinator |

Officials must click Confirm because unexplained automation drives either aversion or over-trust (Horowitz & Kahn, 2023), and explanations raise trust in public-sector decisions (Aoki et al., 2024).

```python
# app/matching/overlap.py (sketch)
@dataclass
class PairEvidence: case_a: int; case_b: int; level: str; score: float; reasons: list[str]

def detect_overlaps(new: CaseLite, related: list[CaseLite], idx: MatchIndex, th: Thresholds) -> list[PairEvidence]:
    out = []
    for other in related:                       # already filtered by anchor + window
        if idx.is_dismissed(new.id, other.id):
            continue
        level = idx.level_between(new.permanent_id, other.permanent_id)  # institution | parent | trust
        s = pair_score(new, other, level, idx)
        cross_bureau = new.bureau_id != other.bureau_id
        if (level == "institution" and cross_bureau) or s >= th.possible:
            out.append(PairEvidence(new.id, other.id, level, s, explain(new, other, level, s)))
    return out   # cases/service.py upserts overlap_pair, overlap_group, overlap_link, alerts in ONE transaction
```

### 4.6 SLA, alerts and the job loop

The `asyncio` loop (base blueprint `jobs.py`, now **Must**) runs every `JOB_TICK_SECONDS` and writes alerts with a `dedupe_key`, so each thing alerts at most once per day per person.

| Alert | Fires when | Recipients | Severity |
| --- | --- | --- | --- |
| Overlap (Probable) | Group created or a case joins it | Heads of every involved bureau/RO, senior management | critical |
| Overlap (Possible) | Same | Heads of involved bureaus | warning |
| SLA warning | Open and day ≥ `SLA_WARN_DAY` (17) | Bureau head (shown against the assigned officer's name) | warning |
| SLA breach | Open and `today() > sla_due_on` | Bureau head, senior management (one daily digest alert) | critical |
| Escalation | `escalate` action (at action time) | Senior management, receiving head | critical |
| No-action reminder | Open and no action for `NO_ACTION_REMINDER_DAYS` (7) | Bureau head | info |

Alerts for one institution on one day are **grouped** into a single card in the UI, and the alert page sorts by severity, the two best-supported fixes for alert fatigue (Sreevathsa, 2026; Voutsas et al., 2024). When real-time (N2) is on, each new alert is also pushed as `alert:new` to its recipient.

### 4.7 Synthetic data, ground truth and seed

`python -m seed_data.generator --seed 26264` writes every JSON file in `seed_data/` deterministically; `python -m app.seed --reset` loads them. Error injection follows synthetic-linkage practice: controlled typos and identifier corruption per field with known ground truth (Lam et al., 2024).

| Generated | Spec |
| --- | --- |
| Regions / ROs | 10 Regional Offices, each a `bureau` row with `kind=regional_office` |
| Bureaus/cells | RB, PGRC, Approval Bureau, Academic Bureau (extendable) |
| Institutions | \~500 synthetic names from name parts (place + founder/deity + type), realistic type mix, \~60 trusts running 1–6 institutions each, \~15 universities with 2–5 departments (`parent_id`). IDs `1-` + 10 digits |
| Cases | \~1,500 over 9 months up to `DEMO_TODAY`. Channels: CPGRAMS 45%, AICTE portal 20%, email 15%, RO referral 10%, RB suo motu / inspection 10%. Statuses and actions generated chronologically and consistent with age |
| Name noise | Per case, independently: typos (insert/delete/substitute/transpose, p = 0.03 per char) on 40%; abbreviations on 35%; acronym only on 15%; district missing on 20%; city instead of district on 10%; wrong state on 2% (hard negatives) |
| Planted overlaps | 30 institution-level cross-bureau, 5 parent-level, 10 trust-level; 20 hard negatives (same name in another state; same institution but disposed long ago) |
| Descriptions | Templated per category with paraphrase variants; \~10% Hinglish when N7 |
| `ground_truth.json` | `case_id → true permanent_id`; true overlap clusters with level. Split 50/50 dev/test by institution |

**Hero story (hand-written, identical after every reset).** "Maharaja Agrasen Institute of Technology" (MAIT), West Delhi, Delhi, North-Western region (AICTE Permanent ID 1-43655981521); the Maharaja Agrasen group also runs "Maharaja Agrasen Institute of Management Studies" and "Maharaja Agrasen Business School" in Delhi. Days are relative to `DEMO_TODAY`.

| Case | Bureau | Received | Raw name as written | Issue | Status |
| --- | --- | --- | --- | --- | --- |
| PGRC/2026/00412 | PGRC (via CPGRAMS) | day −19 | "MAIT Delhi" | Fee refund refused after withdrawal; original certificates withheld | Under process — SLA warning |
| RB/2026/00087 | RB (inspection) | day −10 | "Maharaja Agrasen Inst. of Tech." | Faculty shortage; show-cause notice issued | Under process |
| RO-NWRO/2026/00133 | North-Western RO (email) | day −5 | "Maharaja Agrasan Engineering College, Delhi" | Certificates of 4 students withheld | Received |
| RB/2026/00079 | RB | day −30 | "Maharaja Agrasen Inst. of Management Studies" | MBA students' certificates withheld (trust sibling) | Escalated |
| *(typed live)* | Intake → PGRC | today | "maharaja agrsen institute of technology delhi" | Not returning 10th/12th originals; demanding full fees | Created in demo |

Institution names are AICTE's own; the complaints, complainants and officers are fabricated.

## §5 API Contract

Base blueprint conventions hold: `/api/v1`, snake\_case, `{success, data}` / `Page[T]` envelopes, the standard error shape, `?page&limit` (max 100). Change this table first, then code, then tell the frontend owner.

### Endpoint catalog

| Method | Path | Who | Tier | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/health` | public | Must | Liveness |
| POST | `/auth/login` · GET `/users/me` | public · any | Must | Demo login used by the persona switcher; `/me` returns role, bureau, region |
| GET | `/meta` | any | Must | Bureaus, regions, categories, statuses, channels, action types (dropdowns) |
| GET | `/institutions?q&state&region&inst_type` | any | Must | Registry search by name or Permanent ID |
| GET | `/institutions/{permanent_id}` | any | Must | **Institution 360**: profile, trust, parent/departments, cases grouped by bureau (scoped detail + summary cards), open overlap groups |
| POST | `/institutions/resolve` | intake, heads | Must | Live preview: `{raw_text, state?, district?}` → top-k candidates with score + reasons + decision |
| GET | `/cases?q&permanent_id&case_ref&bureau_id&region&category&status&from&to&beyond_sla&in_overlap` | any (scoped) | Must | Search & filters (PS feature 6) |
| POST | `/cases` | intake, heads, admin | Must | Intake: creates case, runs resolution + overlap engine; response includes `resolution` and `overlaps` |
| GET | `/cases/{id}` | scoped | Must | Detail + action history + linked-case summaries + reasons |
| POST | `/cases/{id}/actions` | role rules (§4.2) | Must | assign / transfer / escalate / interim\_reply / remark / dispose / reopen |
| GET | `/reviews?status=pending` | intake, admin | Must | Match review queue |
| POST | `/reviews/{id}/decide` | intake, admin | Must | `{permanent_id}` or `{none: true}` → saves alias, re-runs overlap |
| GET | `/overlaps?tier&status&level&bureau_id` | scoped | Must | Overlap Center list |
| GET | `/overlaps/{id}` | scoped | Must | Side-by-side cases, issue clusters, pair reasons |
| POST | `/overlaps/{id}/decision` | heads, senior, admin | Must | `{decision: confirm, coordinator_id, remark}` / `{decision: dismiss, remark}` / `{decision: resolve, remark}` |
| GET | `/alerts?unread_only` · POST `/alerts/{id}/read` · POST `/alerts/read-all` | own | Must | Bell + alerts page |
| GET | `/dashboard/summary` | scoped | Must | KPI cards |
| GET | `/dashboard/workload` · `/dashboard/ageing` · `/dashboard/institutions?limit` | scoped | Must | Charts + institution-wise status table |
| GET | \`/reports/{kind}?from&to&group\_by&format=json | csv\` | heads, senior, admin | Must |
| POST | `/demo/reset` | admin | Must | Base blueprint |
| POST | `/cases/{id}/classify` | intake | N1 | Category suggestion + confidence |
| POST | `/cases/{id}/documents` | scoped actors | N6 | Upload |
| GET/PATCH | `/admin/settings` | admin | N8 | SLA days per category, thresholds |
| WS | `/socket.io` events `alert:new`, `overlap:changed`, `case:changed`, `demo:reset` | token | N2 | Live updates |

### Key schemas

```python
class CaseCreate(SQLModel):
    source_channel: SourceChannel                 # cpgrams | aicte_portal | email | letter | ro_referral | rb_suo_motu | inspection
    external_ref: str | None = Field(default=None, max_length=60)   # e.g. CPGRAMS registration no.
    received_at: date
    complainant_type: ComplainantType
    complainant_name: str | None = Field(default=None, max_length=120)
    raw_institution_text: str = Field(min_length=3, max_length=300)
    raw_state: str | None = Field(default=None, max_length=60)
    raw_district: str | None = Field(default=None, max_length=60)
    permanent_id: str | None = Field(default=None, pattern=r"^1-\d{6,11}$")  # if the operator already knows it
    category_id: int
    subject: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10, max_length=4000)
    route_to_bureau_id: int | None = None         # default = category.default_bureau

class Candidate(SQLModel):
    permanent_id: str; name: str; district: str; state: str
    score: float; reasons: list[str]

class Resolution(SQLModel):
    decision: Literal["auto", "pending_review", "unresolved", "provided"]
    candidates: list[Candidate]                   # top-k, best first

class OverlapSummary(SQLModel):
    group_id: int; level: Literal["institution", "parent", "trust"]
    tier: Literal["probable", "possible"]; status: str
    banner: str                                   # "Potential Overlapping Cases – Coordination Required" for probable
    cases: list[LinkedCaseCard]                   # case_ref, bureau, status, category, officer, last_action, last_action_at
    reasons: list[str]

class CaseIntakeResult(SQLModel):
    case: CaseRead; resolution: Resolution; overlaps: list[OverlapSummary]

class CaseActionIn(SQLModel):
    action_type: ActionType
    remarks: str | None = Field(default=None, max_length=2000)
    to_bureau_id: int | None = None; to_officer_id: int | None = None
    expected_disposal_date: date | None = None; outcome: DisposeOutcome | None = None
    confirm_open_overlap: bool = False            # required true to dispose a case in an open overlap group
```

### Domain error codes (in addition to the base blueprint's)

| HTTP | Code | When |
| --- | --- | --- |
| 400 | `INVALID_TRANSITION` | Action not allowed from the current status |
| 400 | `REMARKS_REQUIRED` | transfer / escalate / dispose / reopen / dismiss without remarks |
| 409 | `OPEN_OVERLAP` | Dispose on a case in an open overlap group without `confirm_open_overlap=true`; body lists linked case refs |
| 409 | `ALREADY_DECIDED` | Review or overlap decision already taken |
| 404 | `NOT_FOUND` | Missing **or out of scope** (never 403 for scope) |
| 403 | `FORBIDDEN` | In scope to read but role cannot perform this action |

### Example: `POST /api/v1/cases` (demo step 4)

Request: channel `email`, raw name `maharaja agrsen institute of technology delhi`, state Delhi, category certificate\_withheld. Response 201: `case.case_ref = "PGRC/2026/00519"`, `resolution.decision = "auto"` with the Maharaja Agrasen Institute of Technology candidate at the top and reasons ("Name 86% similar", "State Delhi matches", "Description/name context similarity 0.79"), and one `overlaps[]` item: level institution, tier probable, banner "Potential Overlapping Cases – Coordination Required", cases PGRC/2026/00412, RB/2026/00087, RO-NWRO/2026/00133. Scores in this example are illustrative; the real values come from the engine.

## §6 Backend Security Checklist

Authentication is demo-grade by design (persona switcher + 12-hour JWT): judges score the role-based workflow, not login hardening. Run the base blueprint §6 checklist, skipping its login-hardening items; the items below are checked at feature freeze.

**Access and scoping**

- [ ] Every list, dashboard and report query goes through `scope_cases()`; every by-id load through `get_case_in_scope_or_404()` (404 when out of scope)
- [ ] `require_roles()` on case actions, overlap decisions and review decisions
- [ ] Linked-case summary cards use a reduced response schema (no description, complainant name or documents)
- [ ] Role checks live in the backend; hiding a button in the UI is never the control

**Accountability**

- [ ] Every state change writes `case_action` and `audit_log` in the same transaction as the change
- [ ] Intake + resolution + overlap upsert + alerts happen in **one** DB transaction; a failure rolls everything back
- [ ] Mandatory remarks enforced server-side (`REMARKS_REQUIRED`)
- [ ] `case_action` and `audit_log` have no update or delete endpoints

**Data**

- [ ] All seed data synthetic, including institution names; complainant names drawn from a fictional name list
- [ ] Logs never print complaint descriptions or complainant names (log case ids only)
- [ ] Complaint text is never sent to a third-party API; embeddings are computed locally
- [ ] `description` ≤ 4000 and every other string has `max_length`; free text rendered as text in the UI
- [ ] Uploads (N6): allowlist PDF/JPG/PNG, ≤ 5 MB, random stored filenames, outside the code folder, served only through a scoped endpoint

**Production notes (pitch, not built):** DPDP Act 2023 obligations for complainant personal data, GIGW guidelines for government web apps, Parichay SSO, hosting on NIC / MeghRaj cloud. Listed in §12A.

## §7 Frontend Architecture

The base blueprint frontend (Axios client, token store, AuthProvider, RequireAuth, TanStack Query hooks, Zod env) is used as is; this section defines the pages, the shared components and the UX rules. Every page has loading, empty and error states.

### Routes and pages

| Route | Page | What it shows | Roles | PS feature |
| --- | --- | --- | --- | --- |
| `/login` | Login | Persona switcher: 5 one-click cards (Senior officer, PGRC head, RB head, North-Western RO, Intake); pre-filled login form below as fallback | all | — |
| `/` | **Dashboard** | KPI cards (total, pending, under process, disposed, transferred, escalated, beyond SLA, open overlaps); bureau workload bar chart; ageing buckets chart; top institutions by open cases with status; latest Probable overlaps | all (scoped) | 4 |
| `/cases` | Cases | Filter bar (institution name, Permanent ID, case ref, bureau, region, category, status, date range, beyond SLA, in overlap); paginated table with SLA badge and overlap icon | all (scoped) | 2, 6 |
| `/cases/new` | **Intake** | Form; as the institution text is typed (debounced 300 ms) a panel shows top-3 candidates with score bars and reasons; category suggestion (N1); on submit, a result panel shows the case ref and any overlap banner | intake, heads, admin | 2, 3 |
| `/cases/:id` | **Case Detail** | Header (case ref, status, SLA countdown, bureau, officer); tracking fields grid; **overlap banner** with linked-case cards and "Why flagged"; vertical action timeline (who, bureau, when, remarks, documents); action buttons allowed for this role and status | scoped | 2, 3, 5 |
| `/reviews` | Match Review | Queue of uncertain matches: raw text, state/district, candidate list with reasons; pick one, search the registry, or mark "not in registry" | intake, admin | 3 |
| `/overlaps` | **Overlap Center** | Tabs Probable / Possible / Decided; cards per group (institution, level, bureaus involved, case count, age) | heads, senior, admin | 3 |
| `/overlaps/:id` | Overlap detail | Side-by-side case columns grouped by issue cluster; reasons list; Confirm (pick coordinator) / Dismiss (remark) / Resolve | heads, senior, admin | 3 |
| `/institutions` · `/institutions/:pid` | **Institution 360** | Search; profile (Permanent ID, address, region, type, trust, parent/departments); cases by bureau as columns; overlap history; complaint timeline | all | 1 |
| `/alerts` | Alerts | Grouped by institution and day, sorted by severity; mark read | all | 7 |
| `/reports` | Reports | Report picker, date range, group-by; chart + table; CSV download (xlsx N5) | heads, senior, admin | 8 |
| `/admin` | Admin | Demo reset; settings (N8) | admin | — |

### Shared components

| Component | Purpose |
| --- | --- |
| `OverlapBanner` | Red for Probable with the exact PS text "Potential Overlapping Cases – Coordination Required", amber for Possible; shows bureaus involved and a link to the group |
| `WhyFlagged` | Bulleted reasons from the API, plus the score as a small bar. Never a bare percentage |
| `CandidateList` | Ranked institution candidates with score bar, district/state, reasons, "Select" |
| `LinkedCaseCard` | Case ref, bureau chip, status, category, officer, last action + date |
| `ActionTimeline` | Chronological `case_action` list; transfers and escalations visually distinct |
| `CaseActionDialog` | One dialog per action type, Zod schema mirrors the backend rules (remarks required, date for interim reply); dispose shows the open-overlap warning |
| `SlaBadge` | "Day 19 of 21" amber from day 17, red "Beyond SLA +3" after 21 |
| `StatusChip`, `BureauChip`, `TierChip` | Same colours everywhere; colour always paired with text |
| `KpiCard`, `WorkloadChart`, `AgeingChart` | Recharts; click-through to the filtered case list |
| `AlertBell` | Unread count; dropdown of latest 5; real-time with N2 |

### UX rules

- **Show reasons, not just scores**, everywhere a machine made a call (resolution, overlap, delay risk). Explanations raise officials' trust (Aoki et al., 2024).
- **Few KPIs, each clickable to the list behind it**: dashboards that support action beat ceremonial reporting (Agyei & Oman-Amoako, 2026).
- Navigation shows only what the role can use; the backend still enforces it.
- Dates shown as `DD MMM YYYY` (Indian convention), times in IST; all values parsed with `parseUtc()`.
- Persona switcher on the login page and in the top bar (demo mode only), so the presenter jumps between the 5 personas in one click without logging out.

## §8 Frontend Security and §9 AI Workflow & Git

**§8:** apply the base blueprint §8 checklist unchanged, plus:

- [ ] Complaint descriptions, remarks and raw institution text are rendered as React text only; no `dangerouslySetInnerHTML` anywhere in case views
- [ ] Role-based navigation is cosmetic; every action button's failure (403/404) shows the API message, never a blank screen
- [ ] CSV downloads come from the backend endpoint (scoped), never built client-side from cached data of other scopes
- [ ] The persona switcher and pre-filled login exist only when `VITE_DEMO_MODE=true`

**§9:** apply base blueprint §9 unchanged (no secrets in AI chats, verify every package name, freeze dependencies, `main` always runnable, tag `demo-ready`). Project-specific additions:

- **Area owners** (one owner per area; one person may own several): (1) backend core + workflow + scoping, (2) `app/matching/` + generator + eval, (3) frontend shell + dashboard + reports, (4) intake + case detail + overlap center UI, (5) docs, pitch, demo script, backup video.
- `app/matching/` changes require `pytest tests/test_matching.py` and a fresh `python -m app.eval` before merge; paste the metric line into the PR description.
- Weights and thresholds change only through `thresholds.json` + eval output, never as magic numbers in code.
- Before telling judges a number, it must come from `app.eval` on the **test** split, not the dev split used for tuning.

## §10 Testing and Accuracy Evaluation

Three layers: the smoke test proves the demo path works, unit tests pin the matching rules, and `app.eval` measures accuracy against planted ground truth so every number on a slide is reproducible.

### Swagger run order (`/docs`)

1. `GET /health` → ok
2. `POST /auth/login` as `intake@aicte.example` → Authorize
3. `POST /institutions/resolve` with `vindya valley engg college jabalpur` → hero institution on top, decision `auto`
4. `POST /cases` (hero intake) → `overlaps[0].tier = probable`
5. Log in as `pgrc.head@aicte.example` → `GET /overlaps?tier=probable` → `POST /overlaps/{id}/decision` confirm
6. Log in as `rb.head@aicte.example` → `GET /alerts?unread_only=true` → overlap alert present
7. `POST /cases/{id}/actions` dispose without `confirm_open_overlap` → 409 `OPEN_OVERLAP`
8. Log in as `ro.nw@aicte.example` → `GET /cases/{id}` of a Western-region case → 404 (out of scope)
9. `GET /reports/bureau?format=csv` → CSV
10. `POST /demo/reset` as `senior@aicte.example` → clean state

### Automated tests

| File | Covers |
| --- | --- |
| `tests/test_smoke.py` | The run order above end to end with `EMBEDDINGS_MODE=tfidf` (no download in CI) |
| `tests/test_matching.py` | Abbreviation expansion (ENGG → ENGINEERING); acronym hit (MAIT); typo tolerance (Agrasen → Agrsen); **location veto** (same name, other district → never linked); Permanent ID in text → exact; alias learned after review → exact next time; overlap tiers; dismissed pair never re-alerts; trust-level pair only above `T_probable` |
| `tests/test_workflow.py` | Every row of `ALLOWED`; illegal transition → `INVALID_TRANSITION`; remarks required; transfer keeps SLA date; reopen resets it; audit rows written |
| `tests/test_scope.py` | Hero path in all 5 personas: each sees what §10A needs, out-of-scope ids return 404; summary cards hide description and complainant name |

### Accuracy evaluation (`python -m app.eval [--split test] [--tune]`)

| Metric | Definition | Target |
| --- | --- | --- |
| Resolution precision | Auto-linked cases whose `permanent_id` is correct ÷ all auto-linked | ≥ 0.97 |
| Resolution recall | Correct auto-links ÷ all cases that have a true institution | ≥ 0.85 |
| Resolution F1 | Harmonic mean of the two | ≥ 0.90 |
| Review rate | Cases sent to the review queue ÷ all cases | Report it; lower is better if precision holds |
| Overlap pair recall | True overlapping pairs flagged Probable or Possible ÷ all true pairs | ≥ 0.90 |
| Overlap precision (Probable) | Probable pairs that are true ÷ all Probable pairs | Report honestly |
| Hard-negative false links | Same-name-other-state cases wrongly linked | 0 expected (location veto) |
| Per-noise breakdown | Each metric per noise type (typo, abbreviation, acronym, missing district) | Shows where it fails |

Output is one table printed to the terminal and saved to `docs/pitch/eval_results.md`, with the split, seed and thresholds used. Following Hand & Christen's caution on F-measure for linkage, precision and recall are always shown alongside F1, never F1 alone.

### Failure-mode tests (manual, before freeze)

| Test | Expected |
| --- | --- |
| Disconnect Wi-Fi, set `EMBEDDINGS_MODE=tfidf`, restart | Hero demo still resolves and flags the overlap |
| Type a name that exists in two states without a state | Goes to the review queue, not auto-linked |
| Stop the backend | Every page shows an error state |
| Run the job loop with `JOB_TICK_SECONDS=10` | SLA warning on PGRC/2026/00412 appears once, not every tick |

## §10A Demo Script

The demo tells one story: a fourth complaint about Maharaja Agrasen Institute of Technology arrives misspelt, Unicomply links it in under 2 seconds, and PGRC and RB coordinate instead of acting blind. Two roles: **Driver** clicks, **Narrator** talks.

| # | Time | On screen (Driver) | Narrator says (adapt) | If it breaks |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:30 | Problem slide: one institution, four complaints, three units, no shared view | "Today the same college can face a PGRC refund case, an RB show-cause and a Regional Office complaint, and none of them knows about the others." | — |
| 2 | 0:30–0:55 | Log in as **senior officer** → Dashboard | "One screen for all of AICTE: pending, beyond the 21-day limit, and bureau workload." Point at the open-overlaps card | Screenshot slide |
| 3 | 0:55–1:20 | Switch persona to **intake operator** → Intake; paste "vindya valley engg college jabalpur" from the prepared text file; candidates panel fills | "Misspelt, abbreviated, no ID. Unicomply expands the short forms, checks the district and finds the right Permanent ID, and tells you why." | Use the seeded hero case instead |
| 4 | 1:20–2:00 | Submit → red **"Potential Overlapping Cases – Coordination Required"** banner with 3 linked cases (PGRC, RB, North-Western RO) + trust sibling | The wow line: "Three units are already acting on this college. Without this, PGRC might close a refund while RB is issuing a show-cause." Read two reasons aloud | Open Overlap Center → seeded group; else backup video at 1:20 |
| 5 | 2:00–2:35 | Persona **PGRC head** → Overlap detail (side-by-side) → Confirm, coordinator = PGRC head | "An official always decides. Confirming notifies every unit involved." | Skip to step 6 |
| 6 | 2:35–2:55 | *(N2)* Second window as **RB head**: alert pops; open the case → linked cases visible | "RB sees it instantly, with the coordinator's name." | Show the alert page instead |
| 7 | 2:55–3:20 | Case Detail of PGRC/2026/00412: SLA badge "Day 19 of 21", action timeline; try Dispose → open-overlap warning | "Full history: who did what, when. And you can't silently close a case another unit is still acting on." | — |
| 8 | 3:20–3:45 | Reports → bureau-wise + ageing → Download CSV | "Bureau, region, institution, ageing, disposal and reopen rate, monthly or quarterly." | Slide |
| 9 | 3:45–4:10 | Accuracy slide from `eval_results.md` + architecture slide | "Tested on synthetic data with known answers: our precision and recall, measured, not claimed. Runs fully offline." | Slide only |
| 10 | 4:10–4:30 | Impact + next steps (CPGRAMS integration, Parichay SSO, Postgres + pgvector at national scale) + team | "Single source of truth for every institution." | — |

**Rubric mapping (fill once the official rubric is out):** step 4 → innovation / novelty; steps 3–5 → technical complexity; steps 2, 7, 8 → feasibility and completeness against PS features 1–8; step 9 → rigor; step 10 → impact and scalability.

### Pre-demo checklist (additions to the base blueprint's)

- [ ] `python -m app.seed --reset` with `DEMO_TODAY` set so "Day 19 of 21" shows exactly
- [ ] Embedding model cached locally **or** `EMBEDDINGS_MODE=tfidf`; run the hero intake once to warm it, then reset again
- [ ] Persona switcher works for intake, PGRC head, RB head, senior officer
- [ ] Text file open with the exact hero intake text
- [ ] Latest `eval_results.md` numbers copied into the slide
- [ ] Backup video covers steps 2–8

### Likely judge questions

| Question | One-sentence answer |
| --- | --- |
| Is this real AICTE data? | No, fully synthetic with planted ground truth, so we can measure accuracy; it plugs into real feeds through the intake API |
| Why would overlap happen if students pick only one cell? | Overlap comes from many complainants, many channels, RB acting on its own, and name variants, not from the student's choice |
| How is this different from CPGRAMS? | CPGRAMS routes grievances across ministries; Unicomply links cases about the same institution across AICTE's own bureaus and Regional Offices, including non-complaint regulatory actions |
| What if the match is wrong? | Low-confidence matches go to a human queue, location vetoes impossible matches, every flag shows its reasons, and only an official can confirm a link |
| What about false alarms? | Tiered alerts, grouped per institution per day, and a dismissed pair never alerts again |
| How does it scale to all institutions in India? | Same design on PostgreSQL with pg\_trgm and pgvector, blocking by state keeps comparisons small |
| How do officials log in? | In production through Parichay / government SSO with MFA for senior officials; the demo switches personas so you can see each unit's view |

## §10B Risks & Fallbacks

Keep every base blueprint §10B row; these are the project-specific risks.

| Risk | Likelihood | Early warning | Fallback |
| --- | --- | --- | --- |
| Embedding model can't download at the venue | High | First intake hangs; Hugging Face errors in the log | Model cache copied beforehand; else `EMBEDDINGS_MODE=tfidf` and restart (tested in §10) |
| Hero intake resolves to the wrong institution or goes to review | Medium | Rehearsal shows a different top candidate | Add the hero spelling as a seeded alias; or demo via Review queue (still a good story) |
| Overlap alert flood makes the dashboard noisy | Medium | Hundreds of Possible groups after seeding | Generator caps planted overlaps; Possible alerts go only to heads; tune `T_possible` with eval |
| Synthetic institution name matches a real college | Low | Name found in AICTE's public search | Rename in the generator before the event |
| Judges question accuracy claims | High | — | Show `eval_results.md` from the test split; explain synthetic ground truth and its limits |
| Scoping bug leaks out-of-scope case detail | Medium | `test_scope.py` fails | Fix before freeze; worst case demo as senior officer only |
| SLA numbers differ from the script | Medium | "Day 19 of 21" shows another day | `DEMO_TODAY` pinned; reset right before presenting |
| Job loop raises duplicate alerts | Low | Same alert twice in the bell | `dedupe_key` unique constraint; IntegrityError swallowed in the job |
| Weights tuned on test data (overfitting the demo) | Medium | Test metrics much better than dev | Tune only on dev split; report test split |
| Scope creep into a student portal | Medium | Someone starts a "raise complaint" UI for students | Point to §0 non-goals; intake form is for operators |

## §11 Master Prompts

Paste into your AI assistant with both `docs/HACKATHON_PRD.md` and `docs/UNICOMPLY_PRD.md` in context. For security audits use base blueprint §11.3 and §11.4 verbatim, adding: "verify `scope_cases()` on every list query, `get_case_in_scope_or_404()` on every by-id route, and that summary cards never expose description or complainant name."

### 11.1 Full-stack bootstrap (walking skeleton)

```
Build the walking skeleton of "Unicomply", an SIH demo for AICTE problem statement 26264:
an integrated dashboard for AICTE officials to monitor institution-related complaint cases across
bureaus/cells (Regulation Bureau, Public Grievance Redressal Cell, other bureaus, Regional Offices)
and detect overlapping cases about the same institution.

Follow docs/HACKATHON_PRD.md for all generic patterns (FastAPI + SQLModel + SQLite backend,
React + Vite + TypeScript frontend, envelopes, error shape, demo auth, seed/reset, smoke test,
Version Safety Rule) and docs/UNICOMPLY_PRD.md for the domain. Where they differ, UNICOMPLY_PRD wins.

Before writing requirements.txt / package.json: web search each dependency (latest stable +
advisories), confirm with pip index versions / npm show, list names only, tell me what you verified.

Scope of THIS step (nothing else):
1. Tables from UNICOMPLY_PRD §4.1 (trust, institution, institution_alias, bureau, user, category,
   case, case_action, match_review, overlap_pair, overlap_group, overlap_link, alert, audit_log)
   with Create/Update/Read schemas. permanent_id is a string PK like "1-4703201000".
2. Roles and scoping from §4.2: user.role, user.bureau_id, user.region; app/core/scope.py with
   scope_cases() and get_case_in_scope_or_404() (404 for out of scope).
3. Workflow from §4.3: POST /api/v1/cases/{id}/actions driven by the ALLOWED table; writes
   case_action + audit_log in the same transaction; INVALID_TRANSITION and REMARKS_REQUIRED errors.
4. Endpoints: /meta, /institutions (search + 360), /cases (list with all §5 filters, create
   WITHOUT matching for now: require permanent_id), /cases/{id}, /dashboard/summary.
5. A tiny seed (3 bureaus, 2 ROs, 20 institutions, 2 trusts, 40 cases, 5 persona accounts per §0)
   so every endpoint returns data. The full generator comes later.
6. Frontend: login with persona switcher, Dashboard (KPI cards only), Cases list with filters,
   Case Detail with action timeline and action dialogs.
7. tests/test_smoke.py and tests/test_workflow.py passing.

Do NOT build matching, overlap detection, alerts, reports or real-time yet.
```

### 11.2 Frontend feature prompt (after the skeleton)

```
Add the Unicomply frontend pages from docs/UNICOMPLY_PRD.md §7 that are not built yet:
Intake (with debounced POST /institutions/resolve candidate panel), Match Review, Overlap Center
(list + side-by-side detail with Confirm/Dismiss/Resolve), Institution 360, Alerts (bell + page,
grouped by institution and day), Reports (picker + Recharts + CSV download).
Use the shared components listed in §7 (OverlapBanner with the exact text "Potential Overlapping
Cases – Coordination Required", WhyFlagged, CandidateList, LinkedCaseCard, ActionTimeline,
CaseActionDialog, SlaBadge). Mirror backend validation in Zod. Every query and mutation needs
loading, empty and error states. TypeScript types mirror the Pydantic schemas in §5 exactly.
Never render API text with dangerouslySetInnerHTML.
```

## §12 Domain Add-On Prompts

Run these in order after §11.1 passes its tests.

### 12.1 Synthetic data generator + ground truth

```
Implement backend/seed_data/generator per docs/UNICOMPLY_PRD.md §4.7. Deterministic (random seed 26264).
Output institutions.json, bureaus.json, users.json, categories.json, cases.json (with actions),
ground_truth.json, abbreviations.json. Include ~500 fictional institutions, ~60 trusts, ~15
universities with departments (parent_id), 10 Regional Offices, ~1,500 cases over 9 months to
DEMO_TODAY with the channel mix, the name-noise rates and the planted overlap scenarios + hard
negatives listed in §4.7. Hand-write the Maharaja Agrasen hero story exactly as in the §4.7 table.
Update app/seed.py to load these files; python -m app.seed --reset must finish in under 10 s.
```

### 12.2 Overlap Engine (signature feature)

```
Implement backend/app/matching per docs/UNICOMPLY_PRD.md §4.4–4.5. Pure Python: no FastAPI,
no DB sessions; dataclasses in, dataclasses out.
- normalize.py: uppercase, strip punctuation, abbreviation expansion from abbreviations.json,
  stopwords, district-hint extraction, acronym of a name, Permanent-ID regex \b1-\d{6,11}\b.
- embed.py: Embedder with mode "model" (sentence-transformers, EMBEDDING_MODEL_NAME, loaded once)
  and "tfidf" (char 3-5 grams, fitted on institution names + case descriptions at startup).
- index.py: MatchIndex built in lifespan: institutions grouped by state, name vectors, aliases,
  trust/parent maps, case description vectors; cache to seed_data/.cache/.
- resolve.py: resolve_institution() with the exact tier, blocking + LOCATION VETO, score
  0.45 fuzzy + 0.25 semantic + 0.15 acronym + 0.15 location (RapidFuzz token_set_ratio and
  partial_ratio), decision auto / pending_review / unresolved with a 0.05 margin rule,
  and plain-language reasons per candidate.
- overlap.py: detect_overlaps() with levels institution / parent / trust, pair score
  w_level * (0.60 text + 0.25 category + 0.15 exp(-days/60)), cross-bureau rule, complete-linkage
  issue clusters, dismissed-pair suppression, reasons.
- thresholds.py: load seed_data/thresholds.json, env overrides.
Wire into POST /cases (one transaction: case + resolution + match_review + overlap_pair/group/link
+ alerts), POST /reviews/{id}/decide (save alias, re-run overlap), POST /institutions/resolve,
/overlaps endpoints and decisions. Then app/eval.py with the metrics in §10 and tests/test_matching.py.
Print eval for --split dev and --split test.
```

### 12.3 Alerts, SLA job and real-time

```
Implement app/jobs.py per docs/UNICOMPLY_PRD.md §4.6: sla_warning (day >= SLA_WARN_DAY), sla_breach,
no-action reminder; escalation alerts at action time; overlap alerts from the engine. Each alert has
a unique dedupe_key (type + recipient + entity + date); swallow IntegrityError on duplicates. Use
utils.time.today() (respects DEMO_TODAY). Endpoints: GET /alerts, POST /alerts/{id}/read,
POST /alerts/read-all. If ENABLE_REALTIME: emit alert:new to the recipient and overlap:changed /
case:changed to everyone; frontend invalidates the matching queries.
```

### 12.4 Dashboard and reports (analytics)

```
Implement /dashboard/summary, /dashboard/workload, /dashboard/ageing, /dashboard/institutions and
/reports/{kind} per docs/UNICOMPLY_PRD.md §5, all through scope_cases(). Aggregations with SQL
GROUP BY (SQLite strftime for month/quarter buckets). Kinds: bureau, region, institution, status,
ageing (0-7 / 8-14 / 15-21 / 22-45 / 45+ days), disposal_rate (disposed / received in period),
reopen_rate, overlaps (by tier, level, decision), periodic (monthly or quarterly). format=csv via
the csv module + StreamingResponse. Frontend: Recharts bar charts for workload and ageing, line
chart for monthly received vs disposed; every chart click-through to the filtered /cases list.
```

### 12.5 Category classifier and delay risk (Nice: N1, N4)

```
N1: train TF-IDF (word 1-2 grams) + LinearSVC(class_weight="balanced") on synthetic labelled
descriptions at seed time; save with joblib; POST /cases/{id}/classify returns category + confidence;
intake form pre-selects it but the operator can change it.
N4: XGBoost on features (category, channel, bureau, region, institution's open-case count, days
since last action, reopen_count) to predict breach of the 21-day limit; SHAP top-3 reasons stored
with delay_risk and shown on Case Detail as plain sentences. Evaluate with a time-based split.
```

## §12A Future Scope

Everything below is deliberately not built; each row is a pitch answer to "what would production look like?"

| Feature | Status | Production approach |
| --- | --- | --- |
| Real ingestion from CPGRAMS, AICTE feedback portal, complaint@aicte-india.org, RB files | Deferred | Connectors posting to the same intake API; CPGRAMS registration number kept in `external_ref` for two-way status sync |
| PostgreSQL + pg\_trgm + pgvector + Alembic | Deferred | `DATABASE_URL` switch; move candidate retrieval into SQL; JSONB for raw channel payloads |
| Parichay / government SSO + real RBAC admin | Deferred | Replace demo login; roles mapped from the AICTE directory |
| Full AICTE institution master via official access | Deferred | Bulk approved-institution list is only available behind AICTE login today; nightly sync by Permanent ID |
| MuRIL / HingBERT embeddings, Bhashini translation | Deferred (N7 partial) | Better Hindi and Hinglish handling; code-mixed models beat generic mBERT |
| Active learning on reviewer decisions | Deferred | Periodic GMM refit + a learned matcher once enough labelled pairs exist |
| Delay-risk model in production (if N4 not built) | Deferred | XGBoost + SHAP trained on real disposal history |
| OCR of scanned letters | Deferred | Extract institution name and text before intake |
| Email / SMS notifications | Deferred | NIC mail gateway; in-app alerts already carry the logic |
| Institution-facing view (GRC of the college) | Deferred | Lets institutions see AICTE cases forwarded to them |
| DPDP Act 2023, GIGW, security audit (CERT-In empanelled), NIC / MeghRaj hosting | Deferred | Required before any real complainant data |
| Rate limiting, security headers, refresh tokens, monitoring | Deferred | Restore from the original full-stack blueprint v2.2 |
| Per-officer logins, passwords, MFA, account management | Removed from demo | Parichay SSO with MFA; a case\_officer role that sees only assigned cases; shown on the production-readiness slide |

## §13 Maintenance

One named scope keeper owns this file; base blueprint §13 rules apply. Additionally: any change to weights, thresholds or matching rules updates §4.4–4.5 **and** re-runs `app.eval`; any new endpoint updates §5 first; after feature freeze only §10A and §10B change. Export this doc as Markdown to `docs/UNICOMPLY_PRD.md` after each edit session.

## Appendix A — Research evidence behind each design choice

| Design choice (section) | Evidence |
| --- | --- |
| Registry-anchored, exact-first then fuzzy matching (§4.4) | Two-stage registry-anchored linking reached precision 0.97 / recall 0.93 / F1 0.95; unconstrained fuzzy matching inflated false positives ([Kang et al., 2026](https://doi.org/10.6087/kcse.396)) |
| Location as a veto (§4.4) | Geographic validation alone gave the highest precision, 0.98 ([Kang et al., 2026](https://doi.org/10.6087/kcse.396)) |
| Acronym/abbreviation-aware similarity (§4.4) | Smash handles acronyms, abbreviations and typos together and beat strong baselines incl. GPT-4 ([Wu et al., 2024](https://consensus.app/papers/details/c7fdb085e9f25efdb23172c41824663f/)) |
| Embeddings retrieve, rules decide (§4.4) | Better encoder retrieval raised pair recall from 53.7% to 77.0% but barely moved cluster recall ([Qi et al., 2026](https://doi.org/10.48550/arxiv.2610.05573)); small fine-tuned models match prompted LLMs at far lower cost ([Zhang et al., 2025](https://consensus.app/papers/details/ebee8eeb187f59ea825f7d42c3e83dbe/)) |
| Blocking by state (§4.4) | Blocking/indexing is the standard fix for quadratic comparison ([Christen, 2012](https://consensus.app/papers/details/62953d7ce75e5f068fba617917291c9d/); [Papadakis et al., 2019](https://consensus.app/papers/details/9ee072d17e6b534292821feeb220aee4/)) |
| Text + metadata fusion for overlap (§4.5) | SBERT fused with administrative codes and location improved duplicate detection on utility complaint tickets ([Chen et al., 2025](https://consensus.app/papers/details/db4f1b3a59ec5b40a18eafa47dff8d1d/)); sentence embeddings make similarity search practical ([Reimers & Gurevych, 2019](https://doi.org/10.18653/v1/d19-1410)) |
| Registry anchor + complete linkage, no transitive closure (§4.5) | One bad bridge edge merges whole components under transitive closure ([Christen et al., 2024](https://doi.org/10.1145/3735511)); complete linkage prevents chaining ([Mamun et al., 2016](https://doi.org/10.1371/journal.pone.0154446)) |
| Thresholds without labels (§4.4) | Gaussian mixture on unlabeled similarity scores ([Wu et al., 2019, ZeroER](https://doi.org/10.1145/3318464.3389743)) |
| Synthetic data with controlled errors (§4.7) | Realistic synthetic identifiers with replicated error profiles support linkage evaluation ([Lam et al., 2024](https://doi.org/10.23889/ijpds.v9i1.2389)) |
| Report P and R, not only F1 (§10) | Cautions on F-measure for record linkage ([Hand & Christen, 2017](https://doi.org/10.1007/s11222-017-9746-6)) |
| Explanations + human confirmation (§4.5, §7) | Explanation type shapes perceived fairness and trust ([Aoki et al., 2024](https://doi.org/10.1016/j.giq.2024.101965)); automation bias vs aversion depends on familiarity ([Horowitz & Kahn, 2023](https://doi.org/10.48550/arxiv.2306.16507)) |
| Tiered, grouped, deduplicated alerts (§4.6) | Suppression, aggregation and severity ranking are the best-supported alert-fatigue fixes ([Sreevathsa, 2026](https://doi.org/10.22161/ijaems.123.42); [Voutsas et al., 2024](https://doi.org/10.1016/j.comnet.2024.110543)) |
| Few, actionable KPIs (§7) | Public-sector dashboards work with a small set of decision-oriented indicators ([Agyei & Oman-Amoako, 2026](https://doi.org/10.65150/ep-jmrr/v2e7/2026-04)) |
| Delay-risk model (N4) | XGBoost escalation prediction: recall 0.84 for delayed complaints, PR-AUC 0.72 ([Jain et al., 2026](https://doi.org/10.1109/iciccs67901.2026.11502744)) |
| Simple classifier baseline (N1) | SVM \~89% on government complaint data ([Madyatmadja et al., 2023](https://doi.org/10.3390/informatics10040084)) |
| Hinglish models (N7) | Code-mixed pre-trained models beat vanilla BERT on Hindi-English ([Patil et al., 2023](https://doi.org/10.1109/i2ct57861.2023.10126273)) |
| Why the problem matters (pitch) | Indian grievance delays trace to inter-departmental coordination gaps ([Sangareddy study, 2025](https://doi.org/10.52783/eel.v15i2.4340)); siloed teams erode trust in grievance apps ([Srivatsa et al., 2026](https://doi.org/10.1145/3802974.3810897)); centralization helps only with workflow and ownership ([Supriatna et al., 2025](https://doi.org/10.67171/sgemfz17)) |

## Appendix B — AICTE facts used

| Fact | Used in | Source |
| --- | --- | --- |
| PGRC handles grievances of students/faculty/stakeholders of approved institutions, CPGRAMS grievances, ragging complaints | §0, categories | [AICTE PGRC page](https://aicte.gov.in/node/422) |
| Complaint email complaint@aicte-india.org; online feedback portal | §0 channels | [Institution GRC page citing AICTE](https://top-autonomous-college-in-odisha.gift.edu.in/?p=455); [MITS GRC page](https://mits.ac.in/grc) |
| Institution GRC must decide within 15 days; escalation to university Ombudsman | §0 context | [IMDR grievance policy](https://www.imdr.edu/wp-content/uploads/2026/09/Grievance-Redressal.pdf) |
| CPGRAMS disposal limit 21 days (DARPG OM, 23 Aug 2024); interim reply when more time is needed | A7, SLA | [NSEZ office order citing DARPG OM](https://nsez.gov.in/Resources/Announc/Office-Order%20_dt_28.08.2026.pdf); [PIB CPGRAMS report](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2026/aug/doc2026821966201.pdf) |
| Permanent ID format; approval letters carry name, trust, address, type, region, year | §4.1 | [Example AICTE approval letter](https://www.ajiet.edu.in/img%5Cquick-links%5CAICTE_Approvals.pdf) |
| University departments hold their own Permanent IDs | `parent_id` | [Example approval letter](https://klyuniv.ac.in/wp-content/uploads/2024/08/AICTE-Mandatory-Disclosure-2024.pdf) |
| 10 Regional Offices | §4.7 | [AICTE RO list](<https://aicte.gov.in/sites/default/files/ROs%20Details%20(2).pdf>) |
| Bulk approved-institution list downloadable only from login IDs | §12A | [Approval report note](https://snu.edu.in/site/assets/files/16490/eoa_report_202526.pdf) |
| NextGen CPGRAMS adds AI validation of disposals by transfer/closure | Pitch differentiation | [CPGRAMS explainer](https://www.shankariasparliament.com/blogs/pdf/centralised-public-grievance-redress-and-monitoring-system-cpgrams) |

## Appendix C — Open questions for the AICTE SPOC

- [ ] Can we get a sample or API of the approved-institution master (Permanent ID, name, address, trust)?
- [ ] Which fields do RB case files and PGRC case records actually hold today?
- [ ] Besides RB and PGRC, which bureaus or cells handle complaints, and do Regional Offices keep their own case registers?
- [ ] Is there an AICTE-specific disposal timeline different from CPGRAMS's 21 days?
- [ ] Which reports does senior management review monthly today?
