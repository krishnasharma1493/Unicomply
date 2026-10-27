# Change log

1. **Backend moved to Python:** all Node.js/Express server logic (routes, middleware, cron, sockets, email) and any Next.js-style server code → **FastAPI + Uvicorn**. Zod → **Pydantic / pydantic-settings**. Mongoose → **SQLModel on SQLite**, with MongoDB (PyMongo Async API) as the alternative. **Flask is not used.**
2. **Auth simplified:** Google OAuth, refresh-token rotation, account lockout and session management removed. Now: **seeded demo accounts + one shared demo password + one 12-hour JWT**, plus an `AUTH_DISABLED` emergency switch.
3. **SaaS infrastructure removed:** helmet, rate limiting, mongo-sanitize, AES-256-GCM token encryption, Sentry, Winston, soft delete, TTL indexes, readiness probes, GDPR export and account-deletion flows. **Kept:** CORS allowlist, input validation, per-user data scoping, no secrets in git.
4. **Real-time and background jobs kept but simplified:** socket.io → python-socketio (frontend client unchanged); node-cron → an asyncio loop in FastAPI's lifespan. Email → console/outbox. Web Push → Future Scope.
5. **Frontend stack unchanged** (React + Vite + TypeScript). The refresh-token interceptor became "on 401 → back to login", and the token is kept in memory + sessionStorage so a page reload mid-demo doesn't log you out.
6. **Data and deployment:** synthetic seed data with a one-command reset; laptop-first demo; optional single free-tier host per tier.
7. **Added sections:** §0 Hackathon Brief & Assumptions (with demo-based success metrics), §1A MVP Scope, §10A Demo Script, §10B Risks & Fallbacks, §12A Future Scope. Nothing in the document depends on team size or event length.
8. **Rewritten:** master prompts (§11) and domain add-ons (§12) for FastAPI and hackathon scope. Testing is now Swagger `/docs` first, plus one pytest smoke test; Postman is optional.

---

# Hackathon Project Blueprint & PRD


### React + TypeScript frontend · FastAPI (Python) backend — Industry Agnostic


> **Version:** 3.0-hackathon (rewritten from Full-Stack Project Blueprint v2.2)
> **Document snapshot:** Practices are maintained over time. Dependency numbers in this file are **not** authoritative, and there are none on purpose.
> **Audience:** The hackathon team, AI coding assistants (Cursor, Copilot, Claude), mentors and judges
> **Purpose:** A scoped MVP, copy-paste prompts, folder structure, API contract and demo plan for shipping a **working, impressive demo** within a hackathon. This is not a business plan.


---


## ⚠️ Version Safety Rule (Read First)


> **Never copy version numbers from this document (or from memory) into `requirements.txt` or `package.json`.** Old pins stay vulnerable, and docs go stale the day they ship.
>
> **Hackathon twist:** take the latest stable releases at kickoff, then **freeze** them once the app runs. Don't upgrade anything mid-hackathon unless a bug forces you to.


### For humans


