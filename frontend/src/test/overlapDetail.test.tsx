import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthProvider';
import { tokenStore } from '../auth/tokenStore';
import { client } from '../lib/api/client';
import { attachMockAdapter } from '../lib/api/mock';
import { fixtures, type Persona } from '../lib/api/mock/fixtures';
import { resetWorld } from '../lib/api/mock/state';
import { OverlapDetailPage } from '../pages/OverlapDetailPage';

describe('Overlap detail on the mock API (Issue #28)', () => {
  beforeAll(() => {
    attachMockAdapter(client, { latencyMs: [0, 0] });
  });
  beforeEach(() => resetWorld());
  afterEach(() => tokenStore.clear());

  function renderAs(persona: Persona, id = 1) {
    tokenStore.set(fixtures.login[persona].data.access_token);
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AuthProvider>
          <MemoryRouter initialEntries={[`/overlaps/${id}`]}>
            <Routes>
              <Route path="/overlaps/:id" element={<OverlapDetailPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
  }
  const heading = () => screen.findByRole('heading', { name: /Maharaja Agrasen Institute of Technology/ });

  it('shows the banner, the cases grouped by issue and the evidence per pair', async () => {
    renderAs('pgrc_head');
    await heading();
    expect(screen.getByText('Potential Overlapping Cases – Coordination Required')).toBeInTheDocument();
    expect(screen.getByText('Issue 1: Certificates and fee refund')).toBeInTheDocument();
    expect(screen.getByText('Issue 2: Faculty shortage')).toBeInTheDocument();
    for (const ref of ['PGRC/2026/00412', 'RB/2026/00087', 'RO-NWRO/2026/00133']) expect(screen.getAllByText(ref).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pair score').length).toBe(fixtures.overlapDetail.data.pairs.length);
    expect(screen.getByRole('button', { name: 'Confirm overlap' })).toBeInTheDocument();
  });

  it('confirms with a coordinator and moves the group to Confirmed, showing the coordinator', async () => {
    const user = userEvent.setup();
    renderAs('pgrc_head');
    await heading();
    await user.click(screen.getByRole('button', { name: 'Confirm overlap' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(await within(dialog).findAllByText('Choose a coordinator')).not.toHaveLength(0);
    fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: 'Coordinator' }));
    fireEvent.click(await screen.findByText('Sunita Mishra (PGRC)'));
    await user.type(within(dialog).getByLabelText('Remark'), 'PGRC will lead');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText(/Confirmed · Coordinator: Sunita Mishra/)).toBeInTheDocument();
    expect(screen.getByText('PGRC will lead')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm overlap' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument(); // a confirmed group can still be resolved
  });

  it('will not dismiss without a remark, then dismisses with one', async () => {
    const user = userEvent.setup();
    renderAs('senior');
    await heading();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Dismiss' }));
    expect(await within(dialog).findByText('A remark is required to dismiss an overlap')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument(); // nothing was sent
    await user.type(within(dialog).getByLabelText('Remark'), 'Different matters');
    await user.click(within(dialog).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText(/Dismissed on/)).toBeInTheDocument();
    expect(screen.getByText('Different matters')).toBeInTheDocument();
  });

  it('handles ALREADY_DECIDED when someone else decided first, and shows the result', async () => {
    const user = userEvent.setup();
    renderAs('pgrc_head');
    await heading();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Remark'), 'Not related');
    // meanwhile the senior officer dismisses it
    await client.post('/overlaps/1/decision', { decision: 'dismiss', remark: 'Dismissed by senior' }, {
      headers: { Authorization: `Bearer ${fixtures.login.senior.data.access_token}` },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Dismiss' }));
    expect(await within(dialog).findByText(/already been dismissed/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText(/Dismissed on/)).toBeInTheDocument();
    expect(screen.getByText('Dismissed by senior')).toBeInTheDocument();
  });

  it('gives an intake operator the group but no decision buttons', async () => {
    renderAs('intake');
    await heading();
    expect(screen.getByText('Only bureau heads and senior management decide overlaps.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm overlap' })).toBeNull();
  });

  it('shows the API message for a group outside the viewer\'s scope', async () => {
    renderAs('rb_head', 4);
    expect(await screen.findByText('Unable to load data')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Overlap Center' })).toHaveAttribute('href', '/overlaps');
  });
});
