# Unicomply — Backend Freeze & Security Checklist (§6 Audit)

> **Document Status:** Backend Feature Freeze Complete · Issue #58 Audit Report  
> **Milestone:** M4 · Demo-Ready  
> **PRD References:** `docs/Unicomply PRD.md` §6, §9, §10B; `docs/HACKATHON_PRD.md` §6, §9, §11.3  
> **Branch:** `58-backend-freeze`  
> **Automated Test Suite:** 599 tests passed, 4 skipped, 0 failed (`pytest -q` in 154s)  
> **Dependency Audit:** `pip-audit` reports 0 vulnerabilities (`backend/requirements.lock.txt` frozen)

---

## 1. Executive Summary

As part of the M4 Demo-Ready backend freeze for Unicomply (SIH 2026, PS 26264), this audit verifies:
1. **Scoping & Authorization (§6 Access & Scoping):** Every query is filtered through `scope_cases()`, single-resource accesses are gated by `get_case_in_scope_or_404()` (strictly returning 404 on unauthorized records), and linked-case summary cards never leak complainant identity or raw descriptions.
2. **Accountability & ACID Guarantees (§6 Accountability):** Every state change writes `case_action` and `audit_log` records within the same database transaction. Complex intake operations (case creation, institution resolution, overlap clustering, alert generation) execute atomically in one transaction with full rollback on failure. Neither `case_action` nor `audit_log` expose update or delete endpoints.
3. **Data Protection & Privacy (§6 Data & Privacy):** All datasets and seed records are 100% synthetic. Complaint text and descriptions are never printed to server logs or forwarded to external third-party APIs (embeddings run entirely on-device via local sentence-transformers or deterministic TF-IDF fallback).
4. **Environment, Configuration & Safe Infrastructure:** Zero hardcoded credentials or secrets; validated configuration with fail-fast startup; timing-safe password evaluation via `hmac.compare_digest`; CORS strictly restricted to designated frontend origins; unhandled server exceptions sanitized to prevent stack-trace/path leakage; and all dependencies locked and vulnerability-scanned.

---

## 2. Complete §6 Checklist Matrix

### A. Access and Scoping (PRD §6 & §4.2)
| # | Requirement | Status | Verification & Evidence |
|---|---|---|---|
| 1 | Every list, dashboard and report query goes through `scope_cases()` | **PASS** | `backend/app/core/scope.py:16-64`; applied across `modules/cases/service.py:108`, `modules/dashboard/service.py:27`, `modules/reports/service.py:35`. Verified by `test_scope.py:21-48`. |
| 2 | Every by-id load through `get_case_in_scope_or_404()` (404 when out of scope) | **PASS** | `backend/app/core/scope.py:67-85`; returns 404 (never 403) to prevent unauthorized resource enumeration. Verified by `test_scope.py:126-155`. |
| 3 | `require_roles()` enforced on case actions, overlap decisions, and review decisions | **PASS** | `backend/app/core/scope.py:88-100`; used in `modules/cases/router.py:73`, `modules/overlaps/router.py:36`, `modules/reviews/router.py:36`. Verified by `test_scope.py:53-78`. |
| 4 | Linked-case summary cards use a reduced response schema (no description, complainant name, or documents) | **PASS** | `modules/overlaps/schemas.py:28-44` (`LinkedCaseSummary` schema excludes `description`, `complainant_name`, `documents`). Verified by `test_scope.py:159-216` across all five personas. |
| 5 | Role checks live strictly in the backend; hiding buttons in the UI is never the security control | **PASS** | Role checking dependencies (`CurrentUser`, `AdminUser`, `require_roles`) evaluate against the database-backed user identity on every mutation endpoint. |

### B. Accountability & Transaction Integrity (PRD §6 & §4.3)
| # | Requirement | Status | Verification & Evidence |
|---|---|---|---|
| 6 | Every state change writes `case_action` and `audit_log` in the same transaction | **PASS** | `modules/cases/workflow.py:180-216`; `apply_action()` executes status updates, action append, and audit rows within a single atomic commit. Verified by `test_workflow.py:168-198`. |
| 7 | Intake + resolution + overlap upsert + alerts happen in **one** DB transaction with atomic rollback | **PASS** | `modules/cases/service.py:242-282`; wrapped in `try...except` with `session.rollback()`. Verified by `test_intake_real.py:121-145` (`test_a_failure_after_the_overlap_is_written_leaves_nothing_behind`). |
| 8 | Mandatory remarks enforced server-side (`REMARKS_REQUIRED`) | **PASS** | `modules/cases/workflow.py:125-132`; raises `AppError(400, "REMARKS_REQUIRED")` for escalate, transfer, and dispose actions. Verified by `test_workflow.py:85-115`. |
| 9 | `case_action` and `audit_log` have no update or delete endpoints | **PASS** | Source tree audit confirms zero `PUT`, `PATCH`, or `DELETE` route handlers exist for `CaseAction` or `AuditLog`. Verified by `test_workflow.py:202-212`. |