1. Check [pypi.org](https://pypi.org/) (backend) and [npmjs.com](https://www.npmjs.com/) (frontend) for each package. Confirm the latest **stable** release and read any security advisories shown.
2. Avoid pre-releases (alpha, beta, rc); a hackathon is the wrong place to debug one.
3. Once the walking skeleton runs (login + one CRUD flow working end to end), freeze: `pip freeze > requirements.lock.txt` and commit `package-lock.json`. Teammates install from the lock file from then on.
4. Before the demo deploy, run `pip-audit` and `npm audit`. Fix high/critical issues if the fix is a patch or minor bump; otherwise note them in §10B.


```bash
# Backend (Python)
pip index versions <package>          # published versions, newest first
pip install -U <package>              # install the latest stable
pip freeze > requirements.lock.txt    # lock exactly what works
pip install pip-audit && pip-audit    # known vulnerabilities in installed packages

# Frontend (npm)
npm show <package-name> version       # latest published
npm view <package-name> time.modified # how fresh "latest" is
npm audit                             # installed tree
```


### For AI assistants (mandatory)


Before you write or edit **`requirements.txt`**, **`requirements.lock.txt`**, **`package.json`** or **`package-lock.json`**, or recommend install commands:


1. **Web search** (use your built-in web search tool when available) for **each** non-trivial dependency, for example:
  - `"<package-name> pypi latest version"` or `"npm <package-name> latest version"`
  - `"<package-name> security advisory"` or `"<package-name> CVE"`
  For **Python**, search e.g. `"Python supported versions python.org"` and use a release that is still in bugfix or security support (not EOL, not a pre-release). For **Node.js** (frontend tooling only), use the current **Active LTS**.
2. Cross-check with **`pip index versions <package>`** or **`npm show <package> version`** when the environment allows. Search can lag; the registry is ground truth.
3. If search turns up an **unpatched CVE** on the latest release, find the patched version or a mitigation, or choose an alternative package.
4. In your reply, **briefly state** what you verified (e.g. "searched + `pip index versions fastapi` → latest stable installed"). Never invent versions.
5. In `requirements.txt`, list **names only** until the freeze; the lock file holds exact versions. In `package.json`, use **`^`** ranges for app dependencies.
6. **Avoid deprecated choices that old tutorials still suggest:** `python-jose` → use **PyJWT** (current FastAPI docs); `passlib` → use **pwdlib** if you ever hash passwords; **Motor** → use the **PyMongo Async API** (`AsyncMongoClient`); `@app.on_event("startup")` → use FastAPI **lifespan**.


**No hardcoded version table in this file.** The list below is only **names to verify**, not versions:


| Package (verify each) | What to search / check |
| --------------------- | ---------------------- |
| `fastapi` (install as `fastapi[standard]`) | Latest stable; release notes for breaking changes; Pydantic compatibility |
| `uvicorn` | Comes with `fastapi[standard]`; confirm it installed |
| `sqlmodel` | Latest stable; compatibility with the installed Pydantic and SQLAlchemy |
| `pydantic-settings` | Latest stable |
| `pyjwt` | Latest stable + advisories |
| `python-socketio` | Only if real-time is built; compatible with the `socket.io-client` major used by the frontend |
| `pymongo` | Only if you chose MongoDB; confirm the async API (`AsyncMongoClient`) |
| `pytest`, `httpx` | Latest stable (`httpx` comes with `fastapi[standard]`) |
| Frontend: `react`, `vite`, `react-router-dom`, `@tanstack/react-query`, `axios`, `react-hook-form`, `@hookform/resolvers`, `zod`, `dompurify`, `socket.io-client` | Same pattern: npm latest + advisory search |


Repeat for **every** dependency you add, including domain libraries such as a chart, calendar or map package.


---


## Table of Contents


0. [Hackathon Brief & Assumptions](#0-hackathon-brief--assumptions) *(new)*
1. [Tech Stack](#1-tech-stack)
1A. [MVP Scope](#1a-mvp-scope) *(new)*
2. [Repository Structure](#2-repository-structure)
3. [Environment Variables](#3-environment-variables)
4. [Backend Architecture](#4-backend-architecture)
5. [API Documentation Standard](#5-api-documentation-standard)
6. [Backend Security Checklist](#6-backend-security-checklist)
7. [Frontend Architecture](#7-frontend-architecture)
8. [Frontend Security Checklist](#8-frontend-security-checklist)
9. [AI Workflow, CI & Git Hygiene](#9-ai-workflow-ci--git-hygiene)
10. [Postman & Testing Guide](#10-postman--testing-guide)
10A. [Demo Script](#10a-demo-script) *(new)*
10B. [Risks & Fallbacks](#10b-risks--fallbacks) *(new)*
11. [Master Prompts](#11-master-prompts)
12. [Domain Add-On Prompts](#12-domain-add-on-prompts)
12A. [Future Scope](#12a-future-scope) *(new)*
13. [Document Maintenance](#13-document-maintenance)


---


## 0. Hackathon Brief & Assumptions


Fill this in at kickoff. Every other section refers back to it.


| Field | Value |
| ----- | ----- |
| **Project name** | `<PROJECT_NAME>` |
| **One-line pitch** | `<WHO>` can `<DO WHAT>` so that `<OUTCOME>` |
| **Industry / domain** | `<YOUR_INDUSTRY>` |
| **Primary resources** | `<RESOURCE_1>`, `<RESOURCE_2>`. Code examples use **`items`** as the stand-in for `<RESOURCE_1>`; rename it. |
| **Signature feature** | `<SIGNATURE_FEATURE>`: the one thing judges should remember (an AI insight, a live map, a prediction, a visualization) |
| **Users** | 5–6 people: the team and the judges. No public users, no sign-ups. |
| **Judging criteria** | `<PASTE THE OFFICIAL RUBRIC HERE>` |


### Goal


A working, end-to-end product that shows the core idea **reliably in 3–5 minutes**, on stage, on venue Wi-Fi or with no Wi-Fi at all.


### Non-goals


Revenue, pricing, billing, subscriptions, payment integrations, onboarding funnels, analytics/growth metrics, marketing and go-to-market, organizations and multi-tenancy, complex roles, scalability, load balancing, caching layers, queues, microservices, high availability, compliance (GDPR, SOC 2), SLAs and enterprise security hardening. None of these are built. Where the original blueprint relied on them, §12A says what happened to each.


### Assumptions


Decisions made where the original was silent or ambiguous:


| # | Assumption | Why |
| - | ---------- | --- |
| A1 | The original backend is Node.js/Express; it has no Next.js API routes or server actions. **Every** piece of server logic moves to Python. If your copy does contain Next.js server code, it moves to FastAPI in exactly the same way. | The brief requires a Python backend and a frontend with no business logic. |
| A2 | **FastAPI only. Flask adds no value here**, because every endpoint fits FastAPI and a second service would be one more process to run and deploy. | Simplicity. |
| A3 | Database: **SQLite file via SQLModel**. MongoDB is an allowed alternative (PyMongo Async API) if the team already knows it or the data is document-shaped. Pick one at kickoff; never both. | Zero setup, works offline, and reset is just deleting a file. |
| A4 | Auth: **hardcoded demo login.** Seeded accounts share one demo password from `.env`; the backend issues one 12-hour JWT. No registration, OAuth or refresh tokens. `AUTH_DISABLED=true` is the emergency switch. | Enough to show "my data vs. your data" without auth eating into build time. |
| A5 | Data belongs to a user (`owner_id`), and each demo account sees its own seeded records. If your product is a shared workspace, drop the owner filter (one line in `get_owned_or_404` and in list queries). | Matches the original ownership model at minimal cost. |
| A6 | JSON is **snake_case** with **integer ids** (`id`, `owner_id`, `total_pages`), which are Pydantic and SQLite defaults. Frontend TypeScript types mirror them exactly. | No alias configuration to debug. |
| A7 | The primary demo runs on a **team laptop at localhost**. A free-tier deployment is a bonus link for judges, not the plan. | Venue networks fail; localhost doesn't. |
| A8 | **All data is synthetic.** No real personal, health or financial data, even in seed files. | Removes the need for compliance work entirely. |
| A9 | The "signature feature" may call an external API or a local model. It always has a **recorded fixture fallback** (`USE_MOCKS=true`). | The most impressive feature is usually the most fragile one. |


### Success metrics (demo and judging, not growth)


| Metric | Target |
| ------ | ------ |
| Demo path runs end to end with no restart | 3 consecutive clean rehearsals before judging |
| Demo length | 3:30–4:30 inside a 5:00 slot |
| Signature feature response on stage | Under 3 s live, or instant from fixture |
| Must-have list (§1A) | 100% done by feature freeze |
| Crashes or blank screens during the demo | 0. Every screen has loading, empty and error states. |
| "What does it do?" test | A non-team person can explain it after the first 30 seconds |
| Rubric coverage | Every judging criterion maps to a named moment in the demo script (§10A) |
| Recovery time if something breaks | Under 30 s, using a fallback from §10B |
| Fresh-clone setup | Someone who didn't write the README gets it running in 10 minutes or less |


---


## 1. Tech Stack


> Replace `<YOUR_DOMAIN_UI_LIB>` with whatever fits your industry (e.g. FullCalendar for scheduling, Recharts or Chart.js for analytics, react-map-gl or Leaflet for maps, @dnd-kit for boards).




| Layer                | Choice                        | Versions | Notes                      |
| -------------------- | ----------------------------- | -------- | -------------------------- |
| **Runtime (backend)** | Python                       | **Web search** a currently supported release; never hardcode from docs | Use [python.org](https://www.python.org/) + search; one `venv` per laptop |
| **Framework**        | FastAPI (install `fastapi[standard]`) | **Search + `pip index versions`** | Bundles the Uvicorn dev server and `httpx`; auto-generates `/docs` |
| **ASGI server**      | Uvicorn                       | Comes with the framework install | `uvicorn app.main:app --reload` |
| **Flask**            | **Not used**                  | —        | FastAPI covers every endpoint; a second framework adds a process and no capability |
| **Language**         | Python with type hints (backend), TypeScript strict (frontend) | — | Type hints on every function |
| **Database**         | SQLite (single file `app.db`) | Ships with Python | MongoDB (local or Atlas free cluster) as the alternative, per A3 |
| **ORM**              | SQLModel (SQLAlchemy + Pydantic) | **Search + `pip index versions`** | Mongo alternative: PyMongo Async API (`AsyncMongoClient`); Motor is deprecated |
| **Validation**       | Pydantic (bundled with FastAPI) + `pydantic-settings` for env | **Search** | Request bodies, query params, responses, env |
| **Auth**             | Seeded demo accounts + shared demo password | — | No OAuth, no registration, no refresh tokens (A4) |
| **JWT**              | PyJWT                         | **Search + advisory** | One HS256 access token, 12 h |
| **Password hashing** | **Not needed** for the MVP    | —        | Shared password compared with `hmac.compare_digest`. If you add sign-up: `pwdlib[argon2]` |
| **Security headers** | **Dropped**                   | —        | Hosts serve HTTPS; no CSP tuning in scope |
| **CORS**             | FastAPI `CORSMiddleware` (built in) | — | Explicit origin allowlist from env |
| **Rate limiting**    | **Dropped**                   | —        | 5–6 known users; see §12A |
| **Injection safety** | SQLModel/SQLAlchemy parameterized queries | — | Replaces `express-mongo-sanitize`; never build SQL with f-strings |
| **Real-time**        | python-socketio (ASGI, same port) | **Search + compat with client** | Optional (`ENABLE_REALTIME`); frontend keeps `socket.io-client` |
| **Job scheduling**   | `asyncio` loop started in FastAPI lifespan | Stdlib | Optional (`ENABLE_SCHEDULER`); replaces node-cron |
| **Email**            | **None.** Log "would send" lines to the console | — | Real delivery is in §12A |
| **Logging**          | Python `logging` to stdout    | Stdlib   | Never log passwords or tokens |
| **Monitoring**       | **None.** Watch the Uvicorn terminal | — | Sentry is in §12A |
| **Testing**          | pytest + FastAPI `TestClient` | **Search** | One smoke test covering the demo path |
| **Frontend**         | React + Vite (unchanged)       | **Search + `npm show`** each | SPA; UI only, no business logic or DB access |
| **Routing**          | react-router-dom              | **Search + `npm show`** | Protected routes |
| **Server state**     | TanStack Query                | **Search + `npm show`** | Caching + retries |
| **HTTP client**      | Axios                         | **Search + `npm show`** | Interceptors for token + 401 |
| **Forms**            | React Hook Form + Zod         | **Search + `npm show`** each | Mirror the Pydantic constraints |
| **HTML sanitize**    | DOMPurify                     | **Search + `npm show` + advisory** | Only where HTML/markdown is rendered |
| **Domain UI**        | `<YOUR_DOMAIN_UI_LIB>`        | —                | Industry-specific |
| **Deploy: Frontend** | Laptop (`npm run dev` / `npm run preview`); optional Vercel or Netlify free tier | — | Set `VITE_*` vars in the host dashboard |
| **Deploy: Backend**  | Laptop (Uvicorn); optional single free-tier web service (e.g. Render) | — | Check current free-tier terms; many sleep when idle |
| **Deploy: DB**       | SQLite file next to the app, reseeded on boot | — | Atlas free cluster only if you chose MongoDB |




**Token lifetime standard:**


- One access JWT, `720 minutes` (12 h), long enough that nobody is logged out mid-demo. Sent in the `Authorization: Bearer` header.
- No refresh token and no cookies. On expiry or any 401, the frontend clears the token and returns to the login page, which is pre-filled in demo mode.


**Ports:** backend `8000`, frontend `5173`.


---


## 1A. MVP Scope


**Rule:** nothing from "Nice to have" starts until every "Must have" row is done and the demo path has been run once end to end.


### Must have for the demo


| # | Feature | Done when |
| - | ------- | --------- |
| M1 | Demo login | Seeded accounts can log in; the login page is pre-filled when `VITE_DEMO_MODE=true`; `GET /api/v1/users/me` works |
| M2 | `<RESOURCE_1>` CRUD | Create, list (search, status filter, pagination), view, edit and delete all work **through the UI** |
| M3 | Signature feature `<SIGNATURE_FEATURE>` | One endpoint + one UI view; works live **and** with `USE_MOCKS=true` |
| M4 | Dashboard / home screen | The first screen after login tells the story with seeded data (key number, recent items, the "wow" result) |
| M5 | Seed + reset | `python -m app.seed --reset` restores the exact demo state in under 5 seconds |
| M6 | Consistent errors and UI states | Every API error uses the standard shape; every screen has loading, empty and error states |
| M7 | API docs | FastAPI `/docs` lists every endpoint with request/response models |
| M8 | Runs from a clean clone | README setup works in 10 minutes or less, tested by someone who didn't write it |
| M9 | Backup demo video | A 3-minute screen recording of the full demo path, saved locally |


### Nice to have if time allows (in priority order)


| # | Feature | Why it's worth it |
| - | ------- | ----------------- |
| N1 | Real-time updates (python-socketio ↔ socket.io-client) | A change in one window appearing in another is very visible in a demo |
| N2 | Background job loop (reminders, status changes) → in-app toast | Shows the product "doing things on its own" |
| N3 | `<RESOURCE_2>` linked to `<RESOURCE_1>` | Makes the data model feel real |
| N4 | Public deployed link (frontend + backend free tier) | Judges can try it afterwards |
| N5 | `<YOUR_DOMAIN_UI_LIB>` view (calendar, chart, map, kanban) | Domain credibility |
| N6 | Self-registration (`POST /api/v1/auth/register`, pwdlib hashing) | Only if judges are expected to create accounts |
| N7 | "Outbox" page listing emails the app would have sent | Shows notifications without SMTP setup |
| N8 | Postman collection, CI workflow, dark mode, mobile polish | Polish |


### Explicitly out


Google OAuth, refresh-token rotation, rate limiting, account lockout, encryption at rest, Web Push, real payments, GDPR export/deletion, multi-tenancy, monitoring. Each has a one-line reason in §12A.


---


## 2. Repository Structure


```
ProjectRoot/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                    # FastAPI app: lifespan, CORS, error handlers, /health, routers, optional socket.io
│   │   ├── models.py                  # Imports every table model so create_all() sees them
│   │   ├── seed.py                    # `python -m app.seed [--reset]`: tables + demo data
│   │   ├── realtime.py                # python-socketio server + broadcast() (optional)
│   │   ├── jobs.py                    # asyncio background loop (optional)
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── config.py              # pydantic-settings; exits on startup if misconfigured
│   │   │   ├── db.py                  # engine, init_db(), reset_db(), get_session()
│   │   │   ├── security.py            # JWT create/decode, timing-safe demo password check
│   │   │   ├── deps.py                # SessionDep, CurrentUser, AdminUser dependencies
│   │   │   ├── errors.py              # AppError + handlers → standard JSON error shape
│   │   │   └── schemas.py             # Envelope[T], Page[T], Pagination, ErrorBody
│   │   ├── modules/                   # One folder per domain resource
│   │   │   ├── __init__.py
│   │   │   ├── auth/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── router.py          # POST /auth/login
│   │   │   │   └── schemas.py         # LoginIn, LoginOut
│   │   │   ├── users/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── models.py          # User table
│   │   │   │   ├── schemas.py         # UserRead
│   │   │   │   └── router.py          # GET /users/me
│   │   │   ├── items/                 # Stand-in for <RESOURCE_1>; copy for each resource
│   │   │   │   ├── __init__.py
│   │   │   │   ├── models.py          # Item table + ItemBase + ItemStatus
│   │   │   │   ├── schemas.py         # ItemCreate, ItemUpdate, ItemRead, SignatureResult
│   │   │   │   ├── router.py          # HTTP layer: CRUD + signature endpoint
│   │   │   │   └── service.py         # Logic: signature feature + fixture fallback
│   │   │   └── demo/
│   │   │       ├── __init__.py
│   │   │       └── router.py          # POST /demo/reset (admin only)
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── ownership.py           # get_owned_or_404()
│   │       └── time.py                # utcnow()
│   ├── seed_data/
│   │   ├── demo.json                  # Users + records that tell one story (committed)
│   │   └── signature_fixtures.json    # Recorded "wow" results for offline demos (committed)
│   ├── tests/
│   │   ├── conftest.py                # Test env vars + fresh test DB
│   │   └── test_smoke.py              # Demo path: health → login → CRUD → signature → errors
│   ├── postman/                       # Optional: exported collection + env template (no secrets)
│   ├── .env.example                   # Committed template with dummy values
│   ├── requirements.txt               # Package names only (see Version Safety Rule)
│   ├── requirements.lock.txt          # `pip freeze` output after the freeze point
│   └── README.md
│
├── frontend/                          # Stack unchanged from the original blueprint
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                    # Route definitions
│   │   ├── lib/
│   │   │   ├── env.ts                 # VITE_* Zod validation
│   │   │   ├── realtime.ts            # socket.io-client hook (optional)
│   │   │   └── api/
│   │   │       ├── client.ts          # Axios base + token header + 401 handling
│   │   │       └── types.ts           # TS mirrors of Pydantic schemas (snake_case)
│   │   ├── auth/
│   │   │   ├── AuthProvider.tsx       # Context: user, login, logout
│   │   │   └── tokenStore.ts          # Memory + sessionStorage (demo trade-off)
│   │   ├── components/
│   │   │   ├── RequireAuth.tsx        # Route guard
│   │   │   ├── ErrorBoundary.tsx      # Catch render errors
│   │   │   └── FullPageSpinner.tsx
│   │   ├── features/                  # Domain modules (one per API resource)
│   │   │   └── items/
│   │   │       ├── api.ts             # TanStack Query hooks
│   │   │       ├── components/
│   │   │       └── types.ts           # Re-exports from lib/api/types if needed
│   │   └── pages/                     # LoginPage, DashboardPage, ItemsPage, ItemDetailPage, NotFoundPage
│   ├── .env.example
│   └── package.json
│
├── docs/
│   ├── HACKATHON_PRD.md               # This file (it is also the API contract)
│   └── pitch/                         # Slides, architecture image, backup video link
├── .gitignore
└── .cursorignore
```


**Rules — never break these:**


- Never commit `.env`, `.venv/`, `__pycache__/`, `*.db`, `node_modules/`, `dist/` or `build/`.
- Always commit `.env.example` (placeholder values + comments), `seed_data/`, `requirements.txt`, `requirements.lock.txt` (after the freeze) and `package-lock.json`.
- One source of truth for config: `app/core/config.py` (backend) and `src/lib/env.ts` (frontend).
- All business logic and DB access live in `backend/`. The frontend renders UI and calls HTTP endpoints, nothing else.
- Type hints on every backend function; TypeScript strict mode on the frontend. No `any` unless it is typed and commented.
- `main` is always runnable. If `main` is broken, fixing it is everyone's top priority.


### `.gitignore` — dependencies, env files, secrets, databases and build output


**Commit:** source code, `requirements*.txt`, `package.json` / `package-lock.json`, `.env.example`, `seed_data/`, Postman templates (no real secrets), `README` and `docs/`.


**Never commit:** real secrets, virtual environments, `node_modules`, local databases or generated bundles.


Use one **root** `.gitignore`:


```gitignore
# Python
.venv/
venv/
__pycache__/
*.py[cod]
.pytest_cache/
.ruff_cache/
.mypy_cache/

# Local databases (recreated by `python -m app.seed --reset`)
*.db
*.db-journal
*.db.bak
*.sqlite3

# Frontend dependencies (reinstall with npm ci)
node_modules/

# Environment & secrets — NEVER commit (only .env.example is allowed)
.env
.env.*
!.env.example

# Private keys and common secret filenames
*.pem
*.key
id_rsa
id_ed25519
*.p12
*.pfx

# Build output
dist/
build/
out/
*.tsbuildinfo

# Logs & coverage
*.log
npm-debug.log*
coverage/
htmlcov/
.coverage

# OS / editor noise
.DS_Store
Thumbs.db
```


**Rules:**


- **`.venv/` and `node_modules/`** must be ignored everywhere. Lock files **are** committed for reproducible installs.
- **`.env`, `.env.local`, `.env.production`** are all covered by `.env.*` with the `!.env.example` exception.
- **`*.db`**: the demo database is generated from `seed_data/`, so the JSON is the source of truth, not the `.db` file.
- **Verify before the first push:** `git status` must not list `.env`, `.venv`, `node_modules` or `app.db`. Use `git check-ignore -v <path>` if unsure.


**AI / IDE indexing:** keep secrets out of model context; see [Section 9](#9-ai-workflow-ci--git-hygiene) (`.cursorignore` and copy-paste rules).


---


## 3. Environment Variables


### Backend `.env.example`


```env
# ── Server ──────────────────────────────────────────────────────────────
APP_ENV=development              # development | demo | test
PORT=8000

# ── Database ─────────────────────────────────────────────────────────────
DATABASE_URL=sqlite:///./app.db
# MongoDB alternative (only if you chose Mongo at kickoff — see A3):
# MONGODB_URI=mongodb://localhost:27017/hackathon_demo

# ── Auth (demo-grade) ────────────────────────────────────────────────────
# Generate: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET=replace_with_64_char_hex
JWT_EXPIRES_MINUTES=720
# One shared password for every seeded demo account. Never a password anyone uses elsewhere.
DEMO_PASSWORD=change-me-demo-pass
# Emergency switch: every request acts as the first seeded user. Synthetic data only.
AUTH_DISABLED=false

# ── CORS (comma-separated exact origins, no trailing slash) ──────────────
CORS_ORIGINS=http://localhost:5173
# Deployed: CORS_ORIGINS=http://localhost:5173,https://<your-frontend-host>

# ── Demo data ────────────────────────────────────────────────────────────
SEED_ON_STARTUP=true             # seeds an empty DB on boot (self-heals free-tier restarts)

# ── Optional features ────────────────────────────────────────────────────
ENABLE_REALTIME=false            # python-socketio on the same port
ENABLE_SCHEDULER=false           # asyncio background loop

# ── Signature feature / third-party provider (optional) ──────────────────
SIGNATURE_API_KEY=
USE_MOCKS=false                  # true = serve seed_data/signature_fixtures.json (offline-safe)
```


### Frontend `.env.example`


```env
# ── API ───────────────────────────────────────────────────────────────────
VITE_API_BASE_URL=http://localhost:8000

# ── Feature flags ────────────────────────────────────────────────────────
VITE_ENABLE_REAL_TIME=false      # must match backend ENABLE_REALTIME
VITE_AUTH_DISABLED=false         # must match backend AUTH_DISABLED

# ── Demo mode: pre-fills the login form ──────────────────────────────────
# Everything prefixed VITE_ ships to the browser. That is acceptable ONLY because this is a
# shared demo password protecting synthetic data. Never put a real secret or API key here.
VITE_DEMO_MODE=true
VITE_DEMO_EMAIL=demo@example.com
VITE_DEMO_PASSWORD=change-me-demo-pass
```


### Env Validation Pattern (Backend)


```python
# app/core/config.py
import sys
from typing import Literal

from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_ENV: Literal["development", "demo", "test"] = "development"
    PORT: int = 8000

    DATABASE_URL: str = "sqlite:///./app.db"
    MONGODB_URI: str | None = None  # only if you chose MongoDB

    JWT_SECRET: str = Field(min_length=32)
    JWT_EXPIRES_MINUTES: int = Field(default=720, ge=5, le=60 * 48)
    DEMO_PASSWORD: str = Field(min_length=8)
    AUTH_DISABLED: bool = False

    CORS_ORIGINS: str = "http://localhost:5173"
    SEED_ON_STARTUP: bool = True

    ENABLE_REALTIME: bool = False
    ENABLE_SCHEDULER: bool = False

    SIGNATURE_API_KEY: str | None = None
    USE_MOCKS: bool = False

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.CORS_ORIGINS.split(",") if o.strip()]


def load_settings() -> Settings:
    try:
        return Settings()  # type: ignore[call-arg]  # values come from env vars / .env
    except ValidationError as exc:
        print(f"❌ Invalid environment variables:\n{exc}", file=sys.stderr)
        sys.exit(1)  # crash immediately — never run with bad config


settings = load_settings()
```


### Env Validation Pattern (Frontend)


```typescript
// src/lib/env.ts
import { z } from 'zod';

const flag = z.string().optional().transform((v) => v === 'true');

const schema = z.object({
  VITE_API_BASE_URL: z.string().url(),
  VITE_ENABLE_REAL_TIME: flag,
  VITE_AUTH_DISABLED: flag,
  VITE_DEMO_MODE: flag,
  VITE_DEMO_EMAIL: z.string().optional(),
  VITE_DEMO_PASSWORD: z.string().optional(),
});

const parsed = schema.safeParse(import.meta.env);
if (!parsed.success) {
  console.error('❌ Invalid VITE_* environment variables', parsed.error.issues);
  throw new Error('Invalid frontend environment — check frontend/.env');
}

export const env = parsed.data;
```


### Local setup & run


```bash
# ── Backend ──────────────────────────────────────────────────────────────
cd backend
python -m venv .venv
source .venv/bin/activate                 # Windows: .venv\Scripts\activate
pip install -r requirements.txt           # after the freeze: requirements.lock.txt
cp .env.example .env                      # Windows: copy .env.example .env — then set JWT_SECRET + DEMO_PASSWORD
python -m app.seed --reset                # tables + demo data
uvicorn app.main:app --reload --port 8000 # → http://localhost:8000/docs
python -m pytest -q                       # smoke test (separate terminal, same venv)

# ── Frontend (new terminal) ──────────────────────────────────────────────
cd frontend
npm install                               # npm ci once package-lock.json is committed
cp .env.example .env
npm run dev                               # → http://localhost:5173
```


`backend/requirements.txt` (names only; versions are resolved at install and frozen into `requirements.lock.txt`):


```text
fastapi[standard]
sqlmodel
pydantic-settings
pyjwt
python-socketio   # only if ENABLE_REALTIME is used
pytest
# pymongo         # only if you chose MongoDB instead of SQLite
# pwdlib[argon2]  # only if you add self-registration (N6)
# ruff            # optional linting
```


---


## 4. Backend Architecture


### Architecture overview


```
 Browser ── React + Vite + TypeScript (UI only: pages, components, TanStack Query, Axios)
    │   HTTP/JSON · Authorization: Bearer <jwt>                 ▲  socket.io events (optional)
    ▼                                                           │
 FastAPI app — one Uvicorn process, port 8000 ──────────────────┘
    ├─ CORSMiddleware → routers (/api/v1/...) → services
    ├─ Pydantic schemas validate every request and response
    ├─ Exception handlers → one standard JSON error shape
    ├─ python-socketio ASGI wrapper            (if ENABLE_REALTIME)
    ├─ asyncio job loop started in lifespan    (if ENABLE_SCHEDULER)
    ├─ SQLModel / SQLAlchemy ──► SQLite file app.db   (or MongoDB via PyMongo Async)
    └─ httpx ──► <SIGNATURE_FEATURE> provider or local model
                 (falls back to seed_data/signature_fixtures.json on failure or USE_MOCKS=true)
```


**Request lifecycle:** CORS check → route match → Pydantic validates path/query/body (400 on failure) → `get_current_user` verifies the JWT (401 on failure) → handler → `get_owned_or_404` for anything loaded by id → service logic → DB → response model serializes `{ success, data }` → optional `broadcast()` runs after the response.


### Middleware Stack Order (main.py)


Every request passes through this chain in order. Order still matters, but the chain is much shorter than the Express original.


```python
# app/main.py
import asyncio
import logging
from contextlib import asynccontextmanager

import socketio
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.db import init_db
from app.core.errors import register_error_handlers
from app.jobs import job_loop
from app.modules.auth.router import router as auth_router
from app.modules.demo.router import router as demo_router
from app.modules.items.router import router as items_router
from app.modules.users.router import router as users_router
from app.realtime import sio
from app.seed import seed_if_empty

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 1. Create tables and load demo data (makes free-tier restarts self-healing)
    init_db()
    if settings.SEED_ON_STARTUP:
        seed_if_empty()
    # 2. Optional background loop (replaces node-cron)
    task = asyncio.create_task(job_loop()) if settings.ENABLE_SCHEDULER else None
    yield
    if task:
        task.cancel()


api = FastAPI(title="<PROJECT_NAME> API", version="0.1.0", lifespan=lifespan)

# 3. CORS — explicit origins only; no cookies are used, so credentials stay off
api.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# 4. One error shape for everything: validation, 401/403/404, conflicts, unhandled 500s
register_error_handlers(api)


# 5. Liveness — no auth, no DB
@api.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


# 6. Versioned API
v1 = APIRouter(prefix="/api/v1")
for module_router in (auth_router, users_router, items_router, demo_router):
    v1.include_router(module_router)
api.include_router(v1)

# 7. Optional socket.io on the same port; python-socketio handles /socket.io, FastAPI handles the rest
app = socketio.ASGIApp(sio, other_asgi_app=api) if settings.ENABLE_REALTIME else api
```


```python
# app/core/db.py
from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")
engine = create_engine(
    settings.DATABASE_URL,
    # check_same_thread: FastAPI runs sync routes in a threadpool; timeout: wait instead of "database is locked"
    connect_args={"check_same_thread": False, "timeout": 15} if _is_sqlite else {},
)


def init_db() -> None:
    import app.models  # noqa: F401 — registers every table on SQLModel.metadata

    SQLModel.metadata.create_all(engine)


def reset_db() -> None:
    import app.models  # noqa: F401

    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
```


```python
# app/models.py — import every table model here so create_all() knows about it
from app.modules.items.models import Item  # noqa: F401
from app.modules.users.models import User  # noqa: F401
```


**Removed from the original stack, and why:**


| Original (Express) | Hackathon (FastAPI) | Reason |
| ------------------ | ------------------- | ------ |
| Sentry request/error handlers | Uvicorn terminal + `logging` | 5–6 users; you're watching the terminal |
| `helmet()` | — | No CSP tuning in scope; hosts provide HTTPS |
| `cors()` | `CORSMiddleware` | **Kept**: browsers need it |
| `express.json({ limit: '10kb' })` | `max_length` on every string field in Pydantic schemas | Same protection at the field level |
| `express-mongo-sanitize()` | SQLAlchemy parameterized queries | Not applicable to SQL; never use f-string SQL |
| `morgan` | Uvicorn access log | Built in |
| Global + auth rate limiters | — | Known users only (§12A) |


### Health & readiness (demo hosts)


- **`GET /health` (liveness)**: returns `{"status": "ok"}` with no DB call and no auth. Hit it shortly before the demo to wake a sleeping free-tier host.
- **`GET /ready`**: **dropped.** With SQLite inside the same process, "ready" equals "alive."


**Demo hosting options:**


| Option | When | How |
| ------ | ---- | --- |
| **Laptop (default)** | Always: the stage demo | Backend: `uvicorn app.main:app --port 8000`. Frontend: `npm run dev`, or `npm run build && npm run preview` for a production build. Works with no internet if `USE_MOCKS=true`. |
| **Single free-tier host (bonus)** | A judge wants a link | Backend on any free web service with start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`; frontend on a static host with `VITE_API_BASE_URL` set to the backend URL. Add the exact frontend URL to `CORS_ORIGINS`. Free-tier disks are often ephemeral, so `SEED_ON_STARTUP=true` reseeds after every restart. |


### Standard Error Response Shape


All responses follow this shape. It is defined once in `app/core/schemas.py` and `app/core/errors.py`.


```jsonc
// All error responses:
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",           // Machine-readable constant (see §5)
    "message": "Human readable",    // Shown to the user as-is
    "fields": {                     // Only present on VALIDATION_ERROR
      "title": ["String should have at least 1 character"]
    }
  }
}

// All success responses:
{ "success": true, "data": { ... } }

// Paginated success:
{
  "success": true,
  "data": [ ... ],
  "pagination": { "total": 100, "page": 1, "limit": 20, "total_pages": 5 }
}
```


```python
# app/core/schemas.py
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Envelope(BaseModel, Generic[T]):
    success: Literal[True] = True
    data: T


class Pagination(BaseModel):
    total: int
    page: int
    limit: int
    total_pages: int


class Page(BaseModel, Generic[T]):
    success: Literal[True] = True
    data: list[T]
    pagination: Pagination


class ErrorDetail(BaseModel):
    code: str
    message: str
    fields: dict[str, list[str]] | None = None


class ErrorBody(BaseModel):
    success: Literal[False] = False
    error: ErrorDetail
```


```python
# app/core/errors.py
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.schemas import ErrorBody, ErrorDetail

logger = logging.getLogger(__name__)

_HTTP_CODES = {
    400: "INVALID_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
}


class AppError(Exception):
    """Raise anywhere: raise AppError(404, "NOT_FOUND", "Resource not found")."""

    def __init__(
        self, status_code: int, code: str, message: str, fields: dict[str, list[str]] | None = None
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields = fields


def error_response(
    status_code: int, code: str, message: str, fields: dict[str, list[str]] | None = None
) -> JSONResponse:
    body = ErrorBody(error=ErrorDetail(code=code, message=message, fields=fields))
    return JSONResponse(status_code=status_code, content=body.model_dump(exclude_none=True))


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return error_response(exc.status_code, exc.code, exc.message, exc.fields)

    @app.exception_handler(RequestValidationError)
    async def handle_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields: dict[str, list[str]] = {}
        for err in exc.errors():
            path = [str(p) for p in err["loc"] if p not in ("body", "query", "path", "header")]
            fields.setdefault(".".join(path) or "request", []).append(err["msg"])
        # 400 (not FastAPI's default 422) to keep the original contract
        return error_response(400, "VALIDATION_ERROR", "Validation failed", fields)

    @app.exception_handler(IntegrityError)
    async def handle_integrity(_: Request, exc: IntegrityError) -> JSONResponse:
        logger.warning("Integrity error: %s", exc.orig)
        return error_response(409, "CONFLICT", "That conflicts with existing data")

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return error_response(exc.status_code, _HTTP_CODES.get(exc.status_code, "HTTP_ERROR"), str(exc.detail))

    @app.exception_handler(Exception)
    async def handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error", exc_info=exc)
        return error_response(500, "INTERNAL_ERROR", "Something went wrong — check the backend terminal")
```


### Ownership Check Helper


Use this in every handler that loads a record by id. Never assume a record belongs to the caller just because they're logged in.


```python
# app/utils/ownership.py
from typing import TypeVar

from sqlmodel import Session, SQLModel

from app.core.errors import AppError

M = TypeVar("M", bound=SQLModel)


def get_owned_or_404(session: Session, model: type[M], obj_id: int, owner_id: int | None) -> M:
    """Load a row only if it belongs to the caller. Always 404, never 403, so we don't confirm it exists."""
    obj = session.get(model, obj_id)
    if obj is None or getattr(obj, "owner_id", None) != owner_id:
        raise AppError(404, "NOT_FOUND", "Resource not found")
    return obj


# Usage in any handler:
# item = get_owned_or_404(session, Item, item_id, user.id)
```


### Timing-Safe Token Comparison


`hmac.compare_digest` is Python's equivalent of `crypto.timingSafeEqual` and handles length mismatches safely. It is used for the shared demo password; JWT signatures are verified by PyJWT.


```python
# app/core/security.py
import hmac
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings

ALGORITHM = "HS256"


def check_demo_password(candidate: str) -> bool:
    return hmac.compare_digest(candidate.encode(), settings.DEMO_PASSWORD.encode())


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + timedelta(minutes=settings.JWT_EXPIRES_MINUTES)}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)


def decode_user_id(token: str) -> int:
    """Raises jwt.ExpiredSignatureError, jwt.InvalidTokenError, KeyError or ValueError on a bad token."""
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
    return int(payload["sub"])
```


```python
# app/core/deps.py
from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, col, select

from app.core.config import settings
from app.core.db import get_session
from app.core.errors import AppError
from app.core.security import decode_user_id
from app.modules.users.models import User

SessionDep = Annotated[Session, Depends(get_session)]
_bearer = HTTPBearer(auto_error=False)  # also adds the "Authorize" button to /docs


def get_current_user(
    session: SessionDep,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if settings.AUTH_DISABLED:  # emergency demo switch — see §10B
        fallback = session.exec(select(User).order_by(col(User.id))).first()
        if fallback is not None:
            return fallback
    if creds is None:
        raise AppError(401, "UNAUTHORIZED", "Missing access token")
    try:
        user_id = decode_user_id(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise AppError(401, "TOKEN_EXPIRED", "Session expired — log in again") from None
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise AppError(401, "TOKEN_INVALID", "Invalid access token") from None
    user = session.get(User, user_id)
    if user is None:
        raise AppError(401, "TOKEN_INVALID", "User no longer exists")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(user: CurrentUser) -> User:
    if not user.is_admin:
        raise AppError(403, "FORBIDDEN", "Admin only")
    return user


AdminUser = Annotated[User, Depends(require_admin)]
```


### Data Models (SQLModel + Pydantic)


| Table | Columns | Notes |
| ----- | ------- | ----- |
| `user` | `id`, `email` (unique), `name`, `is_admin`, `created_at` | Seeded only (no sign-up in the MVP) |
| `item` (stand-in for `<resource_1>`) | `id`, `owner_id` → `user.id`, `title`, `description`, `status`, `created_at`, `updated_at` | Rename and add domain fields |
| `<resource_2>` | `id`, `owner_id` → `user.id`, `item_id` → `item.id`, domain fields, `created_at` | Nice-to-have N3 |


Pattern: a **table model** for storage and separate **Create / Update / Read** schemas for the API, so clients can never set `id`, `owner_id` or timestamps.


```python
# app/utils/time.py
from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
```


```python
# app/modules/users/models.py
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.utils.time import utcnow


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True, max_length=254)
    name: str = Field(max_length=80)
    is_admin: bool = False
    created_at: datetime = Field(default_factory=utcnow)
```


```python
# app/modules/users/schemas.py
from sqlmodel import SQLModel


class UserRead(SQLModel):
    id: int
    email: str
    name: str
    is_admin: bool
```


```python
# app/modules/items/models.py
from datetime import datetime
from enum import Enum

from sqlmodel import Field, SQLModel

from app.utils.time import utcnow


class ItemStatus(str, Enum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"


class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    status: ItemStatus = ItemStatus.todo


class Item(ItemBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
```


```python
# app/modules/items/schemas.py
from datetime import datetime
from typing import Any, Literal

from sqlmodel import Field, SQLModel

from app.modules.items.models import ItemBase, ItemStatus


class ItemCreate(ItemBase):
    pass


class ItemUpdate(SQLModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    status: ItemStatus | None = None


class ItemRead(ItemBase):
    id: int
    owner_id: int
    created_at: datetime
    updated_at: datetime


class SignatureResult(SQLModel):
    item_id: int
    summary: str
    score: float | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    source: Literal["live", "fixture"]
```


> **Timestamps:** stored and returned in UTC. SQLite drops the UTC offset, so the frontend treats offset-less timestamps as UTC (`parseUtc` in §7).
>
> **If you chose MongoDB:** keep every Create/Update/Read schema, drop the `table=True` models, use collections `users` and `items` through `AsyncMongoClient(settings.MONGODB_URI)` created in lifespan, map `_id` → `id` as a string, and make the routes `async def`. Envelopes, errors, auth, seed and fixtures stay the same.


### Seed & Reset


```python
# app/seed.py — run with: python -m app.seed [--reset]
import argparse
import json
from pathlib import Path

from sqlmodel import Session, select

from app.core.db import engine, init_db, reset_db
from app.modules.items.models import Item, ItemStatus
from app.modules.users.models import User

SEED_FILE = Path(__file__).resolve().parents[1] / "seed_data" / "demo.json"


def seed(session: Session) -> None:
    data = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    users: dict[str, User] = {}
    for u in data["users"]:
        user = User(email=u["email"].lower(), name=u["name"], is_admin=u.get("is_admin", False))
        session.add(user)
        users[user.email] = user
    session.commit()
    for it in data["items"]:
        owner = users[it["owner"].lower()]
        session.add(
            Item(
                owner_id=owner.id,
                title=it["title"],
                description=it.get("description"),
                status=ItemStatus(it.get("status", "todo")),
            )
        )
    session.commit()


def seed_if_empty() -> None:
    with Session(engine) as session:
        if session.exec(select(User)).first() is None:
            seed(session)


def reset_and_seed() -> None:
    reset_db()
    with Session(engine) as session:
        seed(session)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create tables and load demo data")
    parser.add_argument("--reset", action="store_true", help="drop all tables first")
    args = parser.parse_args()
    if args.reset:
        reset_and_seed()
    else:
        init_db()
        seed_if_empty()
    print("✅ Demo data ready")
```


```jsonc
// seed_data/demo.json — one coherent story, realistic but 100% fictional
{
  "users": [
    { "email": "demo@example.com",  "name": "<Persona name>", "is_admin": true },
    { "email": "judge@example.com", "name": "Judge",          "is_admin": false }
  ],
  "items": [
    { "owner": "demo@example.com",  "title": "<realistic record 1>", "description": "<detail>", "status": "in_progress" },
    { "owner": "demo@example.com",  "title": "<realistic record 2>", "description": "<detail>", "status": "todo" },
    { "owner": "judge@example.com", "title": "<record a judge can play with>", "status": "todo" }
  ]
}
```


```jsonc
// seed_data/signature_fixtures.json — keyed by item id; "default" covers new items created live
{
  "default": { "summary": "<what the feature concludes>", "score": 0.82, "details": { "reason": "<why>" } },
  "1":       { "summary": "<the impressive result for seeded item 1>", "score": 0.91, "details": {} }
}
```


Seeding happens in a fixed order, so user ids are stable across resets and existing tokens keep working after a reset.


```python
# app/modules/demo/router.py
from fastapi import APIRouter, BackgroundTasks

from app.core.deps import AdminUser
from app.core.schemas import Envelope
from app.realtime import broadcast
from app.seed import reset_and_seed

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/reset", response_model=Envelope[dict[str, str]])
def reset_demo(_: AdminUser, bg: BackgroundTasks):
    reset_and_seed()
    bg.add_task(broadcast, "demo:reset", {})
    return Envelope(data={"status": "reset"})
```


### Real-time & Background Jobs (optional)


```python
# app/realtime.py
import logging
from typing import Any

import jwt
import socketio
from socketio.exceptions import ConnectionRefusedError as SocketRefused

from app.core.config import settings
from app.core.security import decode_user_id

logger = logging.getLogger(__name__)

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=settings.cors_origins)


@sio.event
async def connect(sid: str, environ: dict[str, Any], auth: dict[str, Any] | None = None) -> None:
    """JWT check before the client receives any event (same rule as the original)."""
    if settings.AUTH_DISABLED:
        return
    try:
        decode_user_id(str((auth or {}).get("token")))
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise SocketRefused("unauthorized") from None
    logger.info("socket connected: %s", sid)


async def broadcast(event: str, data: dict[str, Any]) -> None:
    """Send to every connected client. With 5–6 users there is no need for rooms."""
    if settings.ENABLE_REALTIME:
        await sio.emit(event, data)
```


```python
# app/jobs.py
import asyncio
import logging
from typing import Any

from app.realtime import broadcast

logger = logging.getLogger(__name__)
TICK_SECONDS = 60


def find_due_work() -> list[dict[str, Any]]:
    """Replace with your domain rule, e.g. reminders whose remind_at <= now. Runs in a worker thread."""
    return []


async def job_loop() -> None:
    while True:
        await asyncio.sleep(TICK_SECONDS)
        try:
            for event in await asyncio.to_thread(find_due_work):
                await broadcast("job:due", event)
        except Exception:
            logger.exception("Background job failed; retrying next tick")
```


---


## 5. API Documentation Standard


This section is the **API contract** between backend and frontend. Agree on it before writing code; change it here first, then in code. FastAPI's `/docs` is the live version.


### Conventions


- Base path `/api/v1`; JSON only; **snake_case** keys; integer ids.
- Every route declares `response_model=Envelope[...]` or `Page[...]`, so `/docs` is accurate automatically.
- Lists accept `?page=1&limit=20` (max 100), `?q=` (case-insensitive title search) and resource filters such as `?status=`.
- Every error uses the shape in §4.


### Endpoint catalog (MVP)


| Method | Path | Auth | Tier | Purpose |
| ------ | ---- | ---- | ---- | ------- |
| GET | `/health` | No | Must | Liveness |
| POST | `/api/v1/auth/login` | No | Must | Demo login → JWT + user |
| GET | `/api/v1/users/me` | Yes | Must | Current user |
| GET | `/api/v1/items` | Yes | Must | List own items (`page`, `limit`, `q`, `status`) |
| POST | `/api/v1/items` | Yes | Must | Create item |
| GET | `/api/v1/items/{item_id}` | Yes | Must | Get one (404 if not yours) |
| PATCH | `/api/v1/items/{item_id}` | Yes | Must | Partial update |
| DELETE | `/api/v1/items/{item_id}` | Yes | Must | Delete |
| POST | `/api/v1/items/{item_id}/analyze` | Yes | Must | Signature feature (rename `analyze` to your action) |
| POST | `/api/v1/demo/reset` | Admin | Must | Drop + reseed demo data |
| POST | `/api/v1/auth/register` | No | Nice (N6) | Self sign-up |
| WS | `/socket.io` (events `item:changed`, `demo:reset`, `job:due`) | Token in `auth` | Nice (N1/N2) | Live updates |


### Reference implementation: auth, users and items routers


```python
# app/modules/auth/schemas.py
from typing import Literal

from pydantic import BaseModel, Field

from app.modules.users.schemas import UserRead


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class LoginOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserRead
```


```python
# app/modules/auth/router.py
from fastapi import APIRouter
from sqlmodel import select

from app.core.deps import SessionDep
from app.core.errors import AppError
from app.core.schemas import Envelope
from app.core.security import check_demo_password, create_access_token
from app.modules.auth.schemas import LoginIn, LoginOut
from app.modules.users.models import User
from app.modules.users.schemas import UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Envelope[LoginOut])
def login(body: LoginIn, session: SessionDep):
    user = session.exec(select(User).where(User.email == body.email.strip().lower())).first()
    password_ok = check_demo_password(body.password)  # checked even for unknown emails
    if user is None or user.id is None or not password_ok:
        raise AppError(401, "UNAUTHORIZED", "Invalid email or password")  # one generic message
    return Envelope(
        data=LoginOut(access_token=create_access_token(user.id), user=UserRead.model_validate(user))
    )
```


```python
# app/modules/users/router.py
from fastapi import APIRouter

from app.core.deps import CurrentUser
from app.core.schemas import Envelope
from app.modules.users.schemas import UserRead

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=Envelope[UserRead])
def read_me(user: CurrentUser):
    return Envelope(data=UserRead.model_validate(user))
```


```python
# app/modules/items/router.py
import math

from fastapi import APIRouter, BackgroundTasks, Query
from sqlalchemy import func
from sqlmodel import col, select

from app.core.deps import CurrentUser, SessionDep
from app.core.errors import AppError
from app.core.schemas import Envelope, Page, Pagination
from app.modules.items.models import Item, ItemStatus
from app.modules.items.schemas import ItemCreate, ItemRead, ItemUpdate, SignatureResult
from app.modules.items.service import run_signature_feature
from app.realtime import broadcast
from app.utils.ownership import get_owned_or_404
from app.utils.time import utcnow

router = APIRouter(prefix="/items", tags=["items"])


@router.get("", response_model=Page[ItemRead])
def list_items(
    session: SessionDep,
    user: CurrentUser,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    q: str | None = Query(None, max_length=100),
    status: ItemStatus | None = None,
):
    stmt = select(Item).where(Item.owner_id == user.id)
    if q:
        stmt = stmt.where(col(Item.title).ilike(f"%{q}%"))
    if status:
        stmt = stmt.where(Item.status == status)
    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    rows = session.exec(
        stmt.order_by(col(Item.created_at).desc()).offset((page - 1) * limit).limit(limit)
    ).all()
    return Page(
        data=[ItemRead.model_validate(r) for r in rows],
        pagination=Pagination(total=total, page=page, limit=limit, total_pages=math.ceil(total / limit)),
    )


@router.post("", response_model=Envelope[ItemRead], status_code=201)
def create_item(body: ItemCreate, session: SessionDep, user: CurrentUser, bg: BackgroundTasks):
    item = Item.model_validate(body, update={"owner_id": user.id})
    session.add(item)
    session.commit()
    session.refresh(item)
    bg.add_task(broadcast, "item:changed", {"id": item.id, "action": "created"})
    return Envelope(data=ItemRead.model_validate(item))


@router.get("/{item_id}", response_model=Envelope[ItemRead])
def get_item(item_id: int, session: SessionDep, user: CurrentUser):
    item = get_owned_or_404(session, Item, item_id, user.id)
    return Envelope(data=ItemRead.model_validate(item))


@router.patch("/{item_id}", response_model=Envelope[ItemRead])
def update_item(item_id: int, body: ItemUpdate, session: SessionDep, user: CurrentUser, bg: BackgroundTasks):
    item = get_owned_or_404(session, Item, item_id, user.id)
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise AppError(400, "INVALID_REQUEST", "Nothing to update")
    item.sqlmodel_update(changes)
    item.updated_at = utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)
    bg.add_task(broadcast, "item:changed", {"id": item.id, "action": "updated"})
    return Envelope(data=ItemRead.model_validate(item))


@router.delete("/{item_id}", response_model=Envelope[dict[str, int]])
def delete_item(item_id: int, session: SessionDep, user: CurrentUser, bg: BackgroundTasks):
    item = get_owned_or_404(session, Item, item_id, user.id)
    session.delete(item)
    session.commit()
    bg.add_task(broadcast, "item:changed", {"id": item_id, "action": "deleted"})
    return Envelope(data={"id": item_id})


@router.post("/{item_id}/analyze", response_model=Envelope[SignatureResult])
def analyze_item(item_id: int, session: SessionDep, user: CurrentUser):
    item = get_owned_or_404(session, Item, item_id, user.id)
    return Envelope(data=run_signature_feature(item))
```


```python
# app/modules/items/service.py
import json
import logging
from pathlib import Path

import httpx

from app.core.config import settings
from app.modules.items.models import Item
from app.modules.items.schemas import SignatureResult

logger = logging.getLogger(__name__)
FIXTURES = Path(__file__).resolve().parents[3] / "seed_data" / "signature_fixtures.json"


def run_signature_feature(item: Item) -> SignatureResult:
    """The 'wow' feature. Never lets a provider failure reach the stage."""
    if settings.USE_MOCKS or not settings.SIGNATURE_API_KEY:
        return _fixture(item)
    try:
        return _call_provider(item)
    except Exception:  # timeout, quota, bad JSON, no Wi-Fi
        logger.warning("Signature provider failed; serving fixture", exc_info=True)
        return _fixture(item)


def _call_provider(item: Item) -> SignatureResult:
    # Replace with your API call — or call a local model loaded once at startup (e.g. joblib.load).
    response = httpx.post(
        "<PROVIDER_URL>",
        headers={"Authorization": f"Bearer {settings.SIGNATURE_API_KEY}"},
        json={"input": f"{item.title}\n\n{item.description or ''}"},
        timeout=8.0,
    )
    response.raise_for_status()
    payload = response.json()
    return SignatureResult(
        item_id=item.id, source="live", summary=payload["summary"], score=payload.get("score")
    )


def _fixture(item: Item) -> SignatureResult:
    try:
        data = json.loads(FIXTURES.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    canned = data.get(str(item.id)) or data.get("default") or {"summary": "Sample result", "score": 0.8}
    return SignatureResult(item_id=item.id, source="fixture", **canned)
```


### Template (copy for each endpoint)


~~~markdown
### METHOD /api/v1/<resource>/<action>


**Description:** One sentence describing what this does.
**Auth required:** Yes (Bearer JWT) / No
**Minimum role:** owner / admin / public
**MVP tier:** Must / Nice


#### FastAPI route
```python
@router.post("/<action>", response_model=Envelope[<Resource>Read], status_code=201)
def <action>_<resource>(body: <Resource>Create, session: SessionDep, user: CurrentUser): ...
```


#### Request


Headers:
  Authorization: Bearer <access_token>   (if auth required)
  Content-Type: application/json


Path params:
  {id} — integer id of the resource


Query params:
  ?page=1&limit=20    — pagination
  ?q=text             — case-insensitive search
  ?status=value       — filtering


Body (Pydantic):
```python
class <Resource>Create(SQLModel):
    field: str = Field(min_length=1, max_length=120)   # Required. Description.
    optional_field: str | None = None                 # Optional. Default: null. Description.
```


#### Response — 200 OK (GET, PATCH, DELETE)
```json
{ "success": true, "data": { "id": 1, "...": "..." } }
```


#### Response — 201 Created (POST — new resource created)
```json
{ "success": true, "data": { "id": 7, "owner_id": 1, "...": "...", "created_at": "2026-01-01T10:00:00" } }
```


#### Response — 400 Validation Error
```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Validation failed", "fields": { "field": ["Error message"] } } }
```


#### Response — 401 Unauthorized
```json
{ "success": false, "error": { "code": "TOKEN_EXPIRED", "message": "Session expired — log in again" } }
```


#### Response — 403 Forbidden (admin-only routes)
```json
{ "success": false, "error": { "code": "FORBIDDEN", "message": "Admin only" } }
```


#### Response — 404 Not Found
```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Resource not found" } }
```


#### curl / Postman example
```bash
curl -X POST "http://localhost:8000/api/v1/<resource>" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"field": "example value"}'
```
Postman tests: `pm.test("Status 201", () => pm.response.to.have.status(201));`
               `pm.environment.set("resourceId", pm.response.json().data.id);`


#### Use cases
- Use case 1: When <persona> does X, the frontend calls this.
- Demo moment: which step in §10A uses this endpoint.


#### Business rules
- Rule 1: Field X must be unique per user (409 CONFLICT).
- Rule 2: Only the owner can read or change it (404 otherwise).
~~~


### Example: `POST /api/v1/items`


**Description:** Creates an item owned by the caller.
**Auth required:** Yes · **Minimum role:** owner · **MVP tier:** Must

**Body:** `{ "title": "Follow up with supplier", "description": "Ask about delivery dates", "status": "todo" }`. `title` is required (1–120 chars), `description` is optional (≤ 2000 chars), and `status` is optional (`todo` | `in_progress` | `done`, default `todo`).

**201:** `{ "success": true, "data": { "id": 7, "owner_id": 1, "title": "Follow up with supplier", "description": "Ask about delivery dates", "status": "todo", "created_at": "...", "updated_at": "..." } }`

**Errors:** 400 `VALIDATION_ERROR` (empty title) · 401 `UNAUTHORIZED` / `TOKEN_EXPIRED` / `TOKEN_INVALID`

**Side effect:** broadcasts `item:changed` `{ id, action: "created" }` when real-time is on.

**Demo moment:** §10A step 4.


### Error Codes Master Reference


| HTTP | Code | When to use |
|------|------|-------------|
| 400 | `VALIDATION_ERROR` | Pydantic validation failed on body/query/path |
| 400 | `INVALID_REQUEST` | Logically invalid request (empty PATCH, end before start) |
| 401 | `UNAUTHORIZED` | No token, or wrong email/password at login |
| 401 | `TOKEN_EXPIRED` | JWT past its 12 h expiry; the frontend sends the user to login |
| 401 | `TOKEN_INVALID` | Token tampered, wrong secret, or user deleted by a reset |
| 403 | `FORBIDDEN` | Logged in but not an admin (only `/demo/reset` in the MVP) |
| 404 | `NOT_FOUND` | Resource missing or belongs to another user |
| 409 | `CONFLICT` | Unique field already exists (DB integrity error) |
| 500 | `INTERNAL_ERROR` | Unhandled error; read the Uvicorn terminal |


Removed with their features: `REFRESH_TOKEN_INVALID`, `CANNOT_SELF_DEMOTE`, `CONFIRM_TEXT_MISMATCH`, `RATE_LIMIT_EXCEEDED`.


---


## 6. Backend Security Checklist


Hackathon-grade: protect the demo, the team's keys and the judges' trust. Run through this before the first deploy and again at feature freeze.


### Environment & Configuration


- All secrets in `.env`; zero secrets hardcoded in source, seed files or fixtures
- `.env` and all `.env.*` in `.gitignore` (verified with `git status`)
- Settings validated with pydantic-settings at startup; the app exits on bad config
- `JWT_SECRET` is 32+ random bytes from `secrets.token_hex(32)`, not a word
- `DEMO_PASSWORD` is unique to this project and is not anyone's real password
- Third-party API keys (`SIGNATURE_API_KEY`) live only in backend env, never in `VITE_*`
- If MongoDB Atlas: a dedicated DB user (not the project owner), and the cluster is deleted or paused after the event


### Authentication


- Only seeded accounts exist; no public sign-up unless N6 is built
- Demo password checked with `hmac.compare_digest`, and the same generic error for unknown email or wrong password
- JWT signed HS256 with a 12 h expiry, sent in the `Authorization` header only, never in a URL
- `AUTH_DISABLED=true` used only as an emergency fallback, and only with synthetic data
- Socket.io connections check the JWT before receiving events


### API Security


- `CORSMiddleware` with the exact frontend origins; never `*`
- Pydantic validation on every body, query and path param, with `max_length` on every string field
- All queries through SQLModel/SQLAlchemy; no f-string or concatenated SQL anywhere
- `get_owned_or_404()` in every handler that loads by id; list queries filter by `owner_id`
- Uploads (if any): type allowlist, size cap, random server-side filenames, stored outside the code folder
- `/demo/reset` requires an admin account


### Data & Privacy


- Seed data is 100% synthetic: no real names, emails, phone numbers, health or financial data
- Nothing sent to a third-party API contains real personal data
- Logs never contain passwords, tokens or API keys


### Infrastructure


- `GET /health` responds without auth
- `--reload` only on laptops, not on the hosted backend
- `pip-audit` and `npm audit` run once before deploy; high/critical issues fixed if a patch or minor bump exists
- HTTPS comes from the host for any public link; don't serve a public demo over plain HTTP
- API versioning prefix `/api/v1` in place


### Deliberately skipped (see §12A)


Security headers (helmet), rate limiting, account lockout, refresh-token rotation and reuse detection, AES-256-GCM encryption of stored third-party tokens, soft delete, TTL indexes, GDPR export, Sentry. Each is reasonable for 5–6 known users and synthetic data, and each must come back before real users touch the product.


---


## 7. Frontend Architecture


The frontend stack is unchanged from the original. Only the auth flow is simpler, because the backend no longer issues refresh tokens.


### Axios Client Setup


```typescript
// src/lib/api/types.ts — mirrors the backend Pydantic schemas exactly (snake_case on purpose)
export type Envelope<T> = { success: true; data: T };
export type Pagination = { total: number; page: number; limit: number; total_pages: number };
export type Page<T> = { success: true; data: T[]; pagination: Pagination };
export type ApiErrorBody = {
  success: false;
  error: { code: string; message: string; fields?: Record<string, string[]> };
};

export type User = { id: number; email: string; name: string; is_admin: boolean };
export type LoginResult = { access_token: string; token_type: 'bearer'; user: User };

export type ItemStatus = 'todo' | 'in_progress' | 'done';
export type Item = {
  id: number;
  owner_id: number;
  title: string;
  description: string | null;
  status: ItemStatus;
  created_at: string;
  updated_at: string;
};
export type ItemInput = { title: string; description?: string | null; status?: ItemStatus };
export type SignatureResult = {
  item_id: number;
  summary: string;
  score: number | null;
  details: Record<string, unknown>;
  source: 'live' | 'fixture';
};

/** SQLite drops the UTC offset; treat offset-less timestamps as UTC. */
export const parseUtc = (s: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`);

/** Human-readable message from any API error. Never render raw error objects. */
export function apiErrorMessage(err: unknown): string {
  const body = (err as { response?: { data?: ApiErrorBody } })?.response?.data;
  return body?.error?.message ?? 'Something went wrong — please try again';
}
```


```typescript
// src/lib/api/client.ts
import axios, { type AxiosError } from 'axios';
import { env } from '../env';
import { tokenStore } from '../../auth/tokenStore';
import type { ApiErrorBody } from './types';

export const client = axios.create({
  baseURL: `${env.VITE_API_BASE_URL}/api/v1`,
  timeout: 15_000, // free-tier cold starts and AI calls can be slow
});

// Attach the access token to every request
client.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// No refresh flow: any 401 (except a failed login) → clear the token and go to /login
client.interceptors.response.use(
  (res) => res,
  (error: AxiosError<ApiErrorBody>) => {
    const isLoginCall = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginCall) {
      tokenStore.clear();
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    return Promise.reject(error);
  },
);
```


```typescript
// src/auth/tokenStore.ts
// Demo trade-off: memory first, sessionStorage as backup so a page reload mid-demo
// doesn't log you out. sessionStorage is per-tab and cleared when the tab closes.
const KEY = 'demo_access_token';
let memory: string | null = null;

export const tokenStore = {
  get: (): string | null => {
    if (memory) return memory;
    try {
      memory = sessionStorage.getItem(KEY);
    } catch {
      memory = null;
    }
    return memory;
  },
  set: (token: string) => {
    memory = token;
    try {
      sessionStorage.setItem(KEY, token);
    } catch {
      /* storage blocked — memory still works */
    }
  },
  clear: () => {
    memory = null;
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};
```


The separate `refreshClient` from the original is **removed**, since there is no refresh endpoint.


### Auth Provider Pattern


```tsx
// src/auth/AuthProvider.tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { client } from '../lib/api/client';
import { env } from '../lib/env';
import type { Envelope, LoginResult, User } from '../lib/api/types';
import { FullPageSpinner } from '../components/FullPageSpinner';
import { tokenStore } from './tokenStore';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Bootstrap: restore the session if a token exists (or auth is disabled for the demo)
  useEffect(() => {
    if (!tokenStore.get() && !env.VITE_AUTH_DISABLED) {
      setLoading(false);
      return;
    }
    client
      .get<Envelope<User>>('/users/me')
      .then((res) => setUser(res.data.data))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await client.post<Envelope<LoginResult>>('/auth/login', { email, password });
    tokenStore.set(data.data.access_token);
    setUser(data.data.user);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);

  return <AuthContext.Provider value={value}>{loading ? <FullPageSpinner /> : children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
```


```tsx
// src/pages/LoginPage.tsx (core logic)
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { env } from '../lib/env';
import { apiErrorMessage } from '../lib/api/types';

const loginSchema = z.object({ email: z.string().min(3), password: z.string().min(1) });
type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: env.VITE_DEMO_MODE
      ? { email: env.VITE_DEMO_EMAIL ?? '', password: env.VITE_DEMO_PASSWORD ?? '' }
      : { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login(values.email, values.password);
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';
      navigate(from, { replace: true });
    } catch (err) {
      form.setError('root', { message: apiErrorMessage(err) });
    }
  });

  // Render: email + password inputs, form.formState.errors.root?.message, submit button
  // with form.formState.isSubmitting, and a "Demo credentials are pre-filled" hint in demo mode.
  return <form onSubmit={onSubmit}>{/* ... */}</form>;
}
```


### Route Protection


```tsx
// src/components/RequireAuth.tsx
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { FullPageSpinner } from './FullPageSpinner';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}
```


### TanStack Query Pattern


```typescript
// src/features/items/api.ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '../../lib/api/client';
import type { Envelope, Item, ItemInput, ItemStatus, Page, SignatureResult } from '../../lib/api/types';

type ListParams = { page?: number; limit?: number; q?: string; status?: ItemStatus };

// Read (list) — returns { data, pagination }
export function useItems(params: ListParams) {
  return useQuery({
    queryKey: ['items', params],
    queryFn: () => client.get<Page<Item>>('/items', { params }).then((r) => r.data),
    placeholderData: keepPreviousData, // no flicker while paging/searching on stage
    staleTime: 30_000,
  });
}

// Read (one)
export function useItem(id: number) {
  return useQuery({
    queryKey: ['items', id],
    queryFn: () => client.get<Envelope<Item>>(`/items/${id}`).then((r) => r.data.data),
  });
}

// Create
export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ItemInput) => client.post<Envelope<Item>>('/items', body).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  });
}

// Update
export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<ItemInput> & { id: number }) =>
      client.patch<Envelope<Item>>(`/items/${id}`, body).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  });
}

// Delete
export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => client.delete(`/items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  });
}

// Signature feature
export function useAnalyzeItem() {
  return useMutation({
    mutationFn: (id: number) =>
      client.post<Envelope<SignatureResult>>(`/items/${id}/analyze`).then((r) => r.data.data),
  });
}
```


### Real-time hook (optional, N1)


```typescript
// src/lib/realtime.ts — call useLiveUpdates() once inside the authenticated layout
import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { env } from './env';
import { tokenStore } from '../auth/tokenStore';

let socket: Socket | null = null;

export function useLiveUpdates() {
  const qc = useQueryClient();
  useEffect(() => {
    if (!env.VITE_ENABLE_REAL_TIME) return;
    socket ??= io(env.VITE_API_BASE_URL, { auth: { token: tokenStore.get() } });
    const refresh = () => qc.invalidateQueries({ queryKey: ['items'] });
    socket.on('item:changed', refresh);
    socket.on('demo:reset', refresh);
    return () => {
      socket?.off('item:changed', refresh);
      socket?.off('demo:reset', refresh);
    };
  }, [qc]);
}
```


---


## 8. Frontend Security Checklist


### Token & Session Security


- Access token in memory + sessionStorage (deliberate demo trade-off, §7); **never** localStorage
- Token cleared on logout and on any 401
- No refresh token and no cookies, so there is no CSRF surface
- No tokens, passwords or API responses with user data logged to the console


### XSS Prevention


- All user content rendered as React text nodes (`{value}`), not raw HTML
- `dangerouslySetInnerHTML` only after `DOMPurify.sanitize()` (e.g. rendering AI-generated markdown)
- URLs from user input or AI output validated before use in `href`/`src`: only `http:` and `https:`
- No `innerHTML` or `document.write()`


```tsx
// Safe rich-text rendering (e.g. AI summary converted to HTML):
import DOMPurify from 'dompurify';

const safeHTML = DOMPurify.sanitize(htmlFromModel, {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
});
<div dangerouslySetInnerHTML={{ __html: safeHTML }} />
```


### CSRF Protection


- The JWT travels in the `Authorization` header, not a cookie, which prevents CSRF by default
- No state-changing logic triggered by GET requests


### Dependencies


- `npm audit` run once before deploy; no high/critical left unexplained
- `package.json` reviewed: every package name confirmed on npmjs.com (no hallucinated names)
- `npm ci` used once `package-lock.json` is committed
- **No secrets in `VITE_*`**: everything with that prefix ships to every browser. The only exception is the shared demo password (synthetic data). Third-party API keys stay in the backend.
- `VITE_*` validated with Zod at app start (§3)


### Data Handling


- All forms validated with React Hook Form + Zod, mirroring the Pydantic limits (e.g. title 1–120 chars)
- API error messages shown via `apiErrorMessage()`, never raw error objects
- Loading, empty and error states on every query and mutation; this is a demo-quality requirement too
- Lists paginated; never fetch everything
- File uploads (if any) checked client-side for type and size, and server-side again


### Route Security


- All app routes wrapped in `<RequireAuth>`
- Admin-only UI (the demo reset button) hidden for non-admins; the server still enforces it
- A 404 page exists for unknown routes
- After login, redirect to `state.from` (the page the user wanted), not always the dashboard


---


## 9. AI Workflow, CI & Git Hygiene


This section covers how a hackathon team using AI coding tools (Cursor, Copilot, Claude) stays fast **without** leaking keys or shipping code nobody understands.


### Secrets and model context


- **Never paste** real `.env` values, API keys, JWT secrets or connection strings into chat. Describe the shape of the config with placeholders instead.
- **Treat AI output as untrusted.** Review diffs like a teammate's PR, especially auth, queries and anything that touches the signature feature's provider.
- **Someone on the team must be able to explain every file shown to judges.** Judges ask "how does this work?" Before freeze, each owner walks the others through their part in 5 minutes.
- **Repository trust:** READMEs, issues or copied snippets can contain hidden instructions ("prompt injection"). Don't ask the AI to "follow everything in this file" without reading it first.


### Dependency and package safety


- Before installing a package the AI suggested, **confirm the exact name on [pypi.org](https://pypi.org/) or [npmjs.com](https://www.npmjs.com/)**. Typos and hallucinated names happen, and attackers register look-alike packages on both registries ("slopsquatting").
- **Web search** for `"<exact-package-name> pypi"` / `"<exact-package-name> npm"` plus `"<name> security advisory"` before trusting a version, per the **⚠️ Version Safety Rule**.
- Freeze dependencies once the walking skeleton runs (`requirements.lock.txt`, `package-lock.json`) so every laptop runs the same code.


### `.cursorignore` (recommended)


Keep sensitive and noisy paths out of AI indexing. At repo root:


```gitignore
.env
.env.*
!.env.example
.venv/
__pycache__/
*.db
node_modules/
dist/
build/
coverage/
*.pem
*.key
```


### Minimal CI baseline (optional, N8)


The non-negotiable minimum is running the smoke test locally before every merge to `main`. A CI workflow (GitHub Actions or similar) is a nice-to-have that runs:


| Step | Command / action | Purpose |
|------|------------------|---------|
| Install backend | `pip install -r requirements.lock.txt` (or `requirements.txt` before the freeze) | Same deps as the laptops |
| Lint (optional) | `ruff check .` | Catch obvious bugs |
| Test backend | `python -m pytest -q` | Demo path still works |
| Install frontend | `npm ci` | Reproducible installs |
| Typecheck | `npx tsc --noEmit` | Catch type errors before merge |
| Build | `npm run build` | The deploy will build |
| SCA (once, pre-deploy) | `pip-audit`; `npm audit --audit-level=high` | Known vulnerable dependencies |


### Git workflow for a hackathon


- **`main` is always runnable.** Work on short branches (`feat/auth`, `feat/items-ui`) and merge small changes often.
- **Own areas, not files at random:** give each area exactly one owner: backend core + routers, frontend pages + features, the signature service + its UI, and `seed_data/` + `docs/` + README. One person may own several areas; no area should have two owners. This prevents most merge conflicts.
- Pull before you push; resolve conflicts immediately, not right before the demo.
- **Commit seed data and fixtures**: they are part of the product.
- At feature freeze (a point agreed in advance, after which only bug fixes go in): `git tag demo-ready && git push --tags`. The demo laptop runs from that tag. After it, only fix commits, each followed by the smoke test.


### What this document does *not* replace


- A real security review, MFA/passkeys, penetration testing or DAST before real users.
- Privacy and legal review (data processing agreements, retention, consent) before any real personal data.
- Accessibility and usability testing with real users.


---


## 10. Postman & Testing Guide


### Collection Setup


**Swagger first, Postman optional.**


1. Open `http://localhost:8000/docs`. Call `POST /api/v1/auth/login` with the demo credentials, copy `access_token`, click **Authorize** and paste it. Every endpoint is now testable in the browser.
2. **Postman (optional):** Import → link → `http://localhost:8000/openapi.json`, which generates the collection from the live schema. Create an environment with `baseUrl` = `http://localhost:8000`, `demoEmail`, `demoPassword` and an empty `accessToken`. Set collection auth to **Bearer Token** = `{{accessToken}}`.
3. If you export the collection to `backend/postman/`, commit it **without** real secrets.


### Run Order (adapt for your domain)


```
Step 1: GET    /health                         → {"status": "ok"}
Step 2: POST   /api/v1/auth/login              → returns access_token
Step 3: GET    /api/v1/users/me                → verifies auth works
Step 4: POST   /api/v1/items                   → create your main resource
Step 5: GET    /api/v1/items?q=<text>          → list + search
Step 6: PATCH  /api/v1/items/{id}              → update
Step 7: POST   /api/v1/items/{id}/analyze      → signature feature (check "source")
Step 8: DELETE /api/v1/items/{id}              → delete
Step 9: GET    /api/v1/items/{id}              → 404 NOT_FOUND after delete
Step 10: POST  /api/v1/demo/reset (as admin)   → back to the exact demo state
```


### Pre-Request Script Template


With a 12 h token and no refresh flow, the only job is logging in automatically when the token is empty:


```javascript
// Collection-level pre-request script
if (!pm.environment.get('accessToken')) {
  pm.sendRequest(
    {
      url: pm.environment.get('baseUrl') + '/api/v1/auth/login',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      body: {
        mode: 'raw',
        raw: JSON.stringify({
          email: pm.environment.get('demoEmail'),
          password: pm.environment.get('demoPassword'),
        }),
      },
    },
    (err, res) => {
      if (!err && res.code === 200) pm.environment.set('accessToken', res.json().data.access_token);
    },
  );
}
```


### Test Script Template


```javascript
// Add to each request's Tests tab:

// 1. Assert status
pm.test('Status is 2xx', () => pm.expect(pm.response.code).to.be.within(200, 299));

// 2. Assert response shape
pm.test('Envelope has success: true', () => {
  const json = pm.response.json();
  pm.expect(json.success).to.be.true;
  pm.expect(json.data).to.exist;
});

// 3. Save ids for later requests
const json = pm.response.json();
if (json.data?.id) pm.environment.set('resourceId', json.data.id);

// 4. Save the token after login
if (json.data?.access_token) pm.environment.set('accessToken', json.data.access_token);
```


### Automated smoke test (pytest)


One test that walks the demo path. Run `python -m pytest -q` from `backend/` before every merge to `main`.


```python
# tests/conftest.py — runs before the app is imported
import os
from pathlib import Path

os.environ.update(
    DATABASE_URL="sqlite:///./test.db",
    JWT_SECRET="t" * 64,
    DEMO_PASSWORD="test-demo-pass",
    AUTH_DISABLED="false",
    ENABLE_REALTIME="false",
    ENABLE_SCHEDULER="false",
    USE_MOCKS="true",
    SEED_ON_STARTUP="true",
)
Path("test.db").unlink(missing_ok=True)
```


```python
# tests/test_smoke.py
from fastapi.testclient import TestClient

from app.main import api


def test_demo_path() -> None:
    with TestClient(api) as client:  # runs lifespan → tables + seed
        assert client.get("/health").json() == {"status": "ok"}

        bad = client.post("/api/v1/auth/login", json={"email": "demo@example.com", "password": "wrong"})
        assert bad.status_code == 401

        login = client.post(
            "/api/v1/auth/login", json={"email": "demo@example.com", "password": "test-demo-pass"}
        )
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['data']['access_token']}"}

        created = client.post("/api/v1/items", json={"title": "Smoke test"}, headers=headers)
        assert created.status_code == 201
        item_id = created.json()["data"]["id"]

        listed = client.get("/api/v1/items", params={"q": "smoke"}, headers=headers).json()
        assert any(i["id"] == item_id for i in listed["data"])

        analyzed = client.post(f"/api/v1/items/{item_id}/analyze", headers=headers).json()
        assert analyzed["data"]["source"] == "fixture"

        invalid = client.post("/api/v1/items", json={"title": ""}, headers=headers)
        assert invalid.status_code == 400
        assert invalid.json()["error"]["code"] == "VALIDATION_ERROR"

        assert client.get("/api/v1/items/999999", headers=headers).json()["error"]["code"] == "NOT_FOUND"
        assert client.get("/api/v1/items").status_code == 401
```


### Testing All Response Scenarios


For every Must-have endpoint, test at minimum:




| Test                   | How to trigger                              |
| ---------------------- | ------------------------------------------- |
| Happy path (200/201)   | Valid request                               |
| Validation error (400) | Missing or empty required field             |
| Unauthorized (401)     | Remove the Authorization header             |
| Token invalid (401)    | Change one character of the token           |
| Forbidden (403)        | Call `/demo/reset` as `judge@example.com`   |
| Not found (404)        | Use a non-existent id, or another user's id |
| Conflict (409)         | Create a duplicate unique value (only if you have unique fields) |
| Provider down          | Set `SIGNATURE_API_KEY` to garbage → result still returns with `source: "fixture"` |
| Frontend states        | Stop the backend → every page shows an error state, not a blank screen |




---


## 10A. Demo Script


**Format:** 3–5 minutes. Two roles: **Driver** (clicks) and **Narrator** (talks). Give them to different presenters when you can; a solo presenter does both. Every line in the right-hand columns has been rehearsed.


| # | Time | On screen (Driver) | Narrator says (adapt) | If it breaks |
| - | ---- | ------------------ | --------------------- | ------------ |
| 1 | 0:00–0:30 | Title slide → problem slide | "`<WHO>` loses `<X>` every `<period>` because `<CAUSE>`." One concrete number or story. | — |
| 2 | 0:30–0:50 | Switch to the app; login is pre-filled → **Log in** | "Meet `<PERSONA>`. Here's their day." | `AUTH_DISABLED` is already tested → reload lands on the dashboard |
| 3 | 0:50–1:20 | Dashboard with seeded data | Point at the one number that matters | Screenshot slide of the dashboard |
| 4 | 1:20–2:00 | Create a new `<RESOURCE_1>` using a value pasted from a prepared text file; it appears at the top; type in search to find it | "Capturing one takes ten seconds." | Use a seeded record instead |
| 5 | 2:00–3:00 | Run `<SIGNATURE_FEATURE>` on it → result appears | The "wow" sentence: what the result means for the persona | Switch to a seeded item with a known fixture; if the backend is down, play the backup video from 2:00 |
| 6 | 3:00–3:25 | *(If N1 built)* Second window, same account: change in window A appears in window B | "Everyone working on it sees updates instantly." | Skip this step silently |
| 7 | 3:25–3:45 | Architecture slide (diagram from §4) + 3-second flash of `/docs` | "React frontend, FastAPI backend, every endpoint documented and typed." | Slide only |
| 8 | 3:45–4:15 | Impact + "what's next" slide (two items from §12A) | Tie each point to a judging criterion | — |
| 9 | 4:15–4:30 | Closing slide: team names, repo / live link, QR code | "Thank you, happy to take questions." | — |


**Rubric mapping:** next to each step, write which judging criterion it proves (e.g. step 5 → Innovation, step 7 → Technical complexity). Any criterion without a step needs one.


### Pre-demo checklist (right before you present)


- `python -m app.seed --reset` (or **Reset demo** as admin) for the exact demo state
- Backend and frontend running; `/health` green; if deployed, open the public URL to wake it
- Run the signature feature once on the item you'll use (warms the model/provider)
- Decide `USE_MOCKS`: if the venue network is unreliable, set it to `true` and restart the backend
- Browser: fresh window, zoom 125–150%, bookmarks bar hidden, extensions off, OS notifications off (Do Not Disturb)
- Tabs in order: slides → app → second window (if N1) → `/docs`
- Text file with the values to paste in step 4
- Backup video open and paused on the desktop
- Phone hotspot ready; charger plugged in; display adapter tested on the actual projector if possible
- Backup laptop: repo at the `demo-ready` tag, seeded, running


### If something breaks on stage


The Narrator keeps talking ("let me show you the recorded run") while the Driver switches to the backup video at the matching timestamp within 10 seconds. **Never debug on stage.**


### Likely judge questions (prepare one-sentence answers)


- Is the data real? *(No, fully synthetic; see A8.)*
- What happens at 10,000 users? *(Point to §12A: Postgres, real auth, caching.)*
- What was the hardest part technically?
- What would you build next week?
- How does the signature feature work, and what happens when it's wrong?


---


## 10B. Risks & Fallbacks


| Risk | Likelihood | Early warning | Fallback |
| ---- | ---------- | ------------- | -------- |
| Venue Wi-Fi down or blocked | High | Slow `npm install`, failing API calls | Run everything on localhost; `USE_MOCKS=true`; phone hotspot for anything external |
| Signature provider slow, rate-limited or down | High | Calls take more than 3 s, or 429/5xx in logs | Automatic fixture fallback (`source: "fixture"`); for the demo, pre-set `USE_MOCKS=true` |
| Free-tier backend asleep or cold-starting | High | First request takes 30 s+ | Hit `/health` shortly before the demo; the stage demo runs from the laptop anyway |
| CORS errors after deploying | Medium | Browser console says "blocked by CORS policy" | Put the exact frontend origin (scheme + host, no trailing slash) in `CORS_ORIGINS`; restart the backend. Unhandled 500s can also *look* like CORS errors, so check the backend terminal first. |
| Auth/JWT bug blocks login | Medium | 401 loop after login | Set `AUTH_DISABLED=true` (backend) and `VITE_AUTH_DISABLED=true` (frontend); restart both |
| Demo data messed up by testing | High | Odd records on the dashboard | `python -m app.seed --reset` or **Reset demo**; also keep a copy (`app.db.bak`) of a known-good DB |
| `database is locked` (SQLite) | Low | Intermittent 500s on writes | Single Uvicorn worker (the default), 15 s `timeout` already set, keep transactions short |
| Hosted SQLite wiped on restart | Medium | Empty dashboard on the public link | `SEED_ON_STARTUP=true` reseeds automatically |
| Dependency update breaks the build | Medium | Works on one laptop, not another | Install from `requirements.lock.txt` / `npm ci`; never upgrade after the freeze |
| Late merge conflict breaks `main` | Medium | Red smoke test | Freeze features well before the demo; demo from the `demo-ready` tag; revert, don't fix forward |
| Socket.io blocked by venue proxy | Low | No live updates | It's N1, so skip step 6; queries still refetch on window focus |
| Demo laptop dies or projector won't connect | Low | — | Backup laptop already seeded and running; bring adapters; backup video on a USB stick and in the cloud |
| Running out of time | High | Must-haves still open as the demo approaches | Cut from the bottom of §1A "Nice to have"; never cut M3 (signature) or M9 (video) |
| Timestamps show the wrong time | Low | Times off by your UTC offset | Use `parseUtc()` from §7 everywhere dates are displayed |


---


## 11. Master Prompts


### 11.1 Full-Stack Bootstrap Prompt


Copy, fill in the `<PLACEHOLDERS>`, and paste into your AI assistant:


```
Build a hackathon demo app: React + TypeScript frontend, Python FastAPI backend.
Goal: a reliable, impressive 3–5 minute demo for 5–6 users (team + judges) — NOT a production SaaS.

Industry: <YOUR_INDUSTRY>
Primary resources: <RESOURCE_1>, <RESOURCE_2>
Signature feature: <SIGNATURE_FEATURE>
(e.g. "clinic scheduling: appointments, patients; signature = no-show risk score")

── Backend (Python) ──────────────────────────────────────────────────────
- Monorepo: backend/ (FastAPI + SQLModel + SQLite) and frontend/ (Vite + React + TypeScript)
- ALL business logic, validation and DB access live in the backend. The frontend only renders UI and calls the API over HTTP.
- FastAPI only: no Flask, no Node/Express, no Next.js API routes or server actions.
- Before writing requirements.txt or package.json: web search each dependency (latest stable + security advisories), confirm with `pip index versions <pkg>` / `npm show <pkg> version`, list names only in requirements.txt, and tell me what you verified. Use PyJWT (not python-jose), FastAPI lifespan (not @app.on_event), PyMongo Async API (not Motor) if MongoDB.
- Structure: app/main.py (lifespan, CORSMiddleware with explicit origins, error handlers, GET /health, routers under /api/v1, optional socket.io ASGI wrapper), app/core/{config.py (pydantic-settings, exit on bad config), db.py, security.py, deps.py, errors.py, schemas.py}, app/modules/<resource>/{models.py, schemas.py, router.py, service.py}, app/seed.py, app/realtime.py, app/jobs.py, app/utils/{ownership.py, time.py}
- Data: SQLModel table models + separate Create/Update/Read schemas; owner_id on user-owned tables; integer ids; snake_case JSON; max_length on every string
- Auth (demo-grade): users seeded from seed_data/demo.json; one shared DEMO_PASSWORD from env compared with hmac.compare_digest; POST /api/v1/auth/login returns a 12 h HS256 JWT + user; GET /api/v1/users/me; no registration, OAuth or refresh tokens; AUTH_DISABLED=true makes every request act as the first seeded user
- Responses: { success: true, data } / { success: true, data: [], pagination: { total, page, limit, total_pages } } / { success: false, error: { code, message, fields? } } for EVERY error, including Pydantic validation (400 VALIDATION_ERROR), IntegrityError (409 CONFLICT) and unhandled exceptions (500 INTERNAL_ERROR)
- get_owned_or_404() in every handler that loads a record by id: 404, never 403, for another user's record
- List endpoints: ?page&limit (max 100)&q&<filters>
- Signature feature: POST /api/v1/<resource>/{id}/<action>; the service calls the provider with an 8 s timeout and falls back to seed_data/signature_fixtures.json on ANY failure or when USE_MOCKS=true; the response includes source: "live" | "fixture"
- Seed: `python -m app.seed --reset` rebuilds the exact demo state; SEED_ON_STARTUP seeds an empty DB; POST /api/v1/demo/reset (admin only)
- Optional, behind flags: python-socketio AsyncServer wrapping FastAPI (ENABLE_REALTIME) broadcasting "<resource>:changed" via BackgroundTasks; asyncio loop in lifespan for background jobs (ENABLE_SCHEDULER)
- Python logging to stdout; never log passwords, tokens or API keys
- Do NOT add: rate limiting, security-header middleware, refresh tokens, OAuth, encryption, Sentry, Docker, Redis, queues, microservices, migration tooling

── Frontend (stack unchanged) ────────────────────────────────────────────
- Vite + React + TypeScript strict; react-router-dom; TanStack Query; Axios; React Hook Form + Zod; DOMPurify; socket.io-client (if real-time); <YOUR_DOMAIN_UI_LIBRARY>
- src/lib/env.ts validates VITE_* with Zod
- Axios client: baseURL = VITE_API_BASE_URL + /api/v1; Bearer token from tokenStore; on any 401 except login → clear token, go to /login (no refresh flow)
- tokenStore: memory + sessionStorage (demo trade-off), cleared on logout
- AuthProvider: if a token exists (or VITE_AUTH_DISABLED) → GET /users/me; exposes login(email, password) and logout()
- RequireAuth on all app routes; ErrorBoundary at root; 404 page
- Every query and mutation shows loading, empty and error states; error text comes from error.message in the API body
- Login page pre-fills demo credentials when VITE_DEMO_MODE=true
- TypeScript types mirror the Pydantic schemas exactly (snake_case); parseUtc() for timestamps

── Deliverables ──────────────────────────────────────────────────────────
1. backend/.env.example and frontend/.env.example with comments
2. Root .gitignore (.venv, __pycache__, *.db, node_modules, .env*, keys, dist); only .env.example committed
3. .cursorignore mirroring sensitive paths (Section 9)
4. backend/requirements.txt (names only) + README: setup in ≤ 10 commands (venv, install, seed, run both servers, run tests)
5. seed_data/demo.json (realistic, fully synthetic data telling one story) + seed_data/signature_fixtures.json
6. tests/conftest.py + tests/test_smoke.py: health, login (good + bad), CRUD, signature fallback, validation error, 404, 401
7. Endpoint docs per HACKATHON_PRD.md §5; FastAPI /docs must show every route with request/response models
```


### 11.2 Backend-Only Prompt


```
Build a hackathon-grade FastAPI + SQLModel + SQLite backend in Python. 5–6 users, synthetic data, demo-first scope.

Domain: <YOUR_DOMAIN>
Resources: <RESOURCE_1>, <RESOURCE_2>
Signature feature: <SIGNATURE_FEATURE>

Before writing requirements.txt: web search (latest stable + CVE/advisory) for each dependency, confirm with `pip index versions`, list names only, and tell me what you verified. No Flask, no Node.

Requirements:
- pydantic-settings config validated at startup; process exits on bad config
- Seeded demo users + one shared DEMO_PASSWORD (hmac.compare_digest) → 12 h PyJWT access token; GET /users/me; AUTH_DISABLED emergency switch
- CORSMiddleware with explicit origins from CORS_ORIGINS
- SQLModel table models + Create/Update/Read schemas; owner_id scoping; get_owned_or_404 (404 not 403)
- Standard envelopes { success, data } / { success, data, pagination } / { success: false, error: { code, message, fields? } } via exception handlers (validation → 400, IntegrityError → 409, unhandled → 500)
- CRUD + list with ?page&limit&q&filters for each resource
- Signature endpoint with an 8 s timeout and fixture fallback (USE_MOCKS)
- seed.py (`python -m app.seed --reset`), SEED_ON_STARTUP, POST /demo/reset (admin)
- GET /health
- Optional behind flags: python-socketio broadcast on changes; asyncio job loop in lifespan
- pytest smoke test with TestClient covering the demo path and the main error codes

Deliver: .env.example, requirements.txt, README, seed JSON + fixtures, smoke test, endpoint docs per resource
```


### 11.3 Security Hardening Only Prompt


```
Audit this FastAPI hackathon backend before the demo. Fix what's missing at HACKATHON grade —
do NOT add production infrastructure (no rate limiting, Redis, Sentry, OAuth, encryption, Docker).

Check and implement if missing:
1. No secrets in source, seed files, fixtures or git history; .env* ignored; .env.example has placeholders only
2. Config validated by pydantic-settings; JWT_SECRET ≥ 32 random chars; app exits on bad config
3. CORSMiddleware with explicit origins from env — never "*"
4. Pydantic validation on every body/query/path param; max_length on every string field
5. No raw or f-string SQL — SQLModel/SQLAlchemy expressions only
6. get_owned_or_404() on every by-id route; every list query filtered by owner_id
7. Demo password compared with hmac.compare_digest; one generic login error
8. JWT: HS256, exp set, verified on every protected route; never accepted from a query string
9. /demo/reset requires is_admin
10. Every error returns { success: false, error: { code, message, fields? } }; 500s never leak stack traces to the client
11. Signature provider: timeout set, API key only in backend env, fixture fallback on any exception
12. Socket.io connect handler rejects missing/invalid tokens (unless AUTH_DISABLED)
13. Uploads (if any): type allowlist, size cap, random filenames, stored outside the code folder
14. Logs contain no passwords, tokens or API keys
15. Seed data is fully synthetic
16. pip-audit clean of high/critical where a patch or minor upgrade exists
17. .gitignore verified — .env*, .venv, *.db, node_modules, dist, keys never tracked
18. Optional: .cursorignore for AI indexing (Section 9)

List anything you deliberately left out and why.
```


### 11.4 Frontend Security Hardening Prompt


```
Audit and polish this React + TypeScript + Axios frontend for a hackathon demo (backend is FastAPI).

Check and implement if missing:
1. Access token only in tokenStore (memory + sessionStorage) — remove any localStorage use
2. Axios: Bearer header from tokenStore; on 401 (except login) clear token and redirect to /login — no refresh logic
3. No secrets or third-party API keys in VITE_* (only the shared demo password is allowed)
4. VITE_* validated with Zod at app start
5. DOMPurify on every dangerouslySetInnerHTML (including AI-generated content)
6. URL validation before href/src — only http: and https:
7. All forms use React Hook Form + Zod mirroring the backend's Pydantic limits
8. ErrorBoundary at root; 404 route; RequireAuth on all app routes
9. Loading, empty and error states on EVERY query and mutation — no blank screens if the backend is down
10. API errors shown via error.message from the standard error body, never raw objects
11. No console.log of tokens or user data
12. Lists paginated; search debounced
13. Timestamps parsed as UTC (parseUtc)
14. File uploads validated client-side (type + size) before sending
15. npm audit — no unexplained high/critical issues
```


---


## 12. Domain Add-On Prompts


Short add-ons to append to the master prompt (§11.1) for specific industries. Replace the generic UI library with the domain-specific one. Each keeps the interesting idea and drops the infrastructure.


### Scheduling / Calendar


```
Domain UI: FullCalendar React (dayGridMonth + timeGridWeek + timeGridDay + interaction plugin)
Resources: events (types: event / task / out_of_office / appointment), calendars, reminders
Special features (hackathon scope):
- Recurrence: store an RRULE string; the BACKEND expands occurrences for the requested range with python-dateutil's rrule
- Edit modes: "this" and "all" only ("this_and_following" → Future Scope)
- Store all datetimes in UTC; convert with zoneinfo (stdlib) on the backend; send ISO strings to the frontend
- Team availability: GET /api/v1/availability?user_ids=&start=&end= returns merged busy intervals for the 2–3 seeded users
- Slot finder: interval-merge algorithm in service.py → common free windows
- Reminders: asyncio job loop every 60 s finds reminders with trigger_at <= now → socket "reminder:due" → in-app toast (Web Push → Future Scope)
- Seed a realistic week of events across 2–3 demo users
```


### E-Commerce / Marketplace


```
Domain UI: Product grid, cart drawer, checkout page
Resources: products, categories, carts, orders, reviews
Special features (hackathon scope):
- MOCK checkout: POST /api/v1/orders/{id}/checkout marks the order paid with a fake payment reference — no real payment provider (Stripe test mode only if it is the signature feature)
- Order state machine as a Python dict of allowed transitions: pending → confirmed → shipped → delivered → refunded; illegal transitions → 400 INVALID_REQUEST
- Inventory: conditional UPDATE (stock = stock - qty WHERE id = :id AND stock >= :qty) and check rowcount → 409 CONFLICT when sold out
- Prices stored as integer minor units (cents/paise) — never floats; format on the frontend
- Images: files in backend/static served with FastAPI StaticFiles, or image URLs in the seed data — no cloud upload service
```


### Project Management / CRM


```
Domain UI: Kanban board with @dnd-kit/core
Resources: projects, boards, columns, tasks, comments
Special features (hackathon scope):
- Drag-and-drop ordering with a float `position` (midpoint between neighbours; reseeding rebalances)
- @mentions in comments → rows in a notifications table + socket "notification:new" → in-app badge (email → Future Scope)
- Attachments: UploadFile to a local uploads/ folder with type + size checks and random filenames (needs python-multipart)
- Activity log table (who changed what, when), written inside service functions; shown on the project page
- Webhooks for external integrations → Future Scope
```


### Analytics / Dashboard


```
Domain UI: Recharts or Chart.js for charts; react-grid-layout for widgets (optional)
Resources: dashboards, widgets, data_sources (seeded), reports
Special features (hackathon scope):
- Aggregations with SQL GROUP BY (SQLite strftime for day/week buckets) or pandas for anything complex
- Date-range filtering; bucket in UTC, label in the browser
- No caching layer — if a query is slow, precompute it in seed.py
- CSV export endpoint using the csv module + StreamingResponse
- Seed months of realistic synthetic history so charts have shape
- Scheduled email reports → Future Scope (show a "report preview" page instead)
```


### Social / Community


```
Domain UI: Infinite scroll feed, comment threads, notification centre
Resources: posts, comments, likes, follows, notifications
Special features (hackathon scope):
- Cursor pagination (?before_id=) for the feed — works with live inserts
- Notifications written at action time (fan-out on write; fine at demo scale)
- Moderation: report flag + admin review queue page (admin = seeded is_admin user)
- Optional posting cooldown per user (simple last_post_at check) instead of a rate limiter
- Search: SQL LIKE on title/body; SQLite FTS5 only if time allows
- Real-time: socket "post:new" refreshes the feed
```


### AI / ML Feature (common hackathon signature feature)


```
Signature: <WHAT THE MODEL DOES> on <RESOURCE_1>
Special features (hackathon scope):
- Local model (scikit-learn, etc.): train offline, save with joblib, load ONCE in lifespan, call in service.py
- Hosted model/API: call with httpx from the backend only; API key in backend env; 8 s timeout
- Precompute results for every seeded record into signature_fixtures.json → instant, offline-safe demo
- Show a "live" vs "cached" badge from SignatureResult.source — honesty impresses judges
- Render model text as plain text, or as sanitized HTML (DOMPurify)
- Never send real personal data to a third-party model; seed data only
- Prepare one sentence on how the model can be wrong and what the UI does about it
```


---


## 12A. Future Scope


Features from the original blueprint that are **not** in the hackathon build. Nothing was dropped silently.


| Feature (original) | Status | Why not in the hackathon |
| ------------------ | ------ | ------------------------ |
| Google OAuth (Passport) | Deferred | Consent-screen setup and per-host redirect URLs take real setup effort and are a common live-demo failure point |
| Refresh tokens in HttpOnly cookies, rotation, reuse detection | Deferred | Cross-site cookie and CORS-credential setup across two free hosts is fragile; a 12 h token covers a demo session |
| Email/password registration with hashing | Nice-to-have (N6) | Seeded accounts already demo "per-user data" |
| Account lockout, session list/revoke | Deferred | Brute-force protection matters only with real, public accounts |
| Rate limiting (global, auth, public routes) | Deferred | 5–6 known users |
| Security headers / CSP (helmet) | Deferred | Needs per-host CSP tuning; no real users to protect |
| AES-256-GCM encryption of stored third-party tokens | Deferred | The demo stores no third-party user tokens |
| Web Push notifications (VAPID, service worker) | Deferred | HTTPS + service worker + browser permission prompts are unreliable on stage; in-app toasts show the same idea |
| Real email delivery (SMTP / Resend) | Deferred | Domain verification and spam filters; console/outbox page shows intent (N7) |
| Payments (Stripe) | Removed (SaaS) | Monetization is out of scope; e-commerce add-on uses mock checkout |
| Pricing, billing, subscriptions | Removed (SaaS) | No business model in a hackathon |
| GDPR export, account deletion with confirmation text | Removed (SaaS) | Synthetic data only; no data subjects |
| Multi-tenancy, organizations, role hierarchy, self-demotion rules | Removed (SaaS) | One `is_admin` flag is enough for the demo |
| Soft delete + TTL indexes | Deferred | Reset script restores state; hard delete is simpler |
| MongoDB Atlas full-text / Atlas Search, Elasticsearch | Deferred | `ILIKE` search is enough for seeded data |
| Sentry monitoring, Winston structured logs | Deferred | Watching the terminal is faster at this scale |
| Readiness probe (`/ready`), load balancing, horizontal scaling, HA | Removed (SaaS) | One process, one SQLite file |
| Redis caching, queues, microservices | Removed (SaaS) | No load to justify them |
| Postgres + Alembic migrations | Deferred | First step if the project continues; SQLModel makes the move small |
| Full CI/CD with secret scanning, Dependabot/Snyk | Deferred | Optional CI in §9 covers the hackathon |
| Webhooks (PM/CRM add-on) | Deferred | Needs a receiver and retry logic, with no demo payoff |
| "This and following" recurring-event edits (Scheduling) | Deferred | Splitting RRULE series correctly takes longer than the rest of the calendar |
| Scheduled email reports (Analytics) | Deferred | Depends on real email delivery |
| Cloudinary / S3 signed uploads | Deferred | Local `uploads/` or `static/` folder works for the demo |
| MFA / passkeys | Deferred | Out of scope until there are real accounts |


---


## 13. Document Maintenance


During the hackathon this file is the **single source of truth** for scope and the API contract. **Owner:** one named scope keeper (anyone can edit; the owner keeps it consistent).


**When to update this file:**


- **New or changed endpoint** → update the §5 catalog first, then code, then tell the frontend owner.
- **New env var** → add it to both `.env.example` files, `config.py` / `env.ts`, and the §3 listing.
- **Scope change** → move the row within §1A; anything promised and then cut goes to §12A with one line of reason.
- **New risk discovered** → add it to §10B with its fallback before going back to coding.
- **Demo flow change** → update §10A and re-time a full rehearsal.
- **New integration or provider** → add its env vars, its fixture strategy and a §12 add-on if it's domain-specific.


**After feature freeze:** only §10A (demo script) and §10B (risks) may change.


**Security review triggers (hackathon):**


- Any change to `CORS_ORIGINS`
- Turning `AUTH_DISABLED` on anywhere with a public URL
- Adding any real data, or any new third-party API key
- Adding a new unauthenticated endpoint
- Deploying to a new host (re-check HTTPS, CORS and env vars in the dashboard)


**If the project continues after the hackathon:** work through §12A top to bottom. Start with real auth (registration, hashing, refresh tokens or a managed provider), Postgres + Alembic, then restore the full security checklist from the original v2.2 blueprint before any real user signs up.


**AI assistant instruction:**
When using this document as context, follow the **⚠️ Version Safety Rule** at the top: **web search** for each dependency (`"<pkg> pypi latest version"` / `"npm <pkg> latest version"`, `"<pkg> CVE"` / advisory), confirm with **`pip index versions <pkg>`** or **`npm show <pkg> version`** when a shell is available, state what you verified in your answer, and **never** copy version numbers from memory or from this file into `requirements.txt` or `package.json`. Keep all business logic in the FastAPI backend, and keep the scope to §1A unless the team says otherwise.


---


*Industry-agnostic. Fill in §0, pick a domain add-on from §12, and build only what §1A says.*
