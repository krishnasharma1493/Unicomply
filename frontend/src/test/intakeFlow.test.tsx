import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthProvider';
import { tokenStore } from '../auth/tokenStore';
import { CaseIntakePage } from '../pages/CaseIntakePage';
import { RerankingCandidates } from '../features/intake/RerankingCandidates';
import { summarize } from '../features/intake/ResolutionPanel';
import { findDuplicate, subjectSimilarity } from '../features/intake/useDuplicateCheck';
import { listWords } from '../features/intake/IntakeResult';
import { client } from '../lib/api/client';
import { attachMockAdapter } from '../lib/api/mock';
import { fixtures } from '../lib/api/mock/fixtures';
import { resetWorld } from '../lib/api/mock/state';
import type { CaseListItem } from '../lib/api/types';

describe('intake helpers', () => {
  it('summarises a lookup in one short sentence', () => {
    const resolution = fixtures.intake.data.resolution;
    const [best] = resolution.candidates;
    expect(summarize(resolution)).toBe(
      `${resolution.candidates.length} candidates; best match ${best.name}, ${Math.round(best.score * 100)} of 100.`,
    );
    expect(summarize({ decision: 'unresolved', candidates: [] })).toBe('No matching institution in the registry.');
  });

  it('lists bureaus in words', () => {
    expect(listWords(['PGRC'])).toBe('PGRC');
    expect(listWords(['PGRC', 'RB', 'RO-CRO'])).toBe('PGRC, RB and RO-CRO');
  });

  it('finds a same-day duplicate by category or by a near-identical subject only', () => {
    const base = { permanent_id: '1-4812730561', received_at: '2026-11-20', category_id: 2, subject: 'Original certificates not returned' } as CaseListItem;
    const probe = { permanentId: '1-4812730561', receivedAt: '2026-11-20', categoryId: 2, subject: 'Something else entirely' };
    expect(findDuplicate([base], probe)?.why).toBe('category');
    expect(findDuplicate([base], { ...probe, categoryId: 5, subject: 'Original certificates not returned yet' })?.why).toBe('subject');
    expect(findDuplicate([base], { ...probe, categoryId: 5 })).toBeNull();
    expect(findDuplicate([{ ...base, received_at: '2026-11-19' }], probe)).toBeNull();
    expect(subjectSimilarity('a b c', '')).toBe(0);
  });
});

describe('RerankingCandidates', () => {
  it('keeps each row (keyed by Permanent ID) when the ranking changes', () => {
    const [a, b, c] = fixtures.intake.data.resolution.candidates;
    const { rerender, container } = render(<RerankingCandidates reduce candidates={[a, b, c]} onSelect={() => {}} />);
    const before = screen.getByRole('listitem', { name: `Candidate ${a.name}` });
    rerender(<RerankingCandidates reduce candidates={[b, a, c]} onSelect={() => {}} />);
    const items = Array.from(container.querySelectorAll<HTMLElement>('.uc-candidates > li'));
    expect(items[1]).toBe(before);
    expect(within(items[0]).getByText('#1')).toBeInTheDocument();
  });
});

