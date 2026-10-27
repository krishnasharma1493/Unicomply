// Route table for the mock API: one handler per Must endpoint in PRD §5, over the in-memory
// world in ./state. Paths are relative to `/api/v1`, as the Axios client sends them.

import { AxiosHeaders, type AxiosRequestConfig } from 'axios';
import { env } from '../../env';
import { REPORT_KINDS, type ReportKind } from '../enums';
import type {
  ApiError,
  CaseActionIn,
  CaseRead,
  Envelope,
  InstitutionListItem,
  OverlapDecisionIn,
  OverlapGroupListItem,
  Page,
  ReviewItem,
  UserMe,
} from '../types';
import { fixtures } from './fixtures';
import * as db from './state';
import { MockApiError, forbidden, notFound, validationError } from './state';

export type MockReply = [status: number, body: unknown, headers?: Record<string, string>];

type Request = {
  query: URLSearchParams;
  body: Record<string, unknown>;
  /** The path parameter, when the route has one. */
  param: string;
};
type AuthedRequest = Request & { viewer: UserMe };

type Route =
  | { method: string; pattern: RegExp; public: true; handle: (req: Request) => MockReply }
  | { method: string; pattern: RegExp; public?: false; handle: (req: AuthedRequest) => MockReply };

// ── Helpers ──────────────────────────────────────────────────────────────

const ok = <T,>(data: T, status = 200): MockReply => [status, { success: true, data } satisfies Envelope<T>];

function paged<T>(items: T[], query: URLSearchParams): MockReply {
  const page = Number(query.get('page') ?? 1);
  const limit = Number(query.get('limit') ?? 20);
  const fields: Record<string, string[]> = {};
  if (!Number.isInteger(page) || page < 1) fields.page = ['Input should be greater than or equal to 1'];
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) fields.limit = ['Input should be between 1 and 100'];
  if (Object.keys(fields).length > 0) throw validationError(fields);

  const body: Page<T> = {
    success: true,
    data: items.slice((page - 1) * limit, page * limit),
    pagination: { total: items.length, page, limit, total_pages: Math.ceil(items.length / limit) },
  };
  return [200, body];
}

type Filter<T> = [param: string, test: (item: T, value: string) => boolean];

/** Applies each filter whose query param is present and non-empty. */
const where = <T,>(items: T[], query: URLSearchParams, filters: Filter<T>[]) =>
  items.filter((item) =>
    filters.every(([param, test]) => {
      const value = query.get(param);
      return value === null || value === '' || test(item, value);
    }),
  );

const contains = (value: string, ...fields: (string | null)[]) =>
  fields.some((f) => f?.toLowerCase().includes(value.toLowerCase()));

const role = (viewer: UserMe, ...roles: UserMe['role'][]) => roles.includes(viewer.role) || viewer.is_admin;

const usersByToken = new Map(
  Object.values(fixtures.login).map((f) => [
    f.data.access_token,
    Object.values(fixtures.usersMe).find((me) => me.data.id === f.data.user.id)?.data ?? f.data.user,
  ]),
);

function viewerOf(config: AxiosRequestConfig): UserMe | null {
  const { headers } = config;
  const auth = headers instanceof AxiosHeaders ? headers.get('Authorization') : headers?.Authorization;
  const token = typeof auth === 'string' ? auth.replace(/^Bearer\s+/i, '') : null;
  const user = token ? usersByToken.get(token) : undefined;
  // AUTH_DISABLED acts as the senior officer, as the backend does.
  return user ?? (env.VITE_AUTH_DISABLED ? fixtures.usersMe.senior.data : null);
}

// ── Routes ───────────────────────────────────────────────────────────────

