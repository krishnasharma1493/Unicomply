import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthProvider';
import { tokenStore } from '../auth/tokenStore';
import { describeFilters, emptyFilters, filterTokens, isFiltered, parseFilters, toParams, toSearch } from '../features/cases/listFilters';
import { client } from '../lib/api/client';
import { attachMockAdapter } from '../lib/api/mock';
import { fixtures, type Persona } from '../lib/api/mock/fixtures';
import { resetWorld } from '../lib/api/mock/state';
import { CaseDetailPage } from '../pages/CaseDetailPage';
import { CasesPage } from '../pages/CasesPage';

const meta = fixtures.meta.data;

describe('list order and the filter sentence', () => {
  it('keeps the order in the URL, and only when it is not the default', () => {
    expect(toParams(emptyFilters)).toEqual({});
    const f = parseFilters(new URLSearchParams('beyond_sla=true&sort=sla_due_asc'));
    expect(f.sort).toBe('sla_due_asc');
    expect(toSearch(f).toString()).toBe('beyond_sla=true&sort=sla_due_asc');
    expect(parseFilters(new URLSearchParams('sort=sideways')).sort).toBe('received_desc');
    expect(isFiltered({ ...emptyFilters, sort: 'sla_due_asc' })).toBe(false);
  });

  it('says what the list is in one line', () => {
    const pgrc = meta.bureaus.find((b) => b.code === 'PGRC')!;
    expect(describeFilters({ ...emptyFilters, beyondSla: true, bureauId: pgrc.id }, 52, meta)).toBe('Past SLA · PGRC · 52 cases');
    expect(describeFilters(emptyFilters, 1)).toBe('All cases in your scope · 1 case');
    expect(describeFilters({ ...emptyFilters, statuses: ['received', 'escalated'], from: '2026-11-01' })).toBe('Received or Escalated · Received from 01 Nov 2026');
  });

  it('turns each filter into a token that removes only itself', () => {
    const f = { ...emptyFilters, beyondSla: true, pending: true, page: 3 };
    const tokens = filterTokens(f, meta);
    expect(tokens.map((t) => t.label)).toEqual(['Past SLA', 'Open']);
    expect(tokens[0].without).toMatchObject({ beyondSla: null, pending: true, page: 1 });
  });
});

const Where = () => {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
};

