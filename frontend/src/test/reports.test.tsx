import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { tokenStore } from '../auth/tokenStore';
import { chartSpec, formatCell } from '../features/reports/chartSpec';
import { reportParams } from '../features/reports/useReport';
import { REPORT_KINDS, REPORT_KIND_LABELS, type ReportKind } from '../lib/api/enums';
import { client } from '../lib/api/client';
import { attachMockAdapter } from '../lib/api/mock';
import { fixtures, type Persona } from '../lib/api/mock/fixtures';
import { resetWorld } from '../lib/api/mock/state';
import type { AnyReport } from '../lib/api/types';
import { ReportsPage } from '../pages/ReportsPage';

const report = (kind: ReportKind) => fixtures.reports[kind].data as unknown as AnyReport;

describe('chartSpec', () => {
  it.each(REPORT_KINDS)('%s: every plotted series and the category exist in the data', (kind) => {
    const spec = chartSpec(report(kind));
    expect(spec.data.length).toBeGreaterThan(0);
    for (const row of spec.data) {
      expect(row).toHaveProperty(spec.categoryKey);
      for (const s of spec.series) expect(row).toHaveProperty(s.key);
    }
  });
  it('plots rates as percentages and caps the institution chart at the ten busiest', () => {
    expect(chartSpec(report('disposal_rate')).percent).toBe(true);
    expect(chartSpec(report('reopen_rate')).percent).toBe(true);
    const many = { ...report('institution'), rows: Array.from({ length: 15 }, (_, i) => ({ ...(report('institution').rows[0] as object), name: `I${i}`, total: i })) } as unknown as AnyReport;
    expect(chartSpec(many).data).toHaveLength(10);
    expect(chartSpec(many).data[0].name).toBe('I14');
  });
});

describe('formatCell', () => {
  it('shows rates as percentages and gaps as a dash', () => {
    expect(formatCell('disposal_rate', 0.167)).toBe('16.7%');
    expect(formatCell('reopen_rate', null)).toBe('—');
    expect(formatCell('open', 0)).toBe('0');
    expect(formatCell('name', 'Maharaja')).toBe('Maharaja');
  });
});

describe('reportParams', () => {
  it('sends group_by only for the periodic report', () => {
    expect(reportParams({ kind: 'bureau', from: '2026-09-01', to: '2026-11-20', grouping: 'quarter' })).toEqual({ from: '2026-09-01', to: '2026-11-20' });
    expect(reportParams({ kind: 'periodic', from: '2026-09-01', to: '2026-11-20', grouping: 'quarter' })).toEqual({ from: '2026-09-01', to: '2026-11-20', group_by: 'quarter' });
  });
});

