import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios, { type Method } from 'axios';
import { attachMockAdapter } from '../lib/api/mock';
import { fixtures, type Persona } from '../lib/api/mock/fixtures';
import { resetWorld } from '../lib/api/mock/state';
import { client, registerMockAdapter } from '../lib/api/client';

const api = axios.create({ baseURL: 'http://localhost:8000/api/v1', validateStatus: () => true });
attachMockAdapter(api, { latencyMs: [0, 0] });

type CallOptions = { as?: Persona; data?: unknown; params?: Record<string, unknown> };

async function call(method: Method, url: string, { as, data, params }: CallOptions = {}) {
  const headers = as ? { Authorization: `Bearer ${fixtures.login[as].data.access_token}` } : {};
  const res = await api.request({ method, url, data, params, headers });
  return { status: res.status, body: res.data as unknown };
}

/** Drops the fields a live mutation stamps with the mock clock. */
const withoutTimes = <T extends object>(o: T, ...keys: string[]) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

beforeEach(() => resetWorld());

describe('Mock API: auth', () => {
  it.each(Object.keys(fixtures.login) as Persona[])('logs in %s and returns that persona from /users/me', async (persona) => {
    const login = await call('POST', '/auth/login', { data: { email: fixtures.login[persona].data.user.email, password: 'x' } });
    expect(login).toEqual({ status: 200, body: fixtures.login[persona] });
    expect(await call('GET', '/users/me', { as: persona })).toEqual({ status: 200, body: fixtures.usersMe[persona] });
  });

  it('rejects an unknown email and a missing token with 401', async () => {
    const bad = await call('POST', '/auth/login', { data: { email: 'nobody@aicte.example', password: 'x' } });
    expect(bad).toEqual({ status: 401, body: fixtures.errors.unauthorized });
    expect((await call('GET', '/cases')).status).toBe(401);
  });
});

describe('Mock API: seeded reads match the fixtures', () => {
  it.each([
    ['/meta', 'senior', fixtures.meta],
    ['/cases', 'senior', fixtures.cases],
    ['/institutions', 'senior', fixtures.institutions],
    ['/institutions/1-43655981521', 'senior', fixtures.institution360],
    ['/cases/101', 'pgrc_head', fixtures.caseDetail],
    ['/reviews?status=pending', 'intake', fixtures.reviews],
    ['/overlaps', 'senior', fixtures.overlaps],
    ['/overlaps/1', 'pgrc_head', fixtures.overlapDetail],
    ['/alerts', 'rb_head', fixtures.alerts],
    ['/dashboard/summary', 'senior', fixtures.dashboardSummary],
    ['/dashboard/workload', 'senior', fixtures.dashboardWorkload],
    ['/dashboard/ageing', 'senior', fixtures.dashboardAgeing],
    ['/dashboard/institutions?limit=5', 'senior', fixtures.dashboardInstitutions],
  ] as const)('GET %s as %s', async (url, as, expected) => {
    expect(await call('GET', url, { as })).toEqual({ status: 200, body: expected });
  });

  it('serves /health without an envelope and every report kind', async () => {
    expect(await call('GET', '/health')).toEqual({ status: 200, body: fixtures.health });
    for (const [kind, report] of Object.entries(fixtures.reports)) {
      expect(await call('GET', `/reports/${kind}`, { as: 'senior', params: { from: '2026-09-01', to: '2026-11-20' } })).toEqual({
        status: 200,
        body: report,
      });
    }
  });

  it('exports a report as CSV with the column labels as header', async () => {
    const { status, body } = await call('GET', '/reports/status', { as: 'senior', params: { format: 'csv' } });
    const report = fixtures.reports.status.data;
    expect(status).toBe(200);
    expect(String(body).split('\n')).toHaveLength(report.rows.length + 1);
    expect(String(body).split('\n')[0]).toBe(report.columns.map((c) => c.label).join(','));
  });

  it('scopes cases: a Western case is 404 for the North-Western RO', async () => {
    expect(await call('GET', '/cases/110', { as: 'ro_nw' })).toEqual({ status: 404, body: fixtures.errors.notFound });
    const list = await call('GET', '/cases', { as: 'ro_nw' });
    const regions = (list.body as typeof fixtures.cases).data.map((c) => c.region);
    expect(regions.every((r) => r === 'north_western')).toBe(true);
  });
});