function renderAt(url: string, persona: Persona = 'pgrc_head') {
  tokenStore.set(fixtures.login[persona].data.access_token);
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/cases" element={<CasesPage />}>
              <Route path=":id" element={<CaseDetailPage />} />
            </Route>
            <Route path="/cases/new" element={<h1>Register a case</h1>} />
          </Routes>
          <Where />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const realMatchMedia = window.matchMedia;
const setWidth = (wide: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: wide && query === '(min-width: 1280px)',
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
};

describe('Cases split view (>= 1280 px)', () => {
  beforeAll(() => {
    attachMockAdapter(client, { latencyMs: [0, 0] });
  });
  beforeEach(() => {
    resetWorld();
    setWidth(true);
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    tokenStore.clear();
  });

  const rowFor = async (ref: string) => (await screen.findByText(ref, { selector: '.uc-split-row .uc-ref' })).closest('a') as HTMLAnchorElement;

  it('shows the list and the selected case side by side, keeping the filters in the URL', async () => {
    const user = userEvent.setup();
    renderAt('/cases?pending=true');
    expect(await screen.findByRole('heading', { level: 1, name: 'Cases' })).toBeInTheDocument();
    expect(await screen.findByText('Choose a case from the list.')).toBeInTheDocument();
    await user.click(await rowFor('PGRC/2026/00412'));
    expect(await screen.findByRole('heading', { level: 1, name: 'PGRC/2026/00412' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/cases/101?pending=true');
    expect(await rowFor('PGRC/2026/00412')).toHaveAttribute('aria-current', 'page');
    // The list is still there, with only one h1 on the page.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(await rowFor('PGRC/2026/00431')).toBeInTheDocument();
  });

  it('opens a deep link beside the list; /cases/new is still the intake page', async () => {
    renderAt('/cases/101');
    expect(await screen.findByRole('heading', { level: 1, name: 'PGRC/2026/00412' })).toBeInTheDocument();
    expect(await rowFor('PGRC/2026/00412')).toHaveAttribute('aria-current', 'page');
  });

  it('J/K and the arrow keys move through the list, Enter opens, Escape comes back', async () => {
    const user = userEvent.setup();
    renderAt('/cases');
    await rowFor('PGRC/2026/00412');
    const links = within(screen.getByRole('list', { name: 'Cases' })).getAllByRole('link');
    expect(links.length).toBeGreaterThan(2);
    act(() => document.body.focus());
    await user.keyboard('j');
    expect(links[0]).toHaveFocus();
    await user.keyboard('j');
    expect(links[1]).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(links[2]).toHaveFocus();
    await user.keyboard('k');
    expect(links[1]).toHaveFocus();
    expect(links[1]).toHaveAttribute('tabindex', '0');
    expect(links[0]).toHaveAttribute('tabindex', '-1');
    await user.keyboard('{Enter}');
    const id = links[1].getAttribute('href')!.split('/').pop();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/cases/${id}`));
    const heading = await screen.findByRole('heading', { level: 1, name: /\/2026\// });
    // Focus somewhere in the open case, then Escape.
    act(() => within(heading.closest('.uc-split-detail') as HTMLElement).getAllByRole('button')[0].focus());
    await user.keyboard('{Escape}');
    expect(within(screen.getByRole('list', { name: 'Cases' })).getAllByRole('link')[1]).toHaveFocus();
  });

  it('writes the sentence from the filters; a token removes its filter', async () => {
    const user = userEvent.setup();
    renderAt('/cases?beyond_sla=true&pending=true');
    await waitFor(() => expect(document.querySelector('.uc-list-bar [role="status"]')).toHaveTextContent(/^Past SLA · Open · \d+ cases?$/));
    expect(screen.getByRole('button', { name: 'Filters (2)' })).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByRole('button', { name: 'Remove filter: Past SLA' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/cases?pending=true'));
  });

  it('sorts by due date from the list and keeps it in the URL', async () => {
    renderAt('/cases');
    await rowFor('PGRC/2026/00412');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Sort' }));
    fireEvent.click(await screen.findByText('Due soonest', { selector: '.ant-select-item-option-content' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/cases?sort=sla_due_asc'));
  });
});

describe('Cases below 1280 px', () => {
  beforeAll(() => {
    attachMockAdapter(client, { latencyMs: [0, 0] });
  });
  beforeEach(() => {
    resetWorld();
    setWidth(false);
  });
  afterEach(() => tokenStore.clear());

  it('opens a case full page; back returns to the same list, and Previous / Next step through it', async () => {
    const user = userEvent.setup();
    renderAt('/cases?pending=true&sort=sla_due_asc');
    const row = (await screen.findByRole('link', { name: 'PGRC/2026/00412' })).closest('tr') as HTMLElement;
    await user.click(within(row).getByText('Day 19 of 21'));
    expect(await screen.findByRole('heading', { level: 1, name: 'PGRC/2026/00412' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull(); // the list gave way to the case
    expect(screen.getByRole('link', { name: 'Back to the list' })).toHaveAttribute('href', '/cases?pending=true&sort=sla_due_asc');
    const steps = screen.getByRole('navigation', { name: 'Cases in this list' });
    await user.click(within(steps).getByRole('link', { name: /Next case/ }));
    await waitFor(() => expect(screen.queryByRole('heading', { level: 1, name: 'PGRC/2026/00412' })).toBeNull());
    expect(await screen.findByRole('heading', { level: 1, name: /\/2026\// })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Cases in this list' })).getByRole('link', { name: /Previous case/ })).toBeInTheDocument();
  });

  it('a deep link has the plain way back', async () => {
    renderAt('/cases/101');
    expect(await screen.findByRole('heading', { level: 1, name: 'PGRC/2026/00412' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All cases' })).toHaveAttribute('href', '/cases');
    expect(screen.queryByRole('navigation', { name: 'Cases in this list' })).toBeNull();
  });
});
