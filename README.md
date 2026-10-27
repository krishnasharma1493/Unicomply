# Unicomply

AICTE Integrated Grievance Redressal, Overlap Detection & Compliance Monitoring Portal.

## Run backend + frontend locally

### Prerequisites
- Python 3.11+
- Node.js 20+ & npm 10+

### Option A: Frontend with Built-in Mock API (Self-Contained Demo)
No backend required. The mock adapter simulates all API endpoints using shared contract fixtures:
```bash
cd frontend
npm install
VITE_USE_MOCKS=true npm run dev
```
Open [http://localhost:5173](http://localhost:5173). Default variables are configured in `frontend/.env` (and template in `frontend/.env.example`).

To run test suites:
```bash
cd frontend
npm test
```

### Option B: Backend + Frontend

1. **Start the FastAPI backend:**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Backend runs at [http://localhost:8000](http://localhost:8000), API documentation at [http://localhost:8000/docs](http://localhost:8000/docs).

2. **Start the Frontend connected to the live backend:**
```bash
cd frontend
npm install
VITE_USE_MOCKS=false npm run dev
```

### Demo Personas (Default Password: `change-me-demo-pass`)
| Persona | Email | Role | Scope / Bureau |
|---|---|---|---|
| Dr. Meera Raghavan | `senior@aicte.example` | Senior Management (`senior_mgmt`) | Admin, all bureaus |
| Anil Deshmukh | `pgrc.head@aicte.example` | Bureau Head (`bureau_head`) | PGRC (Bureau 2) |
| Kavita Rao | `rb.head@aicte.example` | Bureau Head (`bureau_head`) | RB (Bureau 1) |
| Rakesh Tiwari | `ro.central@aicte.example` | Regional Officer (`ro_officer`) | Central RO (Bureau 5) |
| Neha Joshi | `intake@aicte.example` | Intake Operator (`intake_operator`) | Intake Desk & Match Review |
