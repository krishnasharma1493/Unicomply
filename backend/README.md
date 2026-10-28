# Unicomply backend

FastAPI + SQLModel + SQLite, with the institution-matching and overlap engine in `app/matching/`. The step-by-step setup for the whole app is in the [root README](../README.md); this page is the backend reference.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # Windows: copy .env.example .env
python -m app.seed --reset
uvicorn app.main:app --reload --port 8000
```

API docs: [http://localhost:8000/docs](http://localhost:8000/docs). Health: `GET /health` (also `/api/v1/health`).

## Configuration (`backend/.env`)

Every variable is documented in `.env.example`; the app refuses to start on an invalid value and names it. The ones you are most likely to change:

| Variable | Default | Use |
| --- | --- | --- |
| `EMBEDDINGS_MODE` | `model` | `tfidf` works offline with no download (see below) |
| `DEMO_TODAY` | empty (real date) | `2026-11-20` freezes "today" for the demo script |
| `SEED_SET` | `full` | `tiny` loads only the hand-written hero story |
| `SEED_ON_STARTUP` | `true` | Seeds an empty database when the server starts |
| `MATCHING_ENGINE` | `real` | `stub` returns canned hero results (fallback) |
| `DEMO_PASSWORD` | `change-me-demo-pass` | Shared password of the five demo personas |
| `CORS_ORIGINS` | `http://localhost:5173` | Must include the frontend's origin |

Matching weights and thresholds live in `seed_data/thresholds.json`; `MATCH_T_*` and `OVERLAP_T_*` in `.env` override them.

## Demo data

```bash
python -m app.seed --reset          # drop all tables, load the full generated world (seed_data/)
python -m app.seed --reset --tiny   # only the hero story (seed_data/tiny/)
```

Seed dates are shifted relative to `today()`, so "PGRC/2026/00412 is on day 19 of 21" holds on any day; with `DEMO_TODAY=2026-11-20` the dates match the contract fixtures exactly. The file format is in [seed_data/README.md](seed_data/README.md).

## Embeddings

`EMBEDDINGS_MODE=model` uses `sentence-transformers` (`EMBEDDING_MODEL_NAME`, downloaded once to the Hugging Face cache). Pre-download it while online:

```bash
python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')"
```

If the model cannot load (no network, or PyTorch too old, as on Intel Macs where PyTorch stops at 2.2.x), the engine logs a warning and falls back to `tfidf`. On Intel Macs startup also prints a harmless NumPy 1.x/2.x warning with a traceback; `EMBEDDINGS_MODE=tfidf` avoids it. The matching index is built at startup and cached in `seed_data/.cache/` (git-ignored; delete it to force a rebuild).

## Tests

```bash
pytest                              # the whole suite: about 1.5 minutes on a recent laptop, up to 7 on an older one
pytest tests/test_intake_real.py    # one file
```

Tests use an in-memory database and `EMBEDDINGS_MODE=tfidf`, so they never touch `app.db` or `.env`. Tests that need the embedding model skip themselves when it cannot load.

## Accuracy evaluation

```bash
python -m app.eval --split test --mode tfidf   # prints the metrics and rewrites docs/pitch/eval_results.md
python -m app.eval --split dev --mode tfidf    # prints only
```

`--tune` searches weights and thresholds on the dev split and writes `seed_data/thresholds.json` (#44); report results from the test split only.
