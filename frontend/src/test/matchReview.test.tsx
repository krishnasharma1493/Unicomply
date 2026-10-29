import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { tokenStore } from '../auth/tokenStore';
import { client } from '../lib/api/client';
import { attachMockAdapter } from '../lib/api/mock';
import { fixtures, type Persona } from '../lib/api/mock/fixtures';
import { resetWorld } from '../lib/api/mock/state';
import { MatchReviewPage } from '../pages/MatchReviewPage';

describe('Match Review on the mock API (Issue #29)', () => {
  beforeAll(() => {
    attachMockAdapter(client, { latencyMs: [0, 0] });
  });
  beforeEach(() => resetWorld());
  afterEach(() => {
    tokenStore.clear();
    vi.restoreAllMocks();
  });

  const renderAs = (persona: Persona = 'intake') => {
    tokenStore.set(fixtures.login[persona].data.access_token);
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <MatchReviewPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };
  const queue = () => screen.findByRole('region', { name: 'Review queue' });
  const items = [...fixtures.reviews.data];

  it('lists the pending reviews with the complaint text, location, case ref and date', async () => {
    renderAs();
    const list = await queue();
    for (const r of items) {
      expect(within(list).getByText(r.raw_institution_text)).toBeInTheDocument();
      expect(within(list).getByText(new RegExp(r.case_ref))).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { level: 3, name: items[0].raw_institution_text })).toBeInTheDocument(); // first is open
    expect(screen.getByRole('list', { name: 'Candidate institutions' })).toBeInTheDocument();
  });

  it('switches review from the queue, with the keyboard too', async () => {
    const user = userEvent.setup();
    renderAs();
    await queue();
    await user.click(screen.getByRole('button', { name: `Review ${items[1].case_ref}` }));
    expect(await screen.findByRole('heading', { level: 3, name: items[1].raw_institution_text })).toBeInTheDocument();
    screen.getByRole('button', { name: `Review ${items[0].case_ref}` }).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 3, name: items[0].raw_institution_text })).toBeInTheDocument();
  });

  it('links the case to a picked candidate: the item leaves the queue and the confirmation links to the case', async () => {
    const user = userEvent.setup();
    renderAs();
    await queue();
    await user.click(screen.getByRole('button', { name: `Review ${items[1].case_ref}` }));
    const best = items[1].candidates[0];
    await user.click(await screen.findByRole('button', { name: `Select ${best.name}` }));
    await user.click(screen.getByRole('button', { name: `Link this case to ${best.name}` }));
    expect(await screen.findByText(new RegExp(`${items[1].case_ref} is now linked to ${best.name}`))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Open ${items[1].case_ref}` })).toHaveAttribute('href', `/cases/${items[1].case_id}`);
    await waitFor(() => expect(screen.queryByRole('button', { name: `Review ${items[1].case_ref}` })).toBeNull());
    expect(screen.getByRole('button', { name: `Review ${items[0].case_ref}` })).toBeInTheDocument();
  });

  it('needs a choice before linking', async () => {
    renderAs();
    await queue();
    expect(screen.getByRole('button', { name: 'Choose an institution to link' })).toBeDisabled();
  });

  it('finds an institution through the registry search and links it', async () => {
    const user = userEvent.setup();
    renderAs();
    await queue();
    await user.type(screen.getByLabelText('Search the registry'), 'Sinhgad');
    const sinhgad = fixtures.institutions.data.find((i) => i.name.startsWith('Sinhgad'))!;
    await user.click(await screen.findByRole('button', { name: `Pick ${sinhgad.name}` }));
    await user.click(screen.getByRole('button', { name: `Link this case to ${sinhgad.name}` }));
    expect(await screen.findByText(new RegExp(`is now linked to ${sinhgad.name}`))).toBeInTheDocument();
  });

  it('says so when the registry search finds nothing', async () => {
    const user = userEvent.setup();
    renderAs();
    await queue();
    await user.type(screen.getByLabelText('Search the registry'), 'zzzzqq');
    expect(await screen.findByText('No institution matches that search.')).toBeInTheDocument();
  });

  it('marks a case as not in the registry', async () => {
    const user = userEvent.setup();
    renderAs();
    await queue();
    await user.click(screen.getByRole('button', { name: 'Not in the registry' }));
    expect(await screen.findByText(new RegExp(`${items[0].case_ref} was marked as not in the registry`))).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: `Review ${items[0].case_ref}` })).toBeNull());
  });

  it('handles ALREADY_DECIDED: shows the message and drops the item from the queue', async () => {
    const user = userEvent.setup();
    renderAs();
    await queue();
    await client.post(`/reviews/${items[0].id}/decide`, { none: true }, {
      headers: { Authorization: `Bearer ${fixtures.login.intake.data.access_token}` },
    });
    await user.click(screen.getByRole('button', { name: 'Not in the registry' }));
    expect(await screen.findByText(/already been decided/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: `Review ${items[0].case_ref}` })).toBeNull());
  });

  it('shows an empty state once the queue is cleared', async () => {
    const user = userEvent.setup();
    renderAs();
    await queue();
    for (const r of items) {
      await user.click(await screen.findByRole('button', { name: 'Not in the registry' }));
      await waitFor(() => expect(screen.queryByRole('button', { name: `Review ${r.case_ref}` })).toBeNull());
    }
    expect(await screen.findByText('The review queue is empty.')).toBeInTheDocument();
  });

  it('shows the API message to a role that cannot see the queue', async () => {
    renderAs('rb_head');
    expect(await screen.findByText('Unable to load data')).toBeInTheDocument();
    expect(screen.getByText(fixtures.errors.forbidden.error.message)).toBeInTheDocument();
  });

  it('renders API text as text, not HTML', async () => {
    vi.spyOn(client, 'get').mockResolvedValueOnce({
      data: { success: true, data: [{ ...items[0], raw_institution_text: '<b>bold</b> college' }], pagination: { total: 1, page: 1, limit: 100, total_pages: 1 } },
    });
    renderAs();
    expect(await screen.findAllByText('<b>bold</b> college')).not.toHaveLength(0);
    expect(document.querySelector('b')).toBeNull();
  });
});