const routes: Route[] = [
  { method: 'GET', pattern: /^\/health$/, public: true, handle: () => [200, fixtures.health] },

  {
    method: 'POST',
    pattern: /^\/auth\/login$/,
    public: true,
    handle: ({ body }) => {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const login = Object.values(fixtures.login).find((f) => f.data.user.email === email);
      // Any non-empty password works for a persona: the real one is never in the repo.
      if (!login || typeof body.password !== 'string' || body.password === '') {
        throw new MockApiError(401, fixtures.errors.unauthorized);
      }
      return [200, login];
    },
  },

  { method: 'GET', pattern: /^\/users\/me$/, handle: ({ viewer }) => ok(viewer) },
  { method: 'GET', pattern: /^\/meta$/, handle: () => [200, fixtures.meta] },

  // Institutions
  {
    method: 'GET',
    pattern: /^\/institutions$/,
    handle: ({ query }) =>
      paged(
        where<InstitutionListItem>(fixtures.institutions.data, query, [
          ['q', (i, v) => contains(v, i.name, i.name_norm, i.acronym, i.permanent_id)],
          ['state', (i, v) => i.state.toLowerCase() === v.toLowerCase()],
          ['region', (i, v) => i.region === v],
          ['inst_type', (i, v) => i.inst_type === v],
        ]).map(db.withOpenCount),
        query,
      ),
  },
  {
    method: 'POST',
    pattern: /^\/institutions\/resolve$/,
    handle: ({ body, viewer }) => {
      if (!role(viewer, 'intake_operator', 'bureau_head')) throw forbidden();
      if (typeof body.raw_text !== 'string' || body.raw_text.trim().length < 3) {
        throw validationError({ raw_text: ['String should have at least 3 characters'] });
      }
      return [200, fixtures.resolve];
    },
  },
  {
    method: 'GET',
    pattern: /^\/institutions\/([^/]+)$/,
    handle: ({ param, viewer }) => {
      const inst = db.institutionOf(param);
      if (!inst) throw notFound('Institution');
      return ok(db.institution360(inst, viewer));
    },
  },

  // Cases
  {
    method: 'GET',
    pattern: /^\/cases$/,
    handle: ({ query, viewer }) =>
      paged(
        where<CaseRead>(
          db.world.cases.filter((c) => db.inScope(viewer, c)),
          query,
          [
            ['q', (c, v) => contains(v, c.case_ref, c.subject, c.institution_name, c.raw_institution_text, c.permanent_id)],
            ['permanent_id', (c, v) => c.permanent_id === v],
            ['case_ref', (c, v) => c.case_ref.toLowerCase() === v.toLowerCase()],
            ['bureau_id', (c, v) => c.current_bureau_id === Number(v)],
            ['region', (c, v) => c.region === v],
            // A category code (#3); a numeric id is accepted too until #7 settles it.
            ['category', (c, v) => c.category_id === Number(v) || fixtures.meta.data.categories.some((k) => k.id === c.category_id && k.code === v)],
            ['status', (c, v) => c.status === v],
            ['from', (c, v) => c.received_at >= v],
            ['to', (c, v) => c.received_at <= v],
            ['beyond_sla', (c, v) => c.beyond_sla === (v === 'true')],
            ['in_overlap', (c, v) => c.in_overlap === (v === 'true')],
          ],
        ),
        query,
      ),
  },
  {
    method: 'POST',
    pattern: /^\/cases$/,
    handle: ({ body, viewer }) => {
      if (!role(viewer, 'intake_operator', 'bureau_head')) throw forbidden();
      validateCaseCreate(body);
      return ok(db.intakeHeroCase(), 201);
    },
  },
  {
    method: 'GET',
    pattern: /^\/cases\/(\d+)$/,
    handle: ({ param, viewer }) => ok(db.caseDetail(db.caseInScopeOr404(viewer, Number(param)), viewer)),
  },
  {
    method: 'POST',
    pattern: /^\/cases\/(\d+)\/actions$/,
    handle: ({ param, body, viewer }) =>
      ok(db.applyAction(db.caseInScopeOr404(viewer, Number(param)), body as Partial<CaseActionIn>, viewer)),
  },

  // Match review
  {
    method: 'GET',
    pattern: /^\/reviews$/,
    handle: ({ query, viewer }) => {
      if (!role(viewer, 'intake_operator')) throw forbidden();
      return paged(where<ReviewItem>(db.world.reviews, query, [['status', (r, v) => r.status === v]]), query);
    },
  },
  {
    method: 'POST',
    pattern: /^\/reviews\/(\d+)\/decide$/,
    handle: ({ param, body, viewer }) => {
      const review = db.world.reviews.find((r) => r.id === Number(param));
      if (!review) throw notFound('Match review');
      return ok(db.decideReview(review, body, viewer));
    },
  },

  // Overlaps
  {
    method: 'GET',
    pattern: /^\/overlaps$/,
    handle: ({ query, viewer }) => {
      const codeOf = (id: string) => fixtures.meta.data.bureaus.find((b) => b.id === Number(id))?.code;
      const groups = db.visibleGroups(viewer).map((g) => g.group);
      return paged(
        where<OverlapGroupListItem>(groups, query, [
          ['tier', (g, v) => g.tier === v],
          ['status', (g, v) => g.status === v],
          ['level', (g, v) => g.level === v],
          ['bureau_id', (g, v) => g.bureau_codes.some((code) => code === codeOf(v))],
        ]),
        query,
      );
    },
  },
  {
    method: 'GET',
    pattern: /^\/overlaps\/(\d+)$/,
    handle: ({ param, viewer }) => ok(db.overlapDetail(db.groupInScopeOr404(viewer, Number(param)), viewer)),
  },
  {
    method: 'POST',
    pattern: /^\/overlaps\/(\d+)\/decision$/,
    handle: ({ param, body, viewer }) =>
      ok(db.decideOverlap(db.groupInScopeOr404(viewer, Number(param)), body as Partial<OverlapDecisionIn>, viewer)),
  },

  // Alerts (own only)
  {
    method: 'GET',
    pattern: /^\/alerts$/,
    handle: ({ query, viewer }) =>
      paged(
        db.world.alerts.filter((a) => a.recipient_id === viewer.id && (query.get('unread_only') !== 'true' || !a.is_read)),
        query,
      ),
  },
  {
    method: 'POST',
    pattern: /^\/alerts\/read-all$/,
    handle: ({ viewer }) => {
      const unread = db.world.alerts.filter((a) => a.recipient_id === viewer.id && !a.is_read);
      for (const a of unread) a.is_read = true;
      return ok({ updated: unread.length });
    },
  },
  {
    method: 'POST',
    pattern: /^\/alerts\/(\d+)\/read$/,
    handle: ({ param, viewer }) => {
      const alert = db.world.alerts.find((a) => a.id === Number(param) && a.recipient_id === viewer.id);
      if (!alert) throw notFound('Alert');
      alert.is_read = true;
      return ok(alert);
    },
  },

  // Dashboard: served as seeded (not recomputed after mutations).
  { method: 'GET', pattern: /^\/dashboard\/summary$/, handle: () => [200, fixtures.dashboardSummary] },
  { method: 'GET', pattern: /^\/dashboard\/workload$/, handle: () => [200, fixtures.dashboardWorkload] },
  { method: 'GET', pattern: /^\/dashboard\/ageing$/, handle: () => [200, fixtures.dashboardAgeing] },
  {
    method: 'GET',
    pattern: /^\/dashboard\/institutions$/,
    handle: ({ query }) => {
      const limit = Number(query.get('limit') ?? fixtures.dashboardInstitutions.data.length);
      return ok(fixtures.dashboardInstitutions.data.slice(0, limit));
    },
  },

  // Reports
  {
    method: 'GET',
    pattern: /^\/reports\/([a-z_]+)$/,
    handle: ({ param, query, viewer }) => {
      if (!role(viewer, 'senior_mgmt', 'bureau_head')) throw forbidden();
      const kind = REPORT_KINDS.find((k): k is ReportKind => k === param);
      if (!kind) throw notFound('Report');
      const report = fixtures.reports[kind];
      return query.get('format') === 'csv'
        ? [200, toCsv(report.data.columns, report.data.rows), { 'content-type': 'text/csv; charset=utf-8' }]
        : [200, report];
    },
  },

  // Demo
  {
    method: 'POST',
    pattern: /^\/demo\/reset$/,
    handle: ({ viewer }) => {
      if (!viewer.is_admin) throw forbidden();
      db.resetWorld();
      return [200, fixtures.demoReset];
    },
  },
];

