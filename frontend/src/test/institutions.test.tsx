import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { tokenStore } from '../auth/tokenStore';
import { searchParams } from '../features/institutions/useInstitutions';
import { client } from '../lib/api/client';
import { attachMockAdapter } from '../lib/api/mock';
import { fixtures, type Persona } from '../lib/api/mock/fixtures';
import { resetWorld } from '../lib/api/mock/state';
import { InstitutionDetailPage } from '../pages/InstitutionDetailPage';
import { InstitutionsPage } from '../pages/InstitutionsPage';

const hero = fixtures.institution360.data;
const heroName = hero.institution.name;

describe('searchParams', () => {
  it('sends only what is set', () => {
    expect(searchParams({ q: '', state: '', region: null, instType: null, page: 1 })).toEqual({ page: 1, limit: 12 });
    expect(searchParams({ q: ' VVIET ', state: 'Madhya Pradesh', region: 'central', instType: 'engineering', page: 2 })).toEqual({
      q: 'VVIET', state: 'Madhya Pradesh', region: 'central', inst_type: 'engineering', page: 2, limit: 12,
    });
  });
});

describe('Institutions on the mock API (Issue #32)', () => {
  beforeAll(() => {
    attachMockAdapter(client, { latencyMs: [0, 0] });
  });
  beforeEach(() => resetWorld());
  afterEach(() => {
    tokenStore.clear();
    vi.restoreAllMocks();
  });

  const wrap = (persona: Persona, url: string) => {
    tokenStore.set(fixtures.login[persona].data.access_token);
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/institutions" element={<InstitutionsPage />} />
            <Route path="/institutions/:pid" element={<InstitutionDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };
  const requests = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.filter(([url]) => url === '/institutions').map(([, config]) => (config as { params: Record<string, unknown> }).params);

  describe('search', () => {
    it('finds the hero institution by its acronym', async () => {
      const user = userEvent.setup();
      wrap('senior', '/institutions');
      await user.type(await screen.findByLabelText('Name or Permanent ID'), 'VVIET');
      const link = await screen.findByRole('link', { name: heroName });
      expect(link).toHaveAttribute('href', `/institutions/${hero.institution.permanent_id}`);
      await waitFor(() => expect(screen.queryByRole('link', { name: /Deccan Plateau/ })).toBeNull());
    });

    it('finds it by Permanent ID, and shows the open-case count and trust', async () => {
      const user = userEvent.setup();
      wrap('senior', '/institutions');
      await user.type(await screen.findByLabelText('Name or Permanent ID'), hero.institution.permanent_id);
      const item = (await screen.findByRole('link', { name: heroName })).closest('li') as HTMLElement;
      expect(within(item).getByText(hero.institution.permanent_id)).toBeInTheDocument();
      expect(within(item).getByText(/open case/)).toBeInTheDocument();
      expect(within(item).getByText(hero.trust!.name)).toBeInTheDocument();
    });

    it('sends the text, state, region and type as request params', async () => {
      const get = vi.spyOn(client, 'get');
      const user = userEvent.setup();
      wrap('senior', '/institutions');
      await screen.findAllByRole('link');
      await user.type(screen.getByLabelText('State'), 'Maharashtra');
      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Region' }));
      fireEvent.click((await screen.findAllByText('Western')).at(-1)!);
      await waitFor(() => expect(requests(get).at(-1)).toMatchObject({ state: 'Maharashtra', region: 'western', page: 1, limit: 12 }));
      expect(await screen.findByRole('link', { name: /Deccan Plateau/ })).toBeInTheDocument();
    });

    it('does not search on every keystroke', async () => {
      const get = vi.spyOn(client, 'get');
      const user = userEvent.setup();
      wrap('senior', '/institutions');
      await screen.findAllByRole('link');
      const before = requests(get).length;
      await user.type(screen.getByLabelText('Name or Permanent ID'), 'vindhya valley');
      await waitFor(() => expect(requests(get).at(-1)).toMatchObject({ q: 'vindhya valley' }));
      expect(requests(get).length - before).toBeLessThanOrEqual(2);
    });

    it('has an empty state and an error state', async () => {
      const user = userEvent.setup();
      wrap('senior', '/institutions');
      await user.type(await screen.findByLabelText('Name or Permanent ID'), 'zzzqqq');
      expect(await screen.findByText('No institution found')).toBeInTheDocument();
    });

    it('shows the error with a retry when the search fails', async () => {
      vi.spyOn(client, 'get').mockRejectedValueOnce(new Error('Registry unavailable'));
      wrap('senior', '/institutions');
      expect(await screen.findByText('Registry unavailable')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
    });
  });

  describe('profile', () => {
    it('shows the profile: identity, trust, counts, and the sibling institutions', async () => {
      wrap('senior', `/institutions/${hero.institution.permanent_id}`);
      expect(await screen.findByRole('heading', { name: heroName })).toBeInTheDocument();
      expect(screen.getByText(hero.institution.permanent_id)).toBeInTheDocument();
      expect(screen.getByText(hero.trust!.name)).toBeInTheDocument();
      expect(screen.getByText(`Other institutions of ${hero.trust!.name}`)).toBeInTheDocument();
      for (const sib of hero.trust_institutions) expect(screen.getByRole('link', { name: sib.name })).toHaveAttribute('href', `/institutions/${sib.permanent_id}`);
      expect(screen.getByText('Cases').closest('.uc-kpi')).toHaveTextContent(String(hero.case_counts.total));
    });

    it('lays the cases out one column per bureau', async () => {
      wrap('senior', `/institutions/${hero.institution.permanent_id}`);
      await screen.findByRole('heading', { name: heroName });
      for (const col of hero.cases_by_bureau) {
        const group = screen.getByRole('group', { name: `Cases at ${col.bureau_code}` });
        for (const c of col.cases) expect(within(group).getByText(c.case_ref)).toBeInTheDocument();
      }
    });

    it('shows the open overlap groups with the banner', async () => {
      wrap('senior', `/institutions/${hero.institution.permanent_id}`);
      await screen.findByRole('heading', { name: heroName });
      expect(screen.getByText('Potential Overlapping Cases – Coordination Required')).toBeInTheDocument();
    });

    it('lists the complaints newest first', async () => {
      wrap('senior', `/institutions/${hero.institution.permanent_id}`);
      await screen.findByRole('heading', { name: heroName });
      const card = screen.getByText('Complaint timeline').closest('.ant-card') as HTMLElement;
      const refs = within(card).getAllByText(/\/2026\//).map((n) => n.textContent);
      const received = hero.cases_by_bureau.flatMap((c) => c.cases).sort((a, b) => b.received_at.localeCompare(a.received_at)).map((c) => c.case_ref);
      expect(refs).toEqual(received);
    });

    it('shows other bureaus\' cases as summary cards only, never a description or complainant', async () => {
      wrap('rb_head', `/institutions/${hero.institution.permanent_id}`);
      await screen.findByRole('heading', { name: heroName });
      const own = screen.getAllByText('Summary only');
      expect(own.length).toBeGreaterThan(0); // the PGRC and RO cases are outside the RB head's scope
      const text = document.body.textContent ?? '';
      for (const c of fixtures.cases.data) {
        expect(text).not.toContain(c.description);
        if (c.complainant_name) expect(text).not.toContain(c.complainant_name);
      }
    });

    it('shows the API message for an unknown institution', async () => {
      wrap('senior', '/institutions/1-0000000');
      expect(await screen.findByText('Unable to load data')).toBeInTheDocument();
      expect(screen.getByText('Institution not found')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Institutions' })).toHaveAttribute('href', '/institutions');
    });
  });
});
