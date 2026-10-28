import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { tokenStore } from '../auth/tokenStore';
import { listParams } from '../features/overlaps/list/useOverlapList';
import { client } from '../lib/api/client';
import { attachMockAdapter } from '../lib/api/mock';
import { fixtures, type Persona } from '../lib/api/mock/fixtures';
import { resetWorld } from '../lib/api/mock/state';
import { OverlapCenterPage } from '../pages/OverlapCenterPage';

describe('listParams', () => {
  const base = { tab: 'probable' as const, decision: 'confirmed' as const, level: null, bureauId: null, page: 1 };
  it('maps the tabs onto tier / status', () => {
    expect(listParams(base)).toEqual({ page: 1, limit: 12, tier: 'probable', status: 'open' });
    expect(listParams({ ...base, tab: 'possible' })).toEqual({ page: 1, limit: 12, tier: 'possible', status: 'open' });
    expect(listParams({ ...base, tab: 'decided', decision: 'dismissed' })).toEqual({ page: 1, limit: 12, status: 'dismissed' });
  });
  it('adds the level and bureau filters', () => {
    expect(listParams({ ...base, level: 'trust', bureauId: 5, page: 2 })).toMatchObject({ level: 'trust', bureau_id: 5, page: 2 });
  });
});

describe('Overlap Center on the mock API (Issue #27)', () => {
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
          <OverlapCenterPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };
  const requests = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.filter(([url]) => url === '/overlaps').map(([, config]) => (config as { params: Record<string, unknown> }).params);

  it('shows the hero group under Probable with its institution, bureaus and case count', async () => {
    renderAs();
    const hero = fixtures.overlaps.data.find((g) => g.tier === 'probable')!;
    const card = await screen.findByRole('link', { name: `Overlap group: ${hero.anchor_name}` });
    expect(card).toHaveAttribute('href', `/overlaps/${hero.id}`);
    expect(card).toHaveTextContent('Probable');
    expect(card).toHaveTextContent(hero.anchor_key);
    for (const code of hero.bureau_codes) expect(card).toHaveTextContent(code);
    expect(card).toHaveTextContent(`${hero.case_count} cases`);
    expect(card).toHaveTextContent(/flagged \d+ days? ago|flagged today/);
  });

  it('changes the request when the tab, level or bureau changes', async () => {
    const get = vi.spyOn(client, 'get');
    const user = userEvent.setup();
    renderAs();
    await screen.findAllByRole('link', { name: /Overlap group:/ });
    expect(requests(get).at(-1)).toMatchObject({ tier: 'probable', status: 'open', page: 1 });

    await user.click(screen.getByRole('tab', { name: 'Possible' }));
    await waitFor(() => expect(requests(get).at(-1)).toMatchObject({ tier: 'possible', status: 'open' }));

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Level' }));
    fireEvent.click((await screen.findAllByText('Same trust')).at(-1)!); // the dropdown is the last node in the body
    await waitFor(() => expect(requests(get).at(-1)).toMatchObject({ tier: 'possible', level: 'trust' }));

    await user.click(screen.getByRole('tab', { name: 'Decided' }));
    await waitFor(() => expect(requests(get).at(-1)).toMatchObject({ status: 'confirmed' }));
    expect(requests(get).at(-1)).not.toHaveProperty('tier');
  });

  it('shows the dismissed group on the Decided tab', async () => {
    const user = userEvent.setup();
    renderAs();
    await user.click(await screen.findByRole('tab', { name: 'Decided' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Decision' }));
    fireEvent.click(await screen.findByText('Dismissed'));
    const dismissed = fixtures.overlaps.data.find((g) => g.status === 'dismissed')!;
    expect(await screen.findByRole('link', { name: `Overlap group: ${dismissed.anchor_name}` })).toHaveTextContent('Dismissed');
  });

  it('shows an empty state for a tab with nothing in it', async () => {
    const user = userEvent.setup();
    renderAs();
    await user.click(await screen.findByRole('tab', { name: 'Decided' }));
    expect(await screen.findByText('No overlap groups with this decision yet.')).toBeInTheDocument();
  });

  it('shows the error with a retry when the request fails', async () => {
    vi.spyOn(client, 'get').mockRejectedValueOnce(new Error('Server unreachable'));
    renderAs();
    expect(await screen.findByText('Server unreachable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
  });

  it('renders API text as text', async () => {
    const hero = fixtures.overlaps.data[0];
    vi.spyOn(client, 'get').mockResolvedValueOnce({
      data: { success: true, data: [{ ...hero, anchor_name: '<script>x</script>' }], pagination: { total: 1, page: 1, limit: 12, total_pages: 1 } },
    });
    renderAs();
    expect(await screen.findByText('<script>x</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });
});