describe('Mock API: demo mutations', () => {
  it('POST /cases returns the hero intake and adds PGRC/2026/00519 to group 1', async () => {
    const res = await call('POST', '/cases', { as: 'intake', data: fixtures.requests.createCase });
    expect(res).toEqual({ status: 201, body: fixtures.intake });

    const cases = (await call('GET', '/cases', { as: 'senior' })).body as typeof fixtures.cases;
    expect(cases.data[0]?.case_ref).toBe('PGRC/2026/00519');
    expect(cases.pagination.total).toBe(fixtures.cases.pagination.total + 1);
    const group = (await call('GET', '/overlaps/1', { as: 'pgrc_head' })).body as typeof fixtures.overlapDetail;
    expect(group.data.cases.map((c) => c.case_ref)).toContain('PGRC/2026/00519');
    expect(group.data.group.case_count).toBe(4);
  });

  it('rejects an invalid intake with the VALIDATION_ERROR fixture', async () => {
    const data = { ...fixtures.requests.createCase, permanent_id: '12345', description: 'too short' };
    expect(await call('POST', '/cases', { as: 'intake', data })).toEqual({ status: 400, body: fixtures.errors.validation });
  });

  it('applies an action through the transition table and appends it to the timeline', async () => {
    const res = await call('POST', '/cases/103/actions', { as: 'ro_nw', data: fixtures.requests.caseAction });
    const expected = fixtures.caseAction.data;
    const body = res.body as typeof fixtures.caseAction;
    expect(res.status).toBe(200);
    // `next_action` changes in the fixture, but nothing in CaseActionIn sets it.
    const unstamped = ['last_action_at', 'updated_at', 'next_action'];
    expect(withoutTimes(body.data.case, ...unstamped)).toEqual(withoutTimes(expected.case, ...unstamped));
    expect(withoutTimes(body.data.action, 'id', 'created_at')).toEqual(withoutTimes(expected.action, 'id', 'created_at'));

    const detail = (await call('GET', '/cases/103', { as: 'senior' })).body as typeof fixtures.caseDetail;
    expect(detail.data.actions.at(-1)).toEqual(body.data.action);
    expect(detail.data.case.status).toBe('under_process');
  });

  it('returns INVALID_TRANSITION and REMARKS_REQUIRED as in the fixtures', async () => {
    const reopen = await call('POST', '/cases/101/actions', { as: 'pgrc_head', data: { action_type: 'reopen', remarks: 'x' } });
    expect(reopen).toEqual({ status: 400, body: fixtures.errors.invalidTransition });
    const transfer = await call('POST', '/cases/102/actions', { as: 'rb_head', data: { action_type: 'transfer', to_bureau_id: 2 } });
    expect(transfer).toEqual({ status: 400, body: fixtures.errors.remarksRequired });
  });

  it('runs demo steps 4, 5 and 7: intake, confirm group 1, dispose needs confirm_open_overlap', async () => {
    await call('POST', '/cases', { as: 'intake', data: fixtures.requests.createCase });

    const decided = await call('POST', '/overlaps/1/decision', { as: 'pgrc_head', data: fixtures.requests.overlapDecision });
    const body = decided.body as typeof fixtures.overlapDecision;
    const expected = fixtures.overlapDecision.data;
    expect(decided.status).toBe(200);
    expect({ ...body.data, group: withoutTimes(body.data.group, 'decided_at', 'updated_at') }).toEqual({
      ...expected,
      group: withoutTimes(expected.group, 'decided_at', 'updated_at'),
    });

    const dispose = { action_type: 'dispose', outcome: 'redressed', remarks: 'Refund issued; certificates returned.' };
    expect(await call('POST', '/cases/101/actions', { as: 'pgrc_head', data: dispose })).toEqual({
      status: 409,
      body: fixtures.errors.openOverlap,
    });
    const confirmed = await call('POST', '/cases/101/actions', { as: 'pgrc_head', data: { ...dispose, confirm_open_overlap: true } });
    expect(confirmed.status).toBe(200);
    expect((confirmed.body as typeof fixtures.caseAction).data.case.status).toBe('disposed');
  });

  it('returns ALREADY_DECIDED and FORBIDDEN for overlap decisions as in the fixtures', async () => {
    const again = await call('POST', '/overlaps/3/decision', { as: 'senior', data: { decision: 'dismiss', remark: 'x' } });
    expect(again).toEqual({ status: 409, body: fixtures.errors.alreadyDecided });
    const ro = await call('POST', '/overlaps/1/decision', { as: 'intake', data: fixtures.requests.overlapDecision });
    expect(ro).toEqual({ status: 403, body: fixtures.errors.forbidden });
  });

  it('decides a match review and updates the queue and overlap list', async () => {
    const res = await call('POST', '/reviews/2/decide', { as: 'intake', data: fixtures.requests.reviewDecide });
    expect(res).toEqual({ status: 200, body: fixtures.reviewDecide });

    const queue = (await call('GET', '/reviews', { as: 'intake', params: { status: 'pending' } })).body as typeof fixtures.reviews;
    expect(queue.data.map((r) => r.id)).toEqual([1]);
    const groups = (await call('GET', '/overlaps', { as: 'senior' })).body as typeof fixtures.overlaps;
    expect(groups.data.map((g) => g.id)).toContain(5);
    expect((await call('POST', '/reviews/2/decide', { as: 'intake', data: fixtures.requests.reviewDecide })).status).toBe(409);
  });

  it('marks one alert and then all alerts read', async () => {
    expect(await call('POST', '/alerts/502/read', { as: 'rb_head' })).toEqual({ status: 200, body: fixtures.alertRead });
    expect(await call('POST', '/alerts/read-all', { as: 'rb_head' })).toEqual({
      status: 200,
      body: { success: true, data: { updated: fixtures.alertsReadAll.data.updated - 1 } },
    });
    const unread = (await call('GET', '/alerts', { as: 'rb_head', params: { unread_only: true } })).body as typeof fixtures.alerts;
    expect(unread.data).toEqual([]);
  });

  it('POST /demo/reset (admin only) restores the seeded world', async () => {
    await call('POST', '/cases', { as: 'intake', data: fixtures.requests.createCase });
    expect((await call('POST', '/demo/reset', { as: 'rb_head' })).status).toBe(403);
    expect(await call('POST', '/demo/reset', { as: 'senior' })).toEqual({ status: 200, body: fixtures.demoReset });
    expect(await call('GET', '/cases', { as: 'senior' })).toEqual({ status: 200, body: fixtures.cases });
  });
});

