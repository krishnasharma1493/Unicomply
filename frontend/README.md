# Unicomply Frontend

AICTE Integrated Complaint Monitoring Dashboard (`frontend/`).

## Tech Stack & Architecture

- **Core:** React 19 + Vite 8 + TypeScript Strict (`strict: true`)
- **Routing:** `react-router-dom` v7 with PRD §7 route definitions
- **State & Server Cache:** `@tanstack/react-query` v5
- **HTTP Client:** `axios` with automatic token injection and 401 handling
- **UI Kit:** **Ant Design (`antd`)**
  - **Decision:** Ant Design was selected at kickoff for its battle-tested enterprise components (tables, pagination, date pickers, modals, form controls, and accessible status indicators) matching the requirements of an AICTE administrative portal and maximizing speed for the hackathon milestone deliveries.
- **Form Management & Validation:** `react-hook-form` + `@hookform/resolvers` + `zod`
- **Charts & Tables:** `recharts` + `@tanstack/react-table`
- **Sanitization:** `dompurify`
- **Testing:** `vitest` + `@testing-library/react` + `jsdom`

## Route Architecture (PRD §7)

All routes are scaffolded with placeholders and protected with `<RequireAuth>` (except `/login`):

| Path | Page | Description |
|---|---|---|
| `/login` | `LoginPage` | Persona switcher and login fallback |
| `/` | `DashboardPage` | Scoped executive & bureau KPIs |
| `/cases` | `CasesPage` | Search, filter, and paginated case listing |
| `/cases/new` | `CaseIntakePage` | Case intake with live 300ms institution match preview |
| `/cases/:id` | `CaseDetailPage` | Case tracking fields, overlap banner, and workflow actions |
| `/reviews` | `MatchReviewPage` | Match review queue for uncertain resolution cases |
| `/overlaps` | `OverlapCenterPage` | Cross-bureau overlapping complaint groups |
| `/overlaps/:id` | `OverlapDetailPage` | Side-by-side clustered case comparison and decisions |
| `/institutions` | `InstitutionsPage` | Institution registry search |
| `/institutions/:pid` | `InstitutionDetailPage` | Full Institution 360-degree profile |
| `/alerts` | `AlertsPage` | Notification center grouped by institution and severity |
| `/reports` | `ReportsPage` | Analytical reports with chart, table, and server CSV export |
| `/admin` | `AdminPage` | System administration & demo database reset |
| `*` | `NotFoundPage` | 404 page for unmatched routes |

## Environment Variables

Configured in `src/lib/env.ts` with strict Zod validation on boot:

- `VITE_API_URL`: Base backend URL (e.g. `http://localhost:8000`)
- `VITE_USE_MOCKS`: Toggle for Issue #10 mock API layer (`true` \| `false`)
- `VITE_AUTH_DISABLED`: Emergency demo switch to bypass auth
- `VITE_DEMO_MODE`: Enables persona switcher and demo helpers
- `VITE_DEMO_EMAIL`: Default persona email (e.g. `senior@aicte.example`)
- `VITE_DEMO_PASSWORD`: Demo login password fallback

## Scripts

Requires Node.js 22.22+ or 24.15+. Install with `npm ci` and copy `.env.example` to `.env` first (full setup in the [root README](../README.md)).

```bash
# Run local development server
npm run dev

# Run TypeScript strict type-check
npm run typecheck

# Run unit and integration tests
npm run test

# Same, one test file at a time (use on slower laptops if tests time out at 5 s)
npm test -- --maxWorkers=1

# Build production bundle
npm run build
```
