# Unicomply

AICTE Integrated Grievance Redressal, Overlap Detection & Compliance Monitoring Portal (SIH 2026, PS 26264).

- `backend/`: FastAPI + SQLModel + SQLite, plus the matching engine. Details in [backend/README.md](backend/README.md).
- `frontend/`: React + Vite + TypeScript. Details in [frontend/README.md](frontend/README.md).
- `contract/`: the shared API fixtures both sides are tested against.

## Setup from a clean clone (about 10 minutes)

### Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| Git | any recent | `git --version` |
| Python | 3.11 or newer | `python3 --version` |
| Node.js | 22.22+ or 24.15+ (an LTS release) | `node --version` |
| npm | 10 or newer (ships with Node) | `npm --version` |

Node 20 and early Node 22 releases are too old: the test tooling (`jsdom`) requires `^22.22.2 || ^24.15.0 || >=26`.

Allow about 1.5 GB of disk for the Python packages (PyTorch is the largest), plus about 0.5 GB if you download the embedding model.

### 1. Clone

```bash
git clone https://github.com/krishnasharma1493/Unicomply.git
cd Unicomply
```

### 2. Backend (terminal 1)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # Windows: copy .env.example .env
python -m app.seed --reset
uvicorn app.main:app --reload --port 8000
```

`backend/.env` works as copied. Two values you may want to change first:

- `EMBEDDINGS_MODE=tfidf` if there is no reliable internet, or on an Intel Mac (see [Embeddings](#embeddings-model-or-tfidf)).
- `DEMO_TODAY=2026-11-20` to freeze "today" so the dates match the demo script (`docs/pitch/demo_script.md`).

Check it is up: [http://localhost:8000/health](http://localhost:8000/health) returns `{"status": "ok", ...}`, and the API docs are at [http://localhost:8000/docs](http://localhost:8000/docs).

### 3. Frontend (terminal 2)

```bash
cd frontend
npm ci
cp .env.example .env             # Windows: copy .env.example .env
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and click a persona card to log in.

### Frontend only, with the mock API

No backend needed: the mock layer serves `contract/fixtures` from memory. Do step 3's `npm ci` and `cp` first, then:

```bash
cd frontend
VITE_USE_MOCKS=true npm run dev
```

## Demo personas

All personas share the password in `DEMO_PASSWORD` (`change-me-demo-pass` in `.env.example`).

| Persona | Email | Role | Scope |
| --- | --- | --- | --- |
| Dr. Meera Raghavan | `senior@aicte.example` | Senior management (`senior_mgmt`, admin) | All bureaus; demo reset |
| Anil Deshmukh | `pgrc.head@aicte.example` | Bureau head (`bureau_head`) | PGRC (bureau 2) |
| Kavita Rao | `rb.head@aicte.example` | Bureau head (`bureau_head`) | RB (bureau 1) |
| Rakesh Tiwari | `ro.nw@aicte.example` | Regional officer (`ro_officer`) | North-Western RO (bureau 9) |
| Neha Joshi | `intake@aicte.example` | Intake operator (`intake_operator`) | Intake desk and match review |

## Demo data

- `python -m app.seed --reset` (in `backend/`, venv active) drops every table and loads the full generated world (`SEED_SET=full`). Add `--tiny` for only the hand-written hero story.
- The senior officer can also reset from the Admin page, or with `POST /api/v1/demo/reset`.
- With `SEED_ON_STARTUP=true` (the default) an empty database is seeded when the server starts.

## Embeddings: model or tfidf

The matching engine compares complaint text with one of two embedders, set by `EMBEDDINGS_MODE` in `backend/.env`:

| Mode | Needs | Notes |
| --- | --- | --- |
| `model` (default) | A one-time download of `paraphrase-multilingual-MiniLM-L12-v2` (about 0.5 GB) | The hero intake shows the red "Potential Overlapping Cases – Coordination Required" banner |
| `tfidf` | Nothing extra; works offline | The hero intake links the same three cases, currently with the amber "Possible" banner (#54) |

To download the model before going offline (venv active):

```bash
python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')"
```

If the model cannot load, the backend logs `Embedding model ... is unavailable ... falling back to EMBEDDINGS_MODE=tfidf` and keeps working in tfidf mode.

**Intel Macs:** the newest PyTorch for Intel macOS is 2.2.x, and current `transformers` releases need PyTorch 2.6 or newer, so model mode always falls back to tfidf there, and the pre-download command above fails with `NameError: name 'nn' is not defined`. At startup the backend also prints a long NumPy 1.x/2.x warning with a traceback; it is harmless. Set `EMBEDDINGS_MODE=tfidf` to skip both, or run the demo on another machine.

The backend builds the matching index while it starts, before it answers requests: a few seconds in tfidf mode, and about 30 s in model mode the first time. It is cached in `backend/seed_data/.cache/`.

## Run the tests

```bash
cd backend && source .venv/bin/activate && pytest     # 1 to 7 minutes, depending on the machine
cd frontend && npm run typecheck && npm test
```

On a slower laptop, frontend tests can hit the 5 s per-test timeout when all files run in parallel. Run them one file at a time instead: `npm test -- --maxWorkers=1`.

## Accuracy evaluation

```bash
cd backend && source .venv/bin/activate
python -m app.eval --split test --mode tfidf
```

This prints the resolution and overlap metrics and **rewrites `docs/pitch/eval_results.md`**. `--split dev` only prints. The thresholds in `backend/seed_data/thresholds.json` were tuned once on the dev split and frozen (`python -m app.eval --split dev --tune` re-runs the search, on dev only); the test split is only ever reported.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| First intake hangs, Hugging Face errors in the backend log | No network for the model: set `EMBEDDINGS_MODE=tfidf` in `backend/.env` and restart, or pre-download the model (above) |
| Hero intake goes to review or picks another institution | Check `SEED_SET=full` in `backend/.env` (on the tiny seed the hero ranks the wrong institution first), then `python -m app.seed --reset`; or demo it through Match Review (`/reviews`) instead (see `docs/pitch/demo_script.md`, F-1) |
| SLA days differ from the demo script ("Day 19 of 21") | Set `DEMO_TODAY=2026-11-20` in `backend/.env`, restart, and reset the data |
| Too many Possible overlap alerts | Expected on the full seed; Possible alerts go only to bureau heads. Thresholds live in `backend/seed_data/thresholds.json` |
| Blank page; the browser console says "Invalid frontend environment variables" | `frontend/.env` is missing: `cp .env.example .env` in `frontend/`, then restart `npm run dev` |
| Login fails from the frontend | The backend is not running on port 8000, or `CORS_ORIGINS` in `backend/.env` does not include `http://localhost:5173` |
| `npm ci` warns `EBADENGINE` | Node is too old: install Node 22.22+ or 24.15+ |
| Frontend tests fail with `Test timed out in 5000ms` | Run `npm test -- --maxWorkers=1` |
