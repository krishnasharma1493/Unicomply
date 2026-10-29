import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { tokenStore } from '../auth/tokenStore';
import { emptyFilters, isFiltered, parseFilters, toParams, toRequest, toSearch } from '../features/cases/listFilters';
import { casesUrl, KPI_QUERY } from '../features/dashboard/drilldown';
import { client } from '../lib/api/client';
import { attachMockAdapter } from '../lib/api/mock';
import { fixtures, type Persona } from '../lib/api/mock/fixtures';
import { resetWorld } from '../lib/api/mock/state';
import { CasesPage } from '../pages/CasesPage';

const parse = (q: string) => parseFilters(new URLSearchParams(q));

describe('case filters <-> URL', () => {
  it('round-trips every filter', () => {
    const q = 'q=maharaja&permanent_id=1-43655981521&case_ref=RB%2F2026%2F00087&bureau_id=2&region=central&category=ragging&status=under_process%2Cinterim_reply&from=2026-09-01&to=2026-11-20&beyond_sla=true&in_overlap=false&pending=true&page=3&limit=50';
    const f = parse(q);
    expect(f).toMatchObject({ q: 'maharaja', permanentId: '1-43655981521', bureauId: 2, region: 'central', category: 'ragging', statuses: ['under_process', 'interim_reply'], beyondSla: true, inOverlap: false, pending: true, page: 3, limit: 50 });
    expect(Object.fromEntries(toSearch(f))).toEqual(Object.fromEntries(new URLSearchParams(q)));
  });
  it('sends only what is set, and always page and limit in the request', () => {
    expect(toParams(emptyFilters)).toEqual({});
    expect(toRequest(emptyFilters)).toEqual({ page: 1, limit: 20 });
    expect(isFiltered(emptyFilters)).toBe(false);
    expect(isFiltered({ ...emptyFilters, page: 4 })).toBe(false);
    expect(isFiltered({ ...emptyFilters, caseRef: 'x' })).toBe(true);
  });
  it('ignores malformed values instead of sending them to the API', () => {
    expect(parse('bureau_id=abc&region=mars&status=nonsense,disposed&from=yesterday&beyond_sla=maybe&page=-2&limit=9999')).toMatchObject({
      bureauId: null, region: null, statuses: ['disposed'], from: '', beyondSla: null, page: 1, limit: 100,
    });
  });
  it('understands every link the dashboard produces', () => {
    for (const query of Object.values(KPI_QUERY).filter((q) => !q.startsWith('@'))) {  // '@…' is a link to another page
      const url = casesUrl(query);
      expect(Object.fromEntries(toSearch(parse(url.split('?')[1] ?? '')))).toEqual(Object.fromEntries(new URLSearchParams(query)));
    }
  });
});

