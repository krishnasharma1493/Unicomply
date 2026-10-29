import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthProvider';
import { tokenStore } from '../auth/tokenStore';
import { actionSchema, toActionBody, emptyActionForm } from '../features/cases/actionSchema';
import { ALLOWED_FROM, allowedActions, canAct } from '../features/cases/workflow';
import { CASE_STATUSES } from '../lib/api/enums';
import { client } from '../lib/api/client';
import { attachMockAdapter } from '../lib/api/mock';
import { fixtures, type Persona } from '../lib/api/mock/fixtures';
import { resetWorld } from '../lib/api/mock/state';
import { CaseDetailPage } from '../pages/CaseDetailPage';

const me = (p: Persona) => fixtures.usersMe[p].data;

describe('workflow rules (PRD §4.3 / §4.2)', () => {
  it('shows nothing a status cannot do', () => {
    const head = me('pgrc_head');
    for (const status of CASE_STATUSES) {
      for (const action of allowedActions(head, { current_bureau_id: 2, status })) {
        expect(ALLOWED_FROM[action]).toContain(status);
      }
    }
    expect(allowedActions(head, { current_bureau_id: 2, status: 'disposed' })).toEqual(['remark', 'reopen']);
    expect(allowedActions(head, { current_bureau_id: 2, status: 'under_process' })).not.toContain('assign');
  });

  it('lets heads and ROs act only at their own bureau, the senior officer escalate and remark anywhere, intake never', () => {
    expect(canAct(me('pgrc_head'), { current_bureau_id: 2 }, 'dispose')).toBe(true);
    expect(canAct(me('pgrc_head'), { current_bureau_id: 1 }, 'dispose')).toBe(false);
    expect(canAct(me('ro_nw'), { current_bureau_id: 9 }, 'transfer')).toBe(true);
    expect(canAct(me('ro_nw'), { current_bureau_id: 2 }, 'transfer')).toBe(false);
    expect(allowedActions(me('senior'), { current_bureau_id: 14, status: 'under_process' })).toEqual(['remark', 'escalate']);
    expect(allowedActions(me('senior'), { current_bureau_id: 14, status: 'disposed' })).toEqual(['remark']);
    expect(allowedActions(me('intake'), { current_bureau_id: 2, status: 'received' })).toEqual([]);
  });
});

describe('action schemas mirror §4.3', () => {
  const parse = (type: Parameters<typeof actionSchema>[0], v: Partial<typeof emptyActionForm>) =>
    actionSchema(type, '2026-11-20', 2).safeParse({ ...emptyActionForm, ...v });
  const bad = (r: ReturnType<typeof parse>, field: string) => !r.success && r.error.issues.some((i) => i.path[0] === field);

  it.each(['transfer', 'escalate', 'dispose', 'reopen', 'remark'] as const)('%s needs remarks', (type) => {
    expect(bad(parse(type, { to_bureau_id: 1, outcome: 'redressed' }), 'remarks')).toBe(true);
  });
  it('assign and interim reply do not need remarks', () => {
    expect(parse('assign', { to_officer_id: 6 }).success).toBe(true);
    expect(parse('interim_reply', { expected_disposal_date: '2026-11-25' }).success).toBe(true);
  });
  it('transfer needs a different bureau', () => {
    expect(bad(parse('transfer', { remarks: 'x' }), 'to_bureau_id')).toBe(true);
    expect(bad(parse('transfer', { remarks: 'x', to_bureau_id: 2 }), 'to_bureau_id')).toBe(true);
    expect(parse('transfer', { remarks: 'x', to_bureau_id: 1 }).success).toBe(true);
  });
  it('interim reply needs a date that is not in the past', () => {
    expect(bad(parse('interim_reply', {}), 'expected_disposal_date')).toBe(true);
    expect(bad(parse('interim_reply', { expected_disposal_date: '2026-11-19' }), 'expected_disposal_date')).toBe(true);
    expect(parse('interim_reply', { expected_disposal_date: '2026-11-20' }).success).toBe(true);
  });
  it('dispose needs an outcome; assign needs an officer', () => {
    expect(bad(parse('dispose', { remarks: 'x' }), 'outcome')).toBe(true);
    expect(bad(parse('assign', {}), 'to_officer_id')).toBe(true);
  });
  it('builds the request body, confirm only for dispose', () => {
    const v = { ...emptyActionForm, remarks: ' done ', outcome: 'redressed' as const };
    expect(toActionBody('dispose', v)).toEqual({ action_type: 'dispose', remarks: 'done', outcome: 'redressed' });
    expect(toActionBody('dispose', v, true).confirm_open_overlap).toBe(true);
    expect(toActionBody('remark', v, true).confirm_open_overlap).toBeUndefined();
  });
});

