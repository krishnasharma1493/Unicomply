import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { tokenStore } from '../auth/tokenStore';
import { AlertBell } from '../features/alerts/AlertBell';
import { alertTarget } from '../features/alerts/AlertItem';
import { groupAlerts } from '../features/alerts/grouping';
import { POLL_MS } from '../features/alerts/useAlerts';
import { client } from '../lib/api/client';
import { attachMockAdapter } from '../lib/api/mock';
import { fixtures, type Persona } from '../lib/api/mock/fixtures';
import { resetWorld } from '../lib/api/mock/state';
import type { Alert } from '../lib/api/types';
import { AlertsPage } from '../pages/AlertsPage';

const alert = (over: Partial<Alert>): Alert => ({ ...fixtures.alerts.data[0], ...over });

describe('groupAlerts', () => {
  it('puts alerts about one institution on one day in one card, with the highest severity', () => {
    const groups = groupAlerts([
      alert({ id: 1, permanent_id: 'P', institution_name: 'A', severity: 'info', created_at: '2026-11-20T09:00:00Z' }),
      alert({ id: 2, permanent_id: 'P', institution_name: 'A', severity: 'critical', created_at: '2026-11-20T08:00:00Z' }),
      alert({ id: 3, permanent_id: 'P', institution_name: 'A', severity: 'warning', created_at: '2026-11-19T08:00:00Z' }),
      alert({ id: 4, permanent_id: 'Q', institution_name: 'B', severity: 'warning', created_at: '2026-11-20T08:00:00Z' }),
    ]);
    expect(groups.map((g) => [g.permanentId, g.day, g.severity, g.alerts.length])).toEqual([
      ['P', '2026-11-20', 'critical', 2], ['Q', '2026-11-20', 'warning', 1], ['P', '2026-11-19', 'warning', 1],
    ]);
  });
  it('sorts cards critical > warning > info, newest first within a severity, and alerts the same way inside a card', () => {
    const groups = groupAlerts([
      alert({ id: 1, permanent_id: 'A', severity: 'info', created_at: '2026-11-20T10:00:00Z' }),
      alert({ id: 2, permanent_id: 'B', severity: 'warning', created_at: '2026-11-18T10:00:00Z' }),
      alert({ id: 3, permanent_id: 'C', severity: 'critical', created_at: '2026-11-01T10:00:00Z' }),
      alert({ id: 4, permanent_id: 'D', severity: 'warning', created_at: '2026-11-19T10:00:00Z' }),
    ]);
    expect(groups.map((g) => g.permanentId)).toEqual(['C', 'D', 'B', 'A']);
    const inside = groupAlerts([
      alert({ id: 1, permanent_id: 'A', severity: 'info', created_at: '2026-11-20T11:00:00Z' }),
      alert({ id: 2, permanent_id: 'A', severity: 'critical', created_at: '2026-11-20T09:00:00Z' }),
      alert({ id: 3, permanent_id: 'A', severity: 'critical', created_at: '2026-11-20T10:00:00Z' }),
    ])[0];
    expect(inside.alerts.map((a) => a.id)).toEqual([3, 2, 1]);
  });
  it('counts unread and keeps alerts without an institution together', () => {
    const [g] = groupAlerts([alert({ id: 1, permanent_id: null, institution_name: null, is_read: false }), alert({ id: 2, permanent_id: null, institution_name: null, is_read: true })]);
    expect(g.unread).toBe(1);
    expect(g.alerts).toHaveLength(2);
  });
});

describe('alertTarget', () => {
  it('points an overlap alert at its group and others at the case', () => {
    expect(alertTarget({ type: 'overlap', group_id: 3, case_id: 9, case_ref: 'X/1' })).toEqual({ to: '/overlaps/3', label: 'Open overlap' });
    expect(alertTarget({ type: 'sla_breach', group_id: null, case_id: 9, case_ref: 'RB/2026/00079' })).toEqual({ to: '/cases/9', label: 'Open RB/2026/00079' });
    expect(alertTarget({ type: 'reminder', group_id: null, case_id: null, case_ref: null })).toBeNull();
  });
});