function validateCaseCreate(body: Record<string, unknown>) {
  const fields: Record<string, string[]> = {};
  const text = (key: string, min: number, max: number) => {
    const v = body[key];
    if (typeof v !== 'string') fields[key] = ['Field required'];
    else if (v.length < min) fields[key] = [`String should have at least ${min} characters`];
    else if (v.length > max) fields[key] = [`String should have at most ${max} characters`];
  };
  for (const key of ['source_channel', 'received_at', 'complainant_type', 'category_id']) {
    if (body[key] === undefined || body[key] === null) fields[key] = ['Field required'];
  }
  text('raw_institution_text', 3, 300);
  if (typeof body.permanent_id === 'string' && !/^1-\d{6,10}$/.test(body.permanent_id)) {
    fields.permanent_id = ["String should match pattern '^1-\\d{6,10}$'"];
  }
  text('subject', 3, 200);
  text('description', 10, 4000);
  if (Object.keys(fields).length > 0) throw validationError(fields);
}

/** `format=csv`: header row = `columns[].label`, body = `rows` (contract/README.md). */
function toCsv(columns: { key: string; label: string }[], rows: readonly Record<string, unknown>[]): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => cell(c.label)), ...rows.map((r) => columns.map((c) => cell(r[c.key])))]
    .map((line) => line.join(','))
    .join('\n');
}

