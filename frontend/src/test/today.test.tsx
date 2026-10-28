import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthProvider';
import { tokenStore } from '../auth/tokenStore';
import { QUEUES, seeAll, todayPlan } from '../features/today/useToday';
import { client } from '../lib/api/client';
import { attachMockAdapter } from '../lib/api/mock';
import { fixtures, type Persona } from '../lib/api/mock/fixtures';
import { resetWorld } from '../lib/api/mock/state';
import { TodayPage } from '../pages/TodayPage';

const renderAs = (persona: Persona) => {
  tokenStore.set(fixtures.login[persona].data.access_token);
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<TodayPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
};
const section = async (name: RegExp) => (await screen.findByRole('heading', { level: 2, name })).closest('section') as HTMLElement;

describe('Today: what each role sees', () => {
  it('composes the queue by role from endpoints the role may call', () => {
    expect(todayPlan('bureau_head')).toMatchObject({ decisions: true, sla: true, reviews: false });
    expect(todayPlan('senior_mgmt')).toMatchObject({ decisions: true, sla: true, reviews: true });
    expect(todayPlan('intake_operator')).toMatchObject({ decisions: false, sla: false, reviews: true, recent: true, register: true });
    expect(todayPlan('ro_officer')).toMatchObject({ decisions: false, sla: true, unassigned: true });
  });

  it('"See all" opens the same list, in the same order', () => {
    expect(seeAll(QUEUES.pastSla)).toBe('/cases?beyond_sla=true&sort=sla_due_asc');
    expect(seeAll(QUEUES.dueSoon)).toBe('/cases?beyond_sla=false&pending=true&sort=sla_due_asc');
  });
});

describe('Today page on the mock API', () => {
  beforeAll(() => {
    attachMockAdapter(client, { latencyMs: [0, 0] });
  });
  beforeEach(() => resetWorld());
  afterEach(() => {
    tokenStore.clear();
    vi.restoreAllMocks();
  });

  it('gives a bureau head decisions, the SLA queue and alerts, dated by the server', async () => {
    renderAs('pgrc_head');
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(await screen.findByText('20 Nov 2026')).toBeInTheDocument();
    const decisions = await section(/Needs your decision/);
    expect(await within(decisions).findByRole('link', { name: /Probable overlap: Vindhya Valley Institute of Engineering/ })).toHaveAttribute('href', '/overlaps/1');
    const due = await section(/Due soon/);
    expect(await within(due).findByText('PGRC/2026/00412')).toBeInTheDocument();
    expect(within(due).getByText('Day 19 of 21')).toBeInTheDocument();
    expect(within(due).getByRole('link', { name: /See all open cases within SLA/ })).toHaveAttribute('href', '/cases?beyond_sla=false&pending=true&sort=sla_due_asc');
    expect(within(await section(/Past SLA/)).getByRole('link', { name: 'See all cases past SLA' })).toHaveAttribute('href', '/cases?beyond_sla=true&sort=sla_due_asc');
    expect(screen.queryByRole('heading', { name: /Match reviews/ })).toBeNull();
  });

  it('asks the API for the SLA queues in due-date order', async () => {
    const get = vi.spyOn(client, 'get');
    renderAs('pgrc_head');
    await screen.findByRole('heading', { level: 2, name: /Past SLA/ });
    await waitFor(() => {
      const params = get.mock.calls.filter(([url]) => url === '/cases').map(([, c]) => (c as { params: Record<string, unknown> }).params);
      expect(params).toContainEqual({ beyond_sla: true, sort: 'sla_due_asc', page: 1, limit: 8 });
      expect(params).toContainEqual({ beyond_sla: false, pending: true, sort: 'sla_due_asc', page: 1, limit: 8 });
    });
  });

  it('leads an intake operator with registering, their reviews and their recent cases, and never calls /overlaps', async () => {
    const get = vi.spyOn(client, 'get');
    renderAs('intake');
    expect(await screen.findByRole('button', { name: /Register a case/ })).toBeInTheDocument();
    const reviews = await section(/Match reviews/);
    expect(await within(reviews).findAllByRole('link', { name: /^Review / })).not.toHaveLength(0);
    expect(await section(/Your recent cases/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Needs your decision/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Past SLA/ })).toBeNull();
    expect(get.mock.calls.some(([url]) => url === '/overlaps')).toBe(false);
  });

  it('gives a regional officer their region, with the open cases that have no officer', async () => {
    const get = vi.spyOn(client, 'get');
    renderAs('ro_central');
    const unassigned = await section(/Unassigned/);
    expect(await within(unassigned).findByText('RO-CRO/2026/00133')).toBeInTheDocument();
    expect(get.mock.calls.some(([url]) => url === '/reviews' || url === '/overlaps')).toBe(false);
  });

  it('says what is clear when a queue is empty', async () => {
    renderAs('intake');
    expect(await screen.findByText('No unread alerts.')).toBeInTheDocument();
  });

  it('keeps the rest of the page when one request fails, with a retry in that part only', async () => {
    const get = client.get.bind(client);
    vi.spyOn(client, 'get').mockImplementation(((url: string, config?: { params?: Record<string, unknown> }) =>
      url === '/cases' && config?.params?.beyond_sla === true
        ? Promise.reject(new Error('Cases service down'))
        : (get as (...a: unknown[]) => unknown)(url, config)) as typeof client.get);
    renderAs('pgrc_head');
    const past = await section(/Past SLA/);
    expect(await within(past).findByText('Cases service down')).toBeInTheDocument();
    expect(within(past).getByRole('button', { name: /Try again/i })).toBeInTheDocument();
    expect(await within(await section(/Due soon/)).findByText('PGRC/2026/00412')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Try again/i })).toHaveLength(1);
  });

  it('marks an alert read in place; it leaves the list at once', async () => {
    const user = userEvent.setup();
    renderAs('rb_head');
    const alerts = await section(/Unread alerts/);
    const button = await within(alerts).findByRole('button', { name: 'Mark read: Beyond SLA: RB/2026/00079' });
    await user.click(button);
    await waitFor(() => expect(within(alerts).queryByRole('button', { name: 'Mark read: Beyond SLA: RB/2026/00079' })).toBeNull());
    expect(within(alerts).getByRole('button', { name: 'Mark read: Beyond SLA: RO-CRO/2026/00121' })).toHaveFocus();
    await waitFor(() => expect(within(alerts).getByText('4')).toBeInTheDocument()); // the count follows the server
  });
});