describe('Alerts on the mock API (Issue #33)', () => {
  beforeAll(() => {
    attachMockAdapter(client, { latencyMs: [0, 0] });
  });
  beforeEach(() => resetWorld());
  afterEach(() => {
    tokenStore.clear();
    vi.restoreAllMocks();
  });

  const unreadFixtures = fixtures.alerts.data.filter((a) => !a.is_read).length;
  let queryClient: QueryClient;
  const renderAs = (persona: Persona = 'rb_head', withPage = true) => {
    tokenStore.set(fixtures.login[persona].data.access_token);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AlertBell />
          {withPage && <AlertsPage />}
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };
  const bell = () => screen.findByRole('button', { name: /^Alerts, / });

  it('shows the unread count on the bell, and the latest five when it is opened', async () => {
    const user = userEvent.setup();
    renderAs('rb_head', false);
    const button = await screen.findByRole('button', { name: `Alerts, ${unreadFixtures} unread` });
    await user.click(button);
    const popover = (await screen.findByText('View all alerts')).closest('.ant-popover') as HTMLElement;
    const latest = fixtures.alerts.data.slice(0, 5);
    for (const a of latest) expect(within(popover).getByText(a.title)).toBeInTheDocument();
    expect(within(popover).getByRole('link', { name: 'View all alerts' })).toHaveAttribute('href', '/alerts');
  });

  it('polls every 30 seconds', async () => {
    renderAs('rb_head', false);
    await bell();
    const intervals = queryClient.getQueryCache().findAll({ queryKey: ['alerts'] }).map((q) => (q.options as unknown as { refetchInterval?: number }).refetchInterval);
    expect(intervals.length).toBeGreaterThanOrEqual(2);
    expect(new Set(intervals)).toEqual(new Set([POLL_MS]));
    expect(POLL_MS).toBe(30_000);
  });

  it('lists the cards critical first, newest first within a severity', async () => {
    renderAs();
    await screen.findByRole('heading', { name: 'Alerts' });
    await waitFor(() => expect(screen.getAllByLabelText(/^Alerts for /).length).toBe(6));
    const order = screen.getAllByLabelText(/^Alerts for /).map((c) => c.getAttribute('aria-label'));
    expect(order.slice(0, 3).every((l) => l!.includes('2026-11-20') || l!.includes('2026-11-15'))).toBe(true);
    const tags = screen.getAllByLabelText(/^Alerts for /).map((c) => within(c).getAllByText(/^(Critical|Warning|Info)$/)[0].textContent);
    expect(tags).toEqual(['Critical', 'Critical', 'Critical', 'Warning', 'Warning', 'Info']);
  });

  it('links each alert to its case or overlap group', async () => {
    renderAs();
    expect(await screen.findByRole('link', { name: 'Open RB/2026/00079' })).toHaveAttribute('href', '/cases/104');
    expect(screen.getAllByRole('link', { name: 'Open overlap' })[0].getAttribute('href')).toMatch(/^\/overlaps\/\d+$/);
  });

  it('marking an alert read updates the page and the bell count', async () => {
    const user = userEvent.setup();
    renderAs();
    await screen.findByRole('button', { name: `Alerts, ${unreadFixtures} unread` });
    const buttons = await screen.findAllByRole('button', { name: 'Mark as read' });
    expect(buttons).toHaveLength(unreadFixtures);
    await user.click(buttons[0]);
    expect(await screen.findByRole('button', { name: `Alerts, ${unreadFixtures - 1} unread` })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mark as read' })).toHaveLength(unreadFixtures - 1);
  });

  it('marking all read clears the bell and disables the button', async () => {
    const user = userEvent.setup();
    renderAs();
    await screen.findByRole('button', { name: `Alerts, ${unreadFixtures} unread` });
    await user.click(await screen.findByRole('button', { name: 'Mark all as read' }));
    expect(await screen.findByRole('button', { name: 'Alerts, none unread' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mark all as read/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Mark as read' })).toBeNull();
  });

  it('has an empty state for someone with no alerts', async () => {
    renderAs('pgrc_head');
    expect(await screen.findByText('No alerts')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Alerts, none unread' })).toBeInTheDocument();
  });

  it('shows the error with a retry when the list fails', async () => {
    const get = client.get.bind(client);
    vi.spyOn(client, 'get').mockImplementation(((url: string, ...rest: unknown[]) =>
      url === '/alerts' ? Promise.reject(new Error('Alert service down')) : (get as (...a: unknown[]) => unknown)(url, ...rest)) as typeof client.get);
    renderAs();
    expect((await screen.findAllByText('Alert service down')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
  });

  it('renders API text as text', async () => {
    const get = client.get.bind(client);
    vi.spyOn(client, 'get').mockImplementation(((url: string, config?: { params?: { limit?: number } }, ...rest: unknown[]) =>
      url === '/alerts' && config?.params?.limit === 100
        ? Promise.resolve({ data: { success: true, data: [alert({ title: '<b>bold</b>', body: '<script>x</script>' })], pagination: { total: 1, page: 1, limit: 100, total_pages: 1 } } })
        : (get as (...a: unknown[]) => unknown)(url, config, ...rest)) as typeof client.get);
    renderAs();
    expect(await screen.findByText('<b>bold</b>')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });
});

describe('Alerts page with more alerts than one API page (Issue #50)', () => {
  beforeAll(() => {
    attachMockAdapter(client, { latencyMs: [0, 0] });
  });
  afterEach(() => {
    tokenStore.clear();
    vi.restoreAllMocks();
  });

  it('fetches several pages and says when it is showing only the newest', async () => {
    tokenStore.set(fixtures.login.rb_head.data.access_token);
    const make = (from: number, n: number) => Array.from({ length: n }, (_, i) => alert({ id: from + i, permanent_id: `P${from + i}`, institution_name: `Inst ${from + i}`, title: `Alert ${from + i}`, created_at: '2026-11-20T09:00:00Z' }));
    const get = client.get.bind(client);
    const pages: number[] = [];
    vi.spyOn(client, 'get').mockImplementation(((url: string, config?: { params?: { page?: number; limit?: number; unread_only?: boolean } }, ...rest: unknown[]) => {
      if (url === '/alerts' && config?.params?.limit === 100) {
        const page = config.params.page ?? 1;
        pages.push(page);
        return Promise.resolve({ data: { success: true, data: make(1000 + page * 100, 100), pagination: { total: 750, page, limit: 100, total_pages: 8 } } });
      }
      return (get as (...a: unknown[]) => unknown)(url, config, ...rest);
    }) as typeof client.get);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <AlertsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Showing the newest 500 of 750 alerts/)).toBeInTheDocument();
    expect(pages).toEqual([1, 2, 3, 4, 5]); // and no more
  });
});