describe('Case Detail page on the mock API (Issue #26)', () => {
  beforeAll(() => {
    attachMockAdapter(client, { latencyMs: [0, 0] });
  });
  beforeEach(() => resetWorld());
  afterEach(() => tokenStore.clear());

  function renderAs(persona: Persona, id: number) {
    tokenStore.set(fixtures.login[persona].data.access_token);
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AuthProvider>
          <MemoryRouter initialEntries={[`/cases/${id}`]}>
            <Routes>
              <Route path="/cases/:id" element={<CaseDetailPage />} />
              <Route path="/cases" element={<div>cases list</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
  }
  const pick = async (name: string, option: string) => {
    fireEvent.mouseDown(screen.getByRole('combobox', { name }));
    fireEvent.click(await screen.findByText(option));
  };

  it('shows the hero case: SLA day, tracking fields, overlap banner with linked cases, history', async () => {
    renderAs('pgrc_head', 101);
    expect(await screen.findByRole('heading', { name: 'PGRC/2026/00412' })).toBeInTheDocument();
    expect(screen.getByText('Day 19 of 21')).toBeInTheDocument();
    expect(screen.getByText('Potential Overlapping Cases – Coordination Required')).toBeInTheDocument();
    expect(screen.getByText('RB/2026/00087')).toBeInTheDocument();
    expect(screen.getByText('RO-NWRO/2026/00133')).toBeInTheDocument();
    // The resolution line: the complainant's words, then the registry institution it resolved to.
    expect(screen.getByText(/MAIT Delhi/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the institution record' })).toHaveAttribute('href', '/institutions/1-43655981521');
    expect(screen.getByText('History')).toBeInTheDocument();
    expect(screen.getAllByText(/Anil Deshmukh/).length).toBeGreaterThan(0);
  });

  it('offers the head only the actions the status and role allow', async () => {
    renderAs('pgrc_head', 101);
    await screen.findByRole('heading', { name: 'PGRC/2026/00412' });
    for (const name of ['Interim reply', 'Add remark', 'Transfer', 'Escalate', 'Dispose']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Assign officer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull();
  });

  it('gives an intake operator the case but no action buttons', async () => {
    renderAs('intake', 101);
    await screen.findByRole('heading', { name: 'PGRC/2026/00412' });
    expect(screen.getByText('You can view this case but not act on it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dispose' })).toBeNull();
  });

  it('adds a remark and the timeline updates', async () => {
    const user = userEvent.setup();
    renderAs('pgrc_head', 101);
    await user.click(await screen.findByRole('button', { name: 'Add remark' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Add remark' }));
    expect(await within(dialog).findByText('Remarks are required')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Remarks'), 'Reminder sent to the institute');
    await user.click(within(dialog).getByRole('button', { name: 'Add remark' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Reminder sent to the institute')).toBeInTheDocument();
  });

  it('validates a transfer before sending anything', async () => {
    const user = userEvent.setup();
    renderAs('pgrc_head', 101);
    await user.click(await screen.findByRole('button', { name: 'Transfer' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Transfer' }));
    expect(await within(dialog).findByText('Choose the bureau to transfer to')).toBeInTheDocument();
    expect(within(dialog).getByText('Remarks are required')).toBeInTheDocument();
  });

  it('lets the senior officer escalate, and the history marks it', async () => {
    const user = userEvent.setup();
    renderAs('senior', 101);
    await screen.findByRole('heading', { name: 'PGRC/2026/00412' });
    expect(screen.queryByRole('button', { name: 'Dispose' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Escalate' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Remarks'), 'No reply from the institute');
    await user.click(within(dialog).getByRole('button', { name: 'Escalate' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('No reply from the institute')).toBeInTheDocument();
    expect(screen.getAllByText('Escalated').length).toBeGreaterThan(0);
  });

  it('sends a head back to the list after transferring a case out of their bureau', async () => {
    const user = userEvent.setup();
    renderAs('pgrc_head', 101);
    await user.click(await screen.findByRole('button', { name: 'Transfer' }));
    const dialog = await screen.findByRole('dialog');
    await pick('Transfer to', 'AB — Approval Bureau');
    await user.type(within(dialog).getByLabelText('Remarks'), 'Falls under the Approval Bureau');
    await user.click(within(dialog).getByRole('button', { name: 'Transfer' }));
    expect(await screen.findByText('cases list')).toBeInTheDocument();
  });

  it('warns before disposing a case in an open overlap, then disposes on confirmation', async () => {
    const user = userEvent.setup();
    renderAs('pgrc_head', 101);
    await user.click(await screen.findByRole('button', { name: 'Dispose' }));
    const dialog = await screen.findByRole('dialog');
    // The warning is there as soon as the dialog opens: the case's open overlap is already known.
    expect(within(dialog).getByText('This case is part of an open overlap group')).toBeInTheDocument();
    expect(within(dialog).getByText('RB/2026/00087')).toBeInTheDocument();
    expect(within(dialog).getByText('RO-NWRO/2026/00133')).toBeInTheDocument();
    await pick('Outcome', 'Redressed');
    await user.type(within(dialog).getByLabelText('Remarks'), 'Institute released the certificates');
    expect(screen.queryByText('Closed')).toBeNull(); // nothing has changed yet
    await user.click(within(dialog).getByRole('button', { name: /Dispose anyway/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findAllByText('Disposed')).not.toHaveLength(0);
    expect(screen.getByText('Closed')).toBeInTheDocument(); // the SLA badge stops
  });

  it('still asks for confirmation when the server reports an overlap the page did not know about', async () => {
    const user = userEvent.setup();
    const post = client.post.bind(client);
    let first = true;
    const spy = vi.spyOn(client, 'post').mockImplementation(((url: string, body: unknown, ...rest: unknown[]) => {
      if (first && url === '/cases/113/actions') {
        first = false;
        return Promise.reject({ response: { status: 409, data: { success: false, error: { code: 'OPEN_OVERLAP', message: 'open overlap', details: { linked_case_refs: ['RB/2026/00099'] } } } } });
      }
      return (post as (...a: unknown[]) => unknown)(url, body, ...rest);
    }) as typeof client.post);
    renderAs('pgrc_head', 113);
    await user.click(await screen.findByRole('button', { name: 'Dispose' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('This case is part of an open overlap group')).toBeNull();
    await pick('Outcome', 'Redressed');
    await user.type(within(dialog).getByLabelText('Remarks'), 'Done');
    await user.click(within(dialog).getByRole('button', { name: 'Dispose' }));
    expect(await within(dialog).findByText('This case is part of an open overlap group')).toBeInTheDocument();
    expect(within(dialog).getByText('RB/2026/00099')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Dispose anyway/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(spy.mock.calls.at(-1)?.[1]).toMatchObject({ action_type: 'dispose', confirm_open_overlap: true });
    spy.mockRestore();
  });

  it('shows the API message for an out-of-scope case, never a blank page', async () => {
    renderAs('rb_head', 101);
    expect(await screen.findByText('Unable to load data')).toBeInTheDocument();
    expect(screen.getByText(fixtures.errors.notFound.error.message)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All cases' })).toHaveAttribute('href', '/cases');
  });
});

describe('Coordinator on a confirmed group (Issue #51)', () => {
  it('Case Detail names the coordinator once the group is confirmed, and not before', async () => {
    attachMockAdapter(client, { latencyMs: [0, 0] });
    resetWorld();
    const render_ = (persona: Persona, id: number) => {
      tokenStore.set(fixtures.login[persona].data.access_token);
      return render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <AuthProvider>
            <MemoryRouter initialEntries={[`/cases/${id}`]}>
              <Routes><Route path="/cases/:id" element={<CaseDetailPage />} /></Routes>
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );
    };
    const before = render_('pgrc_head', 101);
    await screen.findByRole('heading', { name: 'PGRC/2026/00412' });
    expect(screen.queryByText(/Coordinator:/)).toBeNull();
    before.unmount();
    await client.post('/overlaps/1/decision', { decision: 'confirm', coordinator_id: 2, remark: 'PGRC leads' }, {
      headers: { Authorization: `Bearer ${fixtures.login.pgrc_head.data.access_token}` },
    });
    render_('pgrc_head', 101);
    await screen.findByRole('heading', { name: 'PGRC/2026/00412' });
    expect((await screen.findAllByText(/Coordinator: Anil Deshmukh/)).length).toBeGreaterThan(1); // the group, and each linked card
    tokenStore.clear();
  });
});

describe('Case view: evidence, headings and the action dialog', () => {
  beforeAll(() => {
    attachMockAdapter(client, { latencyMs: [0, 0] });
  });
  beforeEach(() => resetWorld());
  afterEach(() => {
    tokenStore.clear();
    vi.restoreAllMocks();
  });
  const renderAs = (persona: Persona, id: number) => {
    tokenStore.set(fixtures.login[persona].data.access_token);
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AuthProvider>
          <MemoryRouter initialEntries={[`/cases/${id}`]}>
            <Routes><Route path="/cases/:id" element={<CaseDetailPage />} /></Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
  };

  it('shows only the evidence of pairs this case is in, each column named by the other case', async () => {
    renderAs('pgrc_head', 101);
    await screen.findByRole('heading', { level: 1, name: 'PGRC/2026/00412' });
    const grid = await screen.findByRole('table', { name: 'Evidence for each pair of cases' });
    const heads = within(grid).getAllByRole('columnheader').map((th) => th.textContent);
    expect(heads.slice(1)).toEqual(expect.arrayContaining(['with RB/2026/00087', 'with RO-NWRO/2026/00133']));
    expect(heads.slice(1)).toHaveLength(2);
    expect(screen.getByRole('img', { name: /PGRC\/2026\/00412 at PGRC.*\(this case\)/ })).toBeInTheDocument();
  });

  it('falls back to the group reasons when the group cannot be read', async () => {
    const get = client.get.bind(client);
    vi.spyOn(client, 'get').mockImplementation(((url: string, ...rest: unknown[]) =>
      url === '/overlaps/1' ? Promise.reject(new Error('nope')) : (get as (...a: unknown[]) => unknown)(url, ...rest)) as typeof client.get);
    renderAs('pgrc_head', 101);
    await screen.findByRole('heading', { level: 1, name: 'PGRC/2026/00412' });
    await waitFor(() => expect(document.querySelector('.uc-ledger')).not.toBeNull()); // the group's reasons, as a ledger
    expect(screen.getByRole('heading', { level: 3, name: 'Why these were flagged' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Evidence for each pair of cases' })).toBeNull();
  });

  it('puts the overlap under its own h2, so no h3 sits directly under the h1', async () => {
    renderAs('pgrc_head', 101);
    await screen.findByRole('heading', { level: 1, name: 'PGRC/2026/00412' });
    await screen.findByRole('table', { name: 'Evidence for each pair of cases' });
    const levels = screen.getAllByRole('heading').map((h) => Number(h.tagName.slice(1)));
    levels.forEach((l, i) => i > 0 && expect(l - levels[i - 1]).toBeLessThanOrEqual(1));
    expect(screen.getByRole('heading', { level: 2, name: 'Overlap' })).toBeInTheDocument();
  });

  it('focuses the first field, marks and focuses an invalid one, and returns focus to the button on close', async () => {
    const user = userEvent.setup();
    renderAs('pgrc_head', 101);
    const trigger = await screen.findByRole('button', { name: 'Transfer' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('combobox', { name: 'Transfer to' })).toHaveFocus());
    await user.type(within(dialog).getByLabelText('Remarks'), 'x');
    await user.click(within(dialog).getByRole('button', { name: 'Transfer' }));
    const select = within(dialog).getByRole('combobox', { name: 'Transfer to' });
    await waitFor(() => expect(select).toHaveFocus());
    expect(select).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(document.getElementById(select.getAttribute('aria-describedby')!)).toHaveTextContent('Choose the bureau to transfer to'));
    expect(within(dialog).getByLabelText('Remarks')).toHaveAttribute('aria-invalid', 'false');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('keeps what was typed after a failed submit, across close and reopen', async () => {
    const user = userEvent.setup();
    const post = client.post.bind(client);
    vi.spyOn(client, 'post').mockImplementation(((url: string, ...rest: unknown[]) =>
      url === '/cases/101/actions' ? Promise.reject(new Error('Server busy')) : (post as (...a: unknown[]) => unknown)(url, ...rest)) as typeof client.post);
    renderAs('pgrc_head', 101);
    await user.click(await screen.findByRole('button', { name: 'Add remark' }));
    let dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Remarks'), 'Called the registrar');
    await user.click(within(dialog).getByRole('button', { name: 'Add remark' }));
    expect(await within(dialog).findByText('Server busy')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Add remark' }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Remarks')).toHaveValue('Called the registrar');
  });

  it('announces a recorded action in a status region, and the new entry heads the history', async () => {
    const user = userEvent.setup();
    renderAs('pgrc_head', 101);
    await user.click(await screen.findByRole('button', { name: 'Add remark' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Remarks'), 'Reminder sent');
    await user.click(within(dialog).getByRole('button', { name: 'Add remark' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getAllByRole('status').some((s) => s.textContent === 'Remark added on PGRC/2026/00412.')).toBe(true));
    const history = await screen.findByRole('list', { name: 'Case history, newest first' });
    await waitFor(() => expect(within(history).getAllByRole('listitem')[0]).toHaveTextContent('Reminder sent'));
  });
});