// ── Dispatch ─────────────────────────────────────────────────────────────

const errorBody = (code: ApiError['error']['code'], message: string): ApiError => ({
  success: false,
  error: { code, message },
});

/** `?mock_error=<status>` on any request: the matching error fixture, else a generic error. */
const SIMULATED: Partial<Record<number, ApiError>> = {
  400: fixtures.errors.validation,
  401: fixtures.errors.unauthorized,
  403: fixtures.errors.forbidden,
  404: fixtures.errors.notFound,
  409: fixtures.errors.alreadyDecided,
};

function simulatedError(status: number): MockReply {
  const code = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
  const body =
    SIMULATED[code] ??
    errorBody(code >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR', `Simulated error (mock_error=${code})`);
  return [code, body];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parseBody(data: unknown): Record<string, unknown> {
  if (typeof data !== 'string') return isRecord(data) ? data : {};
  try {
    const parsed: unknown = JSON.parse(data);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function dispatch(config: AxiosRequestConfig): MockReply {
  const url = new URL(config.url ?? '', 'http://mock.invalid');
  const path = url.pathname.replace(/^\/api\/v1(?=\/)/, '').replace(/\/$/, '') || '/';
  const query = new URLSearchParams(url.search);
  const params: Record<string, unknown> = config.params ?? {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) query.set(key, String(value));
  }

  const mockError = query.get('mock_error');
  if (mockError !== null) return simulatedError(Number(mockError));

  const method = (config.method ?? 'get').toUpperCase();
  for (const route of routes) {
    const match = route.method === method ? route.pattern.exec(path) : null;
    if (!match) continue;
    const req: Request = { query, body: parseBody(config.data), param: decodeURIComponent(match[1] ?? '') };
    try {
      if (route.public) return clone(route.handle(req));
      const viewer = viewerOf(config);
      if (!viewer) return [401, errorBody('UNAUTHORIZED', 'Not authenticated')];
      return clone(route.handle({ ...req, viewer }));
    } catch (err) {
      if (err instanceof MockApiError) return [err.status, err.body];
      console.error('[mock api]', method, path, err);
      return [500, errorBody('INTERNAL_ERROR', 'Mock handler failed')];
    }
  }
  return [404, errorBody('NOT_FOUND', `No mock for ${method} ${path}`)];
}

/** Responses are copies, so a cached response never changes when the world does. */
const clone = ([status, body, headers]: MockReply): MockReply => [status, structuredClone(body), headers];
