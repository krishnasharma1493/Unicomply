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
  const heading = () => screen.findByRole('heading', { name: /Vindhya Valley Institute of Engineering/ });

  it('shows the banner, the cases grouped by issue and the evidence per pair', async () => {
    renderAs('pgrc_head');
    await heading();
    expect(screen.getByText('Potential Overlapping Cases – Coordination Required')).toBeInTheDocument();
    expect(screen.getByText('Issue 1: Certificates and fee refund')).toBeInTheDocument();
    expect(screen.getByText('Issue 2: Faculty shortage')).toBeInTheDocument();
    for (const ref of ['PGRC/2026/00412', 'RB/2026/00087', 'RO-CRO/2026/00133']) expect(screen.getAllByText(ref).length).toBeGreaterThan(0);
    // One evidence column per pair, each with its own labelled score bar.
    expect(screen.getAllByRole('progressbar', { name: /^Pair score \d+ out of 100$/ })).toHaveLength(fixtures.overlapDetail.data.pairs.length);
    expect(screen.getByRole('columnheader', { name: '00412 and 00087' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm overlap' })).toBeInTheDocument();
  });

  it('confirms with a coordinator and moves the group to Confirmed, showing the coordinator', async () => {
    const user = userEvent.setup();
    renderAs('pgrc_head');
    await heading();
    await user.click(screen.getByRole('button', { name: 'Confirm overlap' }));
    const dialog = await screen.findByRole('dialog');
    // The officer on the oldest case is suggested; clearing it brings the validation back.
    expect(within(dialog).getByTitle('Sunita Mishra (PGRC)')).toBeInTheDocument();
    fireEvent.mouseDown(dialog.querySelector('.ant-select-clear')!);
    fireEvent.click(dialog.querySelector('.ant-select-clear')!);
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(await within(dialog).findAllByText('Choose a coordinator')).not.toHaveLength(0);
    expect(within(dialog).getByRole('combobox', { name: 'Coordinator' })).toHaveAttribute('aria-invalid', 'true');
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

  it('opens Confirm inline, closes on Escape and gives focus back to the button', async () => {
    const user = userEvent.setup();
    renderAs('pgrc_head');
    await heading();
    const trigger = screen.getByRole('button', { name: 'Confirm overlap' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Confirm overlap' });
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: 'Coordinator' })).toHaveFocus());
    fireEvent.keyDown(within(dialog).getByLabelText('Remark'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('gives each eligible coordinator a bureau and a count of their cases in this group', async () => {
    renderAs('pgrc_head');
    await heading();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm overlap' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: 'Coordinator' }));
    const option = (await screen.findAllByText('Vikram Choudhary (RB)')).at(-1)!.closest('.ov-officer') as HTMLElement;
    expect(option).toHaveTextContent('1 case in this group');
    const other = (await screen.findAllByText('Pooja Saxena (RB)')).at(-1)!.closest('.ov-officer') as HTMLElement;
    expect(other).toHaveTextContent('no case in this group');
    expect(screen.queryByText(/Arvind Kulkarni/)).toBeNull(); // AB has no case here
  });

  it('settles at once after confirming: says who was alerted, and announces it', async () => {
    const user = userEvent.setup();
    renderAs('pgrc_head');
    await heading();
    await user.click(screen.getByRole('button', { name: 'Confirm overlap' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' })); // the suggested coordinator
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('The PGRC and RB heads and the Regional Office have been alerted.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Overlap confirmed\. Coordinator: Sunita Mishra\./);
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
    expect(screen.getByRole('link', { name: 'Overlap Center' })).toHaveAttribute('href', '/overlaps');
  });
});