describe('Intake flow on the mock API', () => {
  beforeAll(() => {
    attachMockAdapter(client, { latencyMs: [0, 0] });
  });
  beforeEach(() => {
    resetWorld();
    tokenStore.set(fixtures.login.intake.data.access_token);
  });
  afterEach(() => {
    tokenStore.clear();
    vi.restoreAllMocks();
  });

  const renderPage = () =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AuthProvider>
          <MemoryRouter>
            <CaseIntakePage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

  async function fillHero(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText(/Institution name/), 'vindya valley engg college jabalpur');
    await user.type(screen.getByLabelText('State'), 'Madhya Pradesh');
    await screen.findByText('Matched automatically');
    await user.type(screen.getByLabelText(/Subject/), 'Certificates not returned');
    await user.type(screen.getByLabelText(/Description/), 'The college is not returning the original mark sheets.');
    fireEvent.mouseDown(document.getElementById('intake-category_id')!);
    fireEvent.click(await screen.findByText('Certificates withheld'));
  }

  it('groups the fields under Institution, Complaint and Source', async () => {
    renderPage();
    await screen.findByLabelText(/Institution name/);
    expect(screen.getByRole('group', { name: 'Institution' })).toContainElement(screen.getByLabelText('District'));
    expect(screen.getByRole('group', { name: 'Complaint' })).toContainElement(screen.getByLabelText(/Description/));
    expect(screen.getByRole('group', { name: 'Source' })).toContainElement(screen.getByLabelText(/External reference/));
  });

  it('announces one short status line, and the panel itself is not a live region', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText(/Institution name/), 'vindya valley engg college jabalpur');
    const [best] = fixtures.intake.data.resolution.candidates;
    const status = await screen.findByText(new RegExp(`best match ${best.name}`));
    expect(status).toHaveAttribute('role', 'status');
    expect(document.querySelector('[aria-live]:not([role="status"]):not([role="alert"])')?.closest('.uc-intake-panel')).toBeFalsy();
    // The resolution line: what was written, then the registry name.
    expect(screen.getByText(/Written as/).closest('.uc-resline')).toHaveTextContent(best.name);
  });

  it('registers with Ctrl+Enter from any field', async () => {
    const user = userEvent.setup();
    renderPage();
    await fillHero(user);
    screen.getByLabelText(/Subject/).focus();
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByRole('heading', { name: /Case registered: PGRC\/2026\/00519/ })).toBeInTheDocument();
  });

  it('collapses to a summary with the due date in words, says who was alerted, and draws the new case on the lanes', async () => {
    const user = userEvent.setup();
    renderPage();
    await fillHero(user);
    await user.click(screen.getByRole('button', { name: 'Register case' }));
    const heading = await screen.findByRole('heading', { name: /Case registered/ });
    await waitFor(() => expect(heading).toHaveFocus());
    await waitFor(() => expect(screen.queryByLabelText(/Institution name/)).toBeNull());
    const created = fixtures.intake.data.case;
    const due = created.sla_due_on;
    expect(screen.queryByText(new RegExp(due))).toBeNull(); // never the raw ISO date
    expect(screen.getAllByText(/due \d{2} [A-Z][a-z]{2} \d{4}/).length).toBeGreaterThan(0);
    expect(screen.getByText(/The heads of PGRC, RB and RO-CRO and senior management have been alerted\./)).toBeInTheDocument();
    expect(screen.getByText(/Routed to PGRC \(/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: new RegExp(`${created.case_ref} at PGRC, received .* \\(this case\\)`) })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Why this was flagged' })).toBeInTheDocument();
  });

  it('warns about a same-day duplicate and still lets the operator register it', { timeout: 15_000 }, async () => {
    const post = vi.spyOn(client, 'post');
    const user = userEvent.setup();
    renderPage();
    await fillHero(user);
    await user.click(screen.getByRole('button', { name: 'Register case' }));
    const first = await screen.findByRole('heading', { name: /Case registered: (\S+)/ });
    const firstRef = first.textContent!.replace('Case registered: ', '');
    await user.click(screen.getByRole('button', { name: 'Register another' }));
    await waitFor(() => expect(screen.getByLabelText(/Institution name/)).toHaveFocus());
    await fillHero(user);
    const warning = await screen.findByText(/Possible duplicate:/);
    expect(warning.closest('[role="alert"]')).toHaveTextContent(
      `Possible duplicate: ${firstRef}, registered today for the same institution and category. Register anyway?`,
    );
    // The form came back in place of the outcome; in jsdom antd's loading icon from the first press never
    // finishes its leave transition, so the name can carry a hidden "loading" prefix.
    await user.click(screen.getByRole('button', { name: /Register case$/ }));
    expect(await screen.findByRole('heading', { name: /Case registered/ })).toBeInTheDocument();
    expect(post.mock.calls.filter(([url]) => url === '/cases')).toHaveLength(2);
  });

  it('checks for a duplicate on submit when the operator never reached the complaint fields first', async () => {
    const get = vi.spyOn(client, 'get');
    const user = userEvent.setup();
    renderPage();
    await fillHero(user);
    await user.click(screen.getByRole('button', { name: 'Register case' }));
    await screen.findByRole('heading', { name: /Case registered/ });
    const checks = get.mock.calls.filter(([url, cfg]) => url === '/cases' && (cfg as { params?: { permanent_id?: string } })?.params?.permanent_id);
    expect(checks.length).toBeGreaterThan(0);
    expect((checks[0][1] as { params: Record<string, unknown> }).params).toMatchObject({ from: '2026-11-20', to: '2026-11-20', limit: 5 });
  });
});