### C. Data & Privacy (PRD §6 & §4.7)
| # | Requirement | Status | Verification & Evidence |
|---|---|---|---|
| 10 | All seed data synthetic; no real institution names; complainant names fictional | **PASS** | `seed_data/institutions.json`, `cases.json`, `generator/vocab.py`; Permanent IDs use fictional `1-XXXXXXXXXX` format. Verified in `test_generator.py:12-45`. |
| 11 | Logs never print complaint descriptions or complainant names | **PASS** | Loggers throughout `modules/cases/`, `engine/`, and `jobs.py` log only case IDs, reference codes (`case_ref`), and execution durations. SQL echo is explicitly disabled in `app/core/db.py:16`. |
| 12 | Complaint text is never sent to third-party APIs; embeddings computed locally | **PASS** | Embeddings use local `SentenceTransformer` or local character n-gram `TfidfVectorizer` (`app/matching/embed.py:15-88`). Zero external API calls for NLP or matching. |
| 13 | `description <= 4000` and every string field has `max_length` validation | **PASS** | `modules/cases/schemas.py:22` (`Field(max_length=4000)`); verified by Pydantic schema validation tests in `test_contract_shapes.py`. |
| 14 | File uploads (N6 scope) | **N/A** | Explicitly out of MVP scope (deferred to N6 / Issue #69); no upload endpoints exposed in demo build. |

### D. Environment & Configuration (Base Blueprint §6)
| # | Requirement | Status | Verification & Evidence |
|---|---|---|---|
| 15 | All secrets in `.env`; zero secrets hardcoded in source, seed files, or fixtures | **PASS** | Codebase grep confirms zero hardcoded API keys or production secrets. `backend/.env.example` committed with documented dev placeholders. |
| 16 | `.env` and all `.env.*` ignored by Git | **PASS** | Root `.gitignore:40-42`; verified with `git check-ignore -v .env backend/.env`. |
| 17 | Settings validated with `pydantic-settings` at startup; exits cleanly on bad config | **PASS** | `app/core/config.py:122-186`; validates thresholds in $[0, 1]$, enforces `MATCH_T_REVIEW < MATCH_T_AUTO` and `OVERLAP_T_POSSIBLE < OVERLAP_T_PROBABLE`. Exits with clear error message via `load_and_validate_settings()`. Verified in `test_config.py:80-92`. |
| 18 | `JWT_SECRET` is 32+ bytes | **PASS** | `app/core/config.py:38` enforces `min_length=32`. Development default in `.env.example` provides 64-char string. |
| 19 | `DEMO_PASSWORD` is unique to project and checked with `hmac.compare_digest` | **PASS** | `app/core/security.py:20` uses constant-time comparison `hmac.compare_digest(password.encode("utf-8"), settings.DEMO_PASSWORD.encode("utf-8"))`. Verified in `test_auth.py:45-62`. |
| 20 | Generic error for unknown email or wrong password | **PASS** | `app/modules/auth/router.py:25` returns identical `AppError(401, "UNAUTHORIZED", "Invalid credentials")` for both nonexistent accounts and mismatched passwords. |
| 21 | JWT signed HS256 with 12 h expiry, sent in `Authorization: Bearer` header only | **PASS** | `app/core/security.py:25-30` (`jwt.encode(..., algorithm="HS256")`); expiry set to 720 minutes. Verified in `test_auth.py:22-38`. |
| 22 | `AUTH_DISABLED=true` emergency fallback only | **PASS** | Default is `False` in `config.py:43` and `.env.example`. When enabled, it binds to the seeded test persona without accepting external caller-supplied user IDs. |

### E. API Security & Infrastructure (Base Blueprint §6)
| # | Requirement | Status | Verification & Evidence |
|---|---|---|---|
| 23 | `CORSMiddleware` with exact frontend origins; never `*` | **PASS** | `app/main.py:105-111` applies `settings.CORS_ORIGINS` (`http://localhost:5173`). Wildcard `*` rejected. Verified in `test_config.py:65-74`. |
| 24 | Pydantic validation on every body, query, and path parameter | **PASS** | Strongly typed models across all `modules/*/schemas.py`; validated by FastAPI router endpoints. |
| 25 | All database queries through SQLModel/SQLAlchemy; zero string concatenation / raw SQL | **PASS** | 100% of database interactions utilize SQLModel ORM statements (`select(Model).where(...)`); zero raw SQL string interpolations exist. |
| 26 | `GET /health` and `GET /api/v1/health` respond without auth | **PASS** | Public unauthenticated health probes verified by `test_health.py:7-29`. |
| 27 | Standard error contract; unexpected 500 errors sanitized | **PASS** | `app/core/errors.py:147-156`; unhandled exceptions log the stack trace internally with `logger.exception()` and return generic `INTERNAL_SERVER_ERROR` with no trace, credentials, or paths leaked. Verified by `test_errors.py:121-142`. |
| 28 | `pip-audit` clean before deploy (0 high/critical vulnerabilities) | **PASS** | `pip-audit -r backend/requirements.lock.txt` executed; returns **No known vulnerabilities found**. |
| 29 | API version prefix `/api/v1` in place | **PASS** | All domain routers mounted under `/api/v1` via `settings.API_V1_PREFIX`. Verified by `test_smoke.py`. |

### F. Deliberately Skipped for Hackathon Demo (§12A Production Roadmap)
As documented in `HACKATHON_PRD.md` §6 and `Unicomply PRD.md` §12A, the following controls are deliberately omitted for the 5-persona offline demo and documented for production transition:
- External SSO (Parichay / NIC identity integration)
- Rate limiting / IP throttling (unnecessary for local laptop demo)
- Refresh token rotation & account lockouts
- PostgreSQL + `pg_trgm` + `pgvector` migration (production database architecture)
- TLS termination (provided by cloud host in production deployments)

---

## 3. Dependency Freeze and Vulnerability Audit

### Freeze File (`backend/requirements.lock.txt`)
All 60+ direct and transitive packages have been locked using `pip freeze > backend/requirements.lock.txt`, ensuring deterministic, reproducible builds across developer and demo laptops.

Key top-level package versions locked:
- `fastapi==0.162.0`
- `sqlmodel==0.0.48`
- `pydantic==2.14.1`
- `pydantic-settings==2.16.1`
- `pyjwt==2.15.1`
- `numpy==2.5.4`
- `scikit-learn==1.9.1`
- `rapidfuzz==3.14.6`
- `sentence-transformers==6.2.0`
- `torch==2.14.1`
- `uvicorn==0.54.0`
- `pytest==9.1.1`
- `httpx==0.28.1`
- `pip-audit==2.10.1`

### Vulnerability Audit (`pip-audit`)
Command executed:
```bash
./.venv/bin/pip-audit -r backend/requirements.lock.txt
```
Output:
```
No known vulnerabilities found
```

---

## 4. Test Suite Verification

Full test suite execution command:
```bash
./.venv/bin/pytest backend/tests -q
```
Actual output:
```
........................................................................ [ 11%]
........................................................................ [ 23%]
........................................................................ [ 35%]
........................................................................ [ 47%]
.......s.......................s........................................ [ 59%]
..............................................
POST /cases on the full seed (tfidf): median 16 ms, max 25 ms over 7 intakes
..s....................... [ 71%]
........s............................................................... [ 83%]
........................................................................ [ 95%]
...........................                                              [100%]
599 passed, 4 skipped in 154.12s (0:02:34)
```

Targeted suites verified:
- `backend/tests/test_smoke.py`: Swagger PRD run order end to end (Issue #47) — **PASS**
- `backend/tests/test_scope.py`: Hero path across all 5 personas (Issue #48) — **PASS**
- `backend/tests/test_matching.py`: PRD §10 matching rules suite (Issue #46) — **PASS**
- `backend/tests/test_intake_real.py`: Full-scale intake, resolution, and overlap clustering — **PASS**
- `backend/tests/test_engine_freeze.py`: Determinism across 10 reset cycles, offline TF-IDF parity (Issue #54) — **PASS**
- `backend/tests/test_alerts_live.py`: Real-time overlap alerts, deduplication, and SLA warnings — **PASS**
- `backend/tests/test_workflow.py`: State machine transitions, mandatory remarks, and audit rows — **PASS**

---

## 5. Demo-Ready Release Gate Status

Per the issue dependencies and release criteria:
```
After Full demo rehearsal ×3 against §10A + failure drills #57 passes: git tag demo-ready on the rehearsed commit and push the tag.
```
- **Issue #57 Status:** OPEN (Assigned to `@singh-shreyas`).
- **Release Gate Action:** The backend checklist, dependency lockfile, and full test suite are 100% complete and verified. The `demo-ready` Git tag will be created on the rehearsed commit once Issue #57 concludes its three consecutive rehearsal runs.