describe('Reports on the mock API (Issue #34)', () => {
  beforeAll(() => {
    attachMockAdapter(client, { latencyMs: [0, 0] });
  });
  beforeEach(() => resetWorld());
  afterEach(() => {
    tokenStore.clear();
    vi.restoreAllMocks();
  });

  const renderAs = (persona: Persona = 'senior') => {
    tokenStore.set(fixtures.login[persona].data.access_token);
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <ReportsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };
  const choose = async (label: string) => {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Report' }));
    fireEvent.click((await screen.findAllByText(label)).at(-1)!);
  };
  const requests = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.filter(([url]) => String(url).startsWith('/reports/')).map(([url, config]) => ({ url, params: (config as { params: Record<string, unknown> }).params }));

  it('renders the bureau report by default: a header per column and the totals', async () => {
    renderAs();
    const data = report('bureau');
    for (const c of data.columns) expect(await screen.findByRole('columnheader', { name: c.label })).toBeInTheDocument();
    expect(screen.getAllByText('Total').length).toBeGreaterThanOrEqual(2); // the column and the totals row
    expect(screen.getByText(/Bureau-wise, cases received/)).toBeInTheDocument();
  });

  it.each(REPORT_KINDS.filter((k) => k !== 'bureau'))('renders the %s report', async (kind) => {
    renderAs();
    await screen.findByRole('columnheader', { name: report('bureau').columns[0].label });
    await choose(REPORT_KIND_LABELS[kind]);
    for (const c of report(kind).columns) expect(await screen.findByRole('columnheader', { name: c.label })).toBeInTheDocument();
    expect(await screen.findByText(new RegExp(`${REPORT_KIND_LABELS[kind]}, cases received`))).toBeInTheDocument();
  });

  it('shows rates as percentages in the table', async () => {
    renderAs();
    await screen.findByRole('columnheader', { name: report('bureau').columns[0].label });
    await choose('Disposal rate');
    expect(await screen.findByText('16.7%')).toBeInTheDocument();
  });

  it('asks for the date range, and for monthly or quarterly grouping on the periodic report only', async () => {
    const get = vi.spyOn(client, 'get');
    const user = userEvent.setup();
    renderAs();
    await screen.findByRole('columnheader', { name: report('bureau').columns[0].label });
    expect(screen.queryByText('Quarterly')).toBeNull();
    expect(requests(get).at(-1)!.params).toEqual({ from: '2026-08-22', to: '2026-11-20' });
    await choose('Monthly / quarterly');
    expect(await screen.findByText('Quarterly')).toBeInTheDocument();
    await waitFor(() => expect(requests(get).at(-1)!.params).toMatchObject({ group_by: 'month' }));
    await user.click(screen.getByText('Quarterly'));
    await waitFor(() => expect(requests(get).at(-1)!.params).toMatchObject({ group_by: 'quarter' }));
  });

  it('downloads the CSV from the backend, not from what is on screen', async () => {
    const saved: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const get = vi.spyOn(client, 'get');
    const user = userEvent.setup();
    renderAs();
    await screen.findByRole('columnheader', { name: report('bureau').columns[0].label });
    const before = requests(get).length;
    await user.click(screen.getByRole('button', { name: /Download CSV/ }));
    await waitFor(() => expect(saved).toHaveLength(1));
    const csvCall = requests(get).slice(before).find((r) => r.params.format === 'csv')!;
    expect(csvCall.url).toBe('/reports/bureau');
    expect(csvCall.params).toMatchObject({ format: 'csv', from: '2026-08-22', to: '2026-11-20' });
    expect(saved[0]).toBe('unicomply-bureau-2026-08-22-2026-11-20.csv');
    expect(click).toHaveBeenCalled();
  });

  it('says so when the CSV cannot be downloaded', async () => {
    const get = client.get.bind(client);
    vi.spyOn(client, 'get').mockImplementation(((url: string, config?: { params?: { format?: string } }, ...rest: unknown[]) =>
      config?.params?.format === 'csv' ? Promise.reject(new Error('Export failed')) : (get as (...a: unknown[]) => unknown)(url, config, ...rest)) as typeof client.get);
    const user = userEvent.setup();
    renderAs();
    await screen.findByRole('columnheader', { name: report('bureau').columns[0].label });
    await user.click(screen.getByRole('button', { name: /Download CSV/ }));
    expect(await screen.findByText(/The CSV could not be downloaded: /)).toBeInTheDocument();
  });

  it('shows the API message to a role that may not see reports', async () => {
    renderAs('intake');
    expect(await screen.findByText('Unable to load data')).toBeInTheDocument();
    expect(screen.getByText(fixtures.errors.forbidden.error.message)).toBeInTheDocument();
  });

  it('shows the error with a retry when a report fails', async () => {
    const get = client.get.bind(client);
    vi.spyOn(client, 'get').mockImplementation(((url: string, ...rest: unknown[]) =>
      String(url).startsWith('/reports/') ? Promise.reject(new Error('Report engine down')) : (get as (...a: unknown[]) => unknown)(url, ...rest)) as typeof client.get);
    renderAs();
    expect(await screen.findByText('Report engine down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
  });

  it('renders API text as text', async () => {
    const get = client.get.bind(client);
    vi.spyOn(client, 'get').mockImplementation(((url: string, ...rest: unknown[]) => {
      if (url !== '/reports/bureau') return (get as (...a: unknown[]) => unknown)(url, ...rest);
      const data = structuredClone(report('bureau')) as unknown as { rows: { bureau_name: string }[] };
      data.rows[0].bureau_name = '<b>bold</b>';
      return Promise.resolve({ data: { success: true, data } });
    }) as typeof client.get);
    renderAs();
    expect(await screen.findByText('<b>bold</b>')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });
});