describe('Cases list on the mock API (Issue #31)', () => {
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
  const renderAt = (url: string, persona: Persona = 'senior') => {
    tokenStore.set(fixtures.login[persona].data.access_token);
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/cases" element={<><CasesPage /><Where /></>} />
            <Route path="/cases/:id" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };
  // The full filter form sits behind the "Filters" disclosure; the sentence above the list shows what is applied.
  const openFilters = () => fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
  const requests = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.filter(([url]) => url === '/cases').map(([, config]) => (config as { params: Record<string, unknown> }).params);

  it('lists the cases with institution, bureau, category, status, SLA, overlap and officer', async () => {
    renderAt('/cases');
    const hero = fixtures.cases.data.find((c) => c.case_ref === 'PGRC/2026/00412')!;
    const row = (await screen.findByRole('link', { name: hero.case_ref })).closest('tr') as HTMLElement;
    expect(within(row).getByText(hero.institution_name!)).toBeInTheDocument();
    expect(within(row).getByText('PGRC')).toBeInTheDocument();
    expect(within(row).getByText('Day 19 of 21')).toBeInTheDocument();
    expect(within(row).getByText('Overlap')).toBeInTheDocument();
    expect(within(row).getByText('Sunita Mishra')).toBeInTheDocument();
  });

  it('puts every filter from the URL into the request, and into the form', async () => {
    const get = vi.spyOn(client, 'get');
    renderAt('/cases?q=maharaja&bureau_id=2&category=fee_refund&status=under_process,interim_reply&from=2026-09-01&to=2026-11-20&beyond_sla=false&in_overlap=true&pending=true&region=north_western&permanent_id=1-43655981521&case_ref=PGRC%2F2026%2F00412');
    await screen.findByRole('link', { name: 'PGRC/2026/00412' });
    openFilters();
    expect(requests(get).at(-1)).toEqual({
      q: 'maharaja', bureau_id: 2, category: 'fee_refund', status: 'under_process,interim_reply', from: '2026-09-01', to: '2026-11-20',
      beyond_sla: false, in_overlap: true, pending: true, region: 'north_western', permanent_id: '1-43655981521', case_ref: 'PGRC/2026/00412', page: 1, limit: 20,
    });
    expect(screen.getByLabelText('Institution name')).toHaveValue('maharaja');
    expect(screen.getByLabelText('Permanent ID')).toHaveValue('1-43655981521');
    expect(screen.getByLabelText('Case reference')).toHaveValue('PGRC/2026/00412');
  });

  it('searching writes the filters to the URL (so a reload keeps them) and Clear removes them', async () => {
    const user = userEvent.setup();
    renderAt('/cases');
    await screen.findByRole('link', { name: 'PGRC/2026/00412' });
    openFilters();
    await user.type(screen.getByLabelText('Institution name'), 'Sinhgad');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/cases?q=Sinhgad'));
    expect(await screen.findByRole('link', { name: 'RB/2026/00091' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('link', { name: 'PGRC/2026/00412' })).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/cases'));
    expect(await screen.findByRole('link', { name: 'PGRC/2026/00412' })).toBeInTheDocument();
  });

  it('does not search on every keystroke', async () => {
    const get = vi.spyOn(client, 'get');
    const user = userEvent.setup();
    renderAt('/cases');
    await screen.findByRole('link', { name: 'PGRC/2026/00412' });
    openFilters();
    const before = requests(get).length;
    await user.type(screen.getByLabelText('Case reference'), 'RB/2026');
    expect(requests(get).length).toBe(before);
  });

  it('filters by a dropdown and reflects it in the request', async () => {
    const get = vi.spyOn(client, 'get');
    const user = userEvent.setup();
    renderAt('/cases');
    await screen.findByRole('link', { name: 'PGRC/2026/00412' });
    openFilters();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Bureau' }));
    fireEvent.click((await screen.findAllByText('RB — Regulation Bureau')).at(-1)!);
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(requests(get).at(-1)).toMatchObject({ bureau_id: 1 }));
    expect(await screen.findByRole('link', { name: 'RB/2026/00087' })).toBeInTheDocument();
  });

  it('paginates on the server and keeps the page in the URL', async () => {
    const get = vi.spyOn(client, 'get');
    const user = userEvent.setup();
    renderAt('/cases?limit=10');
    await screen.findAllByRole('link', { name: /PGRC\/2026\// });
    expect(await screen.findByText('13 cases')).toBeInTheDocument();
    await user.click(screen.getByTitle('2'));
    await waitFor(() => expect(requests(get).at(-1)).toMatchObject({ page: 2, limit: 10 }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('page=2'));
    expect(screen.getAllByRole('link', { name: /\/2026\// }).length).toBe(3);
  });

  it('opens a case when its row is clicked', async () => {
    const user = userEvent.setup();
    renderAt('/cases');
    const row = (await screen.findByRole('link', { name: 'PGRC/2026/00412' })).closest('tr') as HTMLElement;
    await user.click(within(row).getByText('Day 19 of 21'));
    expect(await screen.findByTestId('where')).toHaveTextContent('/cases/101');
  });

  it('shows an empty state that says how to recover, and an error state with retry', async () => {
    renderAt('/cases?case_ref=NOPE%2F1');
    expect(await screen.findByText('No cases found')).toBeInTheDocument();
    expect(screen.getByText(/Widen the search or clear the filters/)).toBeInTheDocument();
  });

  it('shows the error with a retry when the request fails', async () => {
    const get = client.get.bind(client);
    vi.spyOn(client, 'get').mockImplementation(((url: string, ...rest: unknown[]) =>
      url === '/cases' ? Promise.reject(new Error('Cases service down')) : (get as (...a: unknown[]) => unknown)(url, ...rest)) as typeof client.get);
    renderAt('/cases');
    expect(await screen.findByText('Cases service down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
  });

  it('scopes the list to the viewer (the PGRC head sees PGRC cases only)', async () => {
    renderAt('/cases', 'pgrc_head');
    await screen.findByRole('link', { name: 'PGRC/2026/00412' });
    expect(screen.queryByRole('link', { name: 'RB/2026/00087' })).toBeNull();
  });
});
