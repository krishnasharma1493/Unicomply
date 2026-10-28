import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthProvider';
import { tokenStore } from '../auth/tokenStore';
import { ageingUrl, casesUrl, KPI_QUERY, workloadUrl } from '../features/dashboard/drilldown';
import { client } from '../lib/api/client';
import { attachMockAdapter } from '../lib/api/mock';
import { fixtures, type Persona } from '../lib/api/mock/fixtures';
import { resetWorld } from '../lib/api/mock/state';
import { DashboardPage } from '../pages/DashboardPage';

describe('drill-down URLs', () => {
  it('maps every KPI to the filter that selects exactly the cases it counts', () => {
    expect(Object.keys(KPI_QUERY)).toEqual(['total', 'pending', 'under_process', 'disposed', 'transferred', 'escalated', 'beyond_sla', 'open_overlaps']);
    expect(casesUrl(KPI_QUERY.total)).toBe('/cases');
    expect(casesUrl(KPI_QUERY.under_process)).toBe('/cases?status=under_process,interim_reply');
    expect(casesUrl(KPI_QUERY.beyond_sla)).toBe('/cases?beyond_sla=true');
    expect(casesUrl(KPI_QUERY.open_overlaps)).toBe('/overlaps');
  });
  it('opens a bureau, and an age bucket as a received-date range', () => {
    expect(workloadUrl(2)).toBe('/cases?pending=true&bureau_id=2');
    expect(ageingUrl({ min_days: 8, max_days: 14 }, '2026-11-20')).toBe('/cases?pending=true&from=2026-11-06&to=2026-11-12');
    expect(ageingUrl({ min_days: 0, max_days: 7 }, '2026-11-20')).toBe('/cases?pending=true&from=2026-11-13&to=2026-11-20');
    expect(ageingUrl({ min_days: 46, max_days: null }, '2026-11-20')).toBe('/cases?pending=true&to=2026-10-05');
  });
});

describe('Dashboard on the mock API (Issue #30)', () => {
  beforeAll(() => {
    attachMockAdapter(client, { latencyMs: [0, 0] });
  });
  beforeEach(() => resetWorld());
  afterEach(() => {
    tokenStore.clear();
    vi.restoreAllMocks();
  });

  const Where = () => {
    const l = useLocation();
    return <div data-testid="where">{l.pathname + l.search}</div>;
  };
  const renderAs = (persona: Persona = 'senior') => {
    tokenStore.set(fixtures.login[persona].data.access_token);
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="*" element={<Where />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
  };
  const kpi = async (label: string) => {
    const matches = await screen.findAllByText(label);
    return matches.map((m) => m.closest('[role="button"]')).find(Boolean) as HTMLElement;
  };

  it('renders all eight KPIs with the summary numbers, and every widget', async () => {
    renderAs();
    const s = fixtures.dashboardSummary.data;
    await screen.findByRole('heading', { name: 'Dashboard' });
    const expected: [string, number][] = [
      ['Total cases', s.total], ['Pending', s.pending], ['Under process', s.under_process], ['Disposed', s.disposed],
      ['Transferred', s.transferred], ['Escalated', s.escalated], ['Beyond SLA', s.beyond_sla], ['Open overlaps', s.open_overlaps],
    ];
    for (const [label, value] of expected) {
      await within(await kpi(label)).findByText(String(value));
    }
    expect(await screen.findByText('Open cases by bureau')).toBeInTheDocument();
    expect(screen.getByText('Age of open cases')).toBeInTheDocument();
    expect(await screen.findByText('Institutions needing attention')).toBeInTheDocument();
    expect(await screen.findByText('Latest probable overlaps')).toBeInTheDocument();
    const hero = fixtures.overlaps.data.find((g) => g.tier === 'probable')!;
    const overlaps = (await screen.findByText('Latest probable overlaps')).closest('.ant-card') as HTMLElement;
    expect(await within(overlaps).findByRole('link', { name: hero.anchor_name })).toHaveAttribute('href', `/overlaps/${hero.id}`);
    const inst = fixtures.dashboardInstitutions.data[0];
    const table = (await screen.findByText('Institutions needing attention')).closest('.ant-card') as HTMLElement;
    expect(await within(table).findByRole('link', { name: inst.name })).toHaveAttribute('href', `/institutions/${inst.permanent_id}`);
  });

  it.each([
    ['Total cases', '/cases'], ['Pending', '/cases?pending=true'], ['Under process', '/cases?status=under_process,interim_reply'],
    ['Disposed', '/cases?status=disposed'], ['Transferred', '/cases?status=transferred'], ['Escalated', '/cases?status=escalated'],
    ['Beyond SLA', '/cases?beyond_sla=true'], ['Open overlaps', '/overlaps'],
  ])('clicking %s opens %s', async (label, url) => {
    const user = userEvent.setup();
    renderAs();
    await screen.findByRole('heading', { name: 'Dashboard' });
    await user.click(await kpi(label));
    expect(await screen.findByTestId('where')).toHaveTextContent(url);
  });

  it('opens the cases of a bureau from the workload chart', async () => {
    const user = userEvent.setup();
    renderAs();
    const group = await screen.findByRole('group', { name: 'Open cases by category' });
    const pgrc = fixtures.dashboardWorkload.data.find((r) => r.bureau_code === 'PGRC')!;
    await user.click(await within(await screen.findByText('Open cases by bureau').then((t) => t.closest('.ant-card') as HTMLElement)).findByRole('link', { name: `PGRC: ${pgrc.open}` }));
    expect(await screen.findByTestId('where')).toHaveTextContent(`/cases?pending=true&bureau_id=${pgrc.bureau_id}`);
    expect(group).toBeDefined();
  });

  it('opens an age bucket from the ageing chart, as a received-date range', async () => {
    const user = userEvent.setup();
    renderAs();
    const card = (await screen.findByText('Age of open cases')).closest('.ant-card') as HTMLElement;
    const bucket = fixtures.dashboardAgeing.data.find((b) => b.bucket === '8_14')!;
    await user.click(await within(card).findByRole('link', { name: `${bucket.label}: ${bucket.count}` }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/cases?pending=true&from=2026-11-06&to=2026-11-12');
  });

  it('gives a failing widget its own error state and leaves the rest working', async () => {
    const get = client.get.bind(client);
    vi.spyOn(client, 'get').mockImplementation(((url: string, ...rest: unknown[]) =>
      url === '/dashboard/workload' ? Promise.reject(new Error('Workload service down')) : (get as (...a: unknown[]) => unknown)(url, ...rest)) as typeof client.get);
    renderAs();
    expect(await screen.findByText('Workload service down')).toBeInTheDocument();
    expect(await screen.findByText('Institutions needing attention')).toBeInTheDocument();
    await within(await kpi('Total cases')).findByText(String(fixtures.dashboardSummary.data.total));
  });

  it('shows an empty state for a widget with nothing to show', async () => {
    const get = client.get.bind(client);
    vi.spyOn(client, 'get').mockImplementation(((url: string, ...rest: unknown[]) =>
      url === '/dashboard/institutions'
        ? Promise.resolve({ data: { success: true, data: [] } })
        : (get as (...a: unknown[]) => unknown)(url, ...rest)) as typeof client.get);
    renderAs();
    expect(await screen.findByText('No institutions with cases yet.')).toBeInTheDocument();
  });
});