describe('Mock API: errors, latency and wiring', () => {
  it('honours ?mock_error=500 on any request, public ones included', async () => {
    for (const [url, as] of [['/cases?mock_error=500', 'senior'], ['/health?mock_error=500', undefined]] as const) {
      const res = await call('GET', url, { as });
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ success: false, error: { code: 'INTERNAL_ERROR' } });
    }
    expect(await call('GET', '/meta', { as: 'senior', params: { mock_error: 404 } })).toEqual({
      status: 404,
      body: fixtures.errors.notFound,
    });
  });

  it('answers after a simulated 200–600 ms latency', async () => {
    const slow = axios.create({ validateStatus: () => true });
    attachMockAdapter(slow);
    const started = performance.now();
    await slow.get('/health');
    const elapsed = performance.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(195);
    expect(elapsed).toBeLessThan(900);
  });

  it('leaves the real client alone when VITE_USE_MOCKS=false', () => {
    const attacher = vi.fn();
    registerMockAdapter(attacher);
    expect(attacher).not.toHaveBeenCalled();
    expect(client.defaults.baseURL).toBe('http://localhost:8000/api/v1');
    expect(client.defaults.adapter).not.toBeTypeOf('function');
  });
});

describe('Mock API: dashboard drill-down filters', () => {
  const refs = async (query: string) =>
    ((await call('GET', `/cases?limit=100&${query}`, { as: 'senior' })).body as { data: { case_ref: string; status: string }[] }).data;

  it('status takes several values, comma separated', async () => {
    const both = await refs('status=under_process,interim_reply');
    expect(both.length).toBeGreaterThan((await refs('status=interim_reply')).length);
    expect(both.every((c) => ['under_process', 'interim_reply'].includes(c.status))).toBe(true);
  });

  it('pending=true is everything not disposed, pending=false the disposed', async () => {
    const pending = await refs('pending=true');
    const closed = await refs('pending=false');
    expect(closed.every((c) => c.status === 'disposed')).toBe(true);
    expect(pending.some((c) => c.status === 'disposed')).toBe(false);
    expect(pending.length + closed.length).toBe(13);
  });
});
