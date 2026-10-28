import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthProvider';
import { tokenStore } from '../auth/tokenStore';
import { CaseIntakePage } from '../pages/CaseIntakePage';
import { IntakeResult } from '../features/intake/IntakeResult';
import { intakeSchema, toCaseCreate, type IntakeFormValues } from '../features/intake/schema';
import { splitApiFieldErrors } from '../features/intake/fieldErrors';
import { useDebouncedValue } from '../features/intake/useDebouncedValue';
import { client } from '../lib/api/client';
import { attachMockAdapter } from '../lib/api/mock';
import { fixtures } from '../lib/api/mock/fixtures';
import { resetWorld } from '../lib/api/mock/state';

const valid: IntakeFormValues = {
  source_channel: 'email', external_ref: '', received_at: '2026-11-20', complainant_type: 'parent', complainant_name: 'Sushila Dubey',
  raw_institution_text: 'vindya valley engg college jabalpur', raw_state: 'Madhya Pradesh', raw_district: '', permanent_id: '',
  category_id: 2, subject: 'Certificates not returned', description: 'The college is not returning the original mark sheets.',
  route_to_bureau_id: null,
};

describe('intake schema (same limits as the backend CaseCreate)', () => {
  it('accepts a valid case and turns empty optionals into null', () => {
    expect(intakeSchema.safeParse(valid).success).toBe(true);
    const body = toCaseCreate(valid);
    expect(body).toMatchObject({ external_ref: null, raw_district: null, permanent_id: null, route_to_bureau_id: null });
    expect(body.raw_institution_text).toBe('vindya valley engg college jabalpur');
  });

  it.each([
    ['raw_institution_text', 'ab'], ['raw_institution_text', 'x'.repeat(301)], ['subject', 'ab'], ['subject', 'x'.repeat(201)],
    ['description', 'too short'], ['description', 'x'.repeat(4001)], ['permanent_id', '2-123456'], ['permanent_id', '1-12345'],
    ['permanent_id', '1-12345678901'], ['external_ref', 'x'.repeat(61)], ['complainant_name', 'x'.repeat(121)],
    ['raw_state', 'x'.repeat(61)], ['raw_district', 'x'.repeat(61)], ['received_at', '20/11/2026'],
  ])('rejects %s = %s', (field, value) => {
    const result = intakeSchema.safeParse({ ...valid, [field]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === field)).toBe(true);
  });

  it('accepts the boundary values', () => {
    expect(intakeSchema.safeParse({ ...valid, raw_institution_text: 'abc', subject: 'abc', description: 'x'.repeat(10), permanent_id: '1-123456' }).success).toBe(true);
    expect(intakeSchema.safeParse({ ...valid, raw_institution_text: 'x'.repeat(300), subject: 'x'.repeat(200), description: 'x'.repeat(4000), permanent_id: '1-1234567890' }).success).toBe(true);
  });

  it('requires a category', () => {
    expect(intakeSchema.safeParse({ ...valid, category_id: undefined }).success).toBe(false);
  });
});

describe('splitApiFieldErrors', () => {
  it('maps API field errors onto form fields and keeps the rest', () => {
    const error = { response: { data: { error: { fields: { permanent_id: ['Not in the registry'], nope: ['odd'] } } } } };
    expect(splitApiFieldErrors(error)).toEqual({ fields: { permanent_id: 'Not in the registry' }, rest: ['nope: odd'] });
  });
});

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('only follows the value once it stops changing for 300 ms', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), { initialProps: { v: 'a' } });
    rerender({ v: 'ab' });
    act(() => void vi.advanceTimersByTime(200));
    rerender({ v: 'abc' });
    act(() => void vi.advanceTimersByTime(200));
    expect(result.current).toBe('a');
    act(() => void vi.advanceTimersByTime(100));
    expect(result.current).toBe('abc');
  });
});

describe('Intake page on the mock API (Issue #25)', () => {
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

  async function fillHero(user: ReturnType<typeof userEvent.setup>, institution = 'vindya valley engg college jabalpur') {
    await user.type(await screen.findByLabelText(/Institution name/), institution);
    await user.type(screen.getByLabelText('State'), 'Madhya Pradesh');
    await user.type(screen.getByLabelText(/Subject/), 'Certificates not returned');
    await user.type(screen.getByLabelText(/Description/), 'The college is not returning the original mark sheets.');
    fireEvent.mouseDown(document.getElementById('intake-category_id')!);
    fireEvent.click(await screen.findByText('Certificates withheld'));
  }

  it('shows a prompt, then the top-3 candidates with reasons after the hero text, with ONE debounced request', async () => {
    const post = vi.spyOn(client, 'post');
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText(/Type the institution name as written/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Institution name/), 'vindya valley engg college jabalpur');
    expect(await screen.findByText('Matched automatically')).toBeInTheDocument();
    const [best] = fixtures.intake.data.resolution.candidates;
    const list = screen.getByRole('list', { name: 'Candidate institutions' });
    expect(within(list).getAllByRole('button', { name: /^Select / })).toHaveLength(3);
    expect(within(list).getByText(best.name)).toBeInTheDocument();
    expect(within(list).getByText(best.reasons[0])).toBeInTheDocument();
    const previews = post.mock.calls.filter(([url]) => url === '/institutions/resolve');
    expect(previews).toHaveLength(1);
    expect((previews[0][1] as { raw_text: string }).raw_text).toBe('vindya valley engg college jabalpur');
  });

  it('selecting a candidate fills the Permanent ID', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText(/Institution name/), 'vindya valley engg college jabalpur');
    const [best] = fixtures.intake.data.resolution.candidates;
    await user.click(await screen.findByRole('button', { name: `Select ${best.name}` }));
    expect(screen.getByLabelText(/Permanent ID/)).toHaveValue(best.permanent_id);
    expect(screen.getByText(`Permanent ID ${best.permanent_id} will be used`)).toBeInTheDocument();
  });

  it('shows field errors from Zod before anything is sent', async () => {
    const post = vi.spyOn(client, 'post');
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText(/Institution name/), 'ab');
    await user.click(screen.getByRole('button', { name: 'Register case' }));
    expect(await screen.findByText('Enter at least 3 characters of the institution name')).toBeInTheDocument();
    expect(screen.getByText('Choose a category')).toBeInTheDocument();
    expect(post.mock.calls.some(([url]) => url === '/cases')).toBe(false);
  });

  it('submits the hero case and shows the red banner with the three linked cases', async () => {
    const user = userEvent.setup();
    renderPage();
    await fillHero(user);
    await user.click(screen.getByRole('button', { name: 'Register case' }));
    expect(await screen.findByRole('heading', { name: /Case registered: PGRC\/2026\/00519/ })).toBeInTheDocument();
    expect(screen.getByText('Potential Overlapping Cases – Coordination Required')).toBeInTheDocument();
    for (const ref of ['PGRC/2026/00412', 'RB/2026/00087', 'RO-CRO/2026/00133']) {
      expect(screen.getAllByText(ref).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole('link', { name: 'Open case' })).toHaveAttribute('href', '/cases/105');
    await user.click(screen.getByRole('button', { name: 'Register another' }));
    expect(await screen.findByLabelText(/Institution name/)).toHaveValue('');
  });

  it('registers an ambiguous name as pending review and links to the review queue (#42)', async () => {
    const user = userEvent.setup();
    renderPage();
    await fillHero(user, 'S.I.T. Bhopal');
    await user.click(screen.getByRole('button', { name: 'Register case' }));
    expect(await screen.findByRole('heading', { name: /Case registered: PGRC\/2026\// })).toBeInTheDocument();
    expect(screen.getByText('Institution not confirmed: queued for match review')).toBeInTheDocument();
    expect(screen.getByText(/2 possible institutions/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open review queue' })).toHaveAttribute('href', '/reviews');
    expect(screen.queryByText(/Coordination Required/)).not.toBeInTheDocument();
    expect(screen.queryByText('No overlapping cases found for this institution.')).not.toBeInTheDocument();

    const queue = await client.get('/reviews', { params: { status: 'pending' } });
    expect(queue.data.data).toHaveLength(fixtures.reviews.data.length + 1);
  });

  it('hides the review-queue link from a role that cannot open the queue (#42)', async () => {
    tokenStore.set(fixtures.login.pgrc_head.data.access_token);
    const user = userEvent.setup();
    renderPage();
    await fillHero(user, 'S.I.T. Bhopal');
    await user.click(screen.getByRole('button', { name: 'Register case' }));
    expect(await screen.findByText('Institution not confirmed: queued for match review')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open review queue' })).not.toBeInTheDocument();
  });

  it('describes a single candidate in the singular (#42)', async () => {
    const result = structuredClone(fixtures.intake.data);
    result.case.permanent_id = null;
    result.overlaps = [];
    result.resolution = { decision: 'pending_review', candidates: result.resolution.candidates.slice(0, 1) };
    render(
      <AuthProvider>
        <MemoryRouter>
          <IntakeResult result={result} meta={fixtures.meta.data} onNewCase={() => {}} />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByText(/One possible institution; a reviewer confirms whether it is the right one\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open review queue' })).toBeInTheDocument();
  });

  it('puts an API 400 on the field it names', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText(/Institution name/), 'vindya valley engg college jabalpur');
    await user.type(screen.getByLabelText(/Subject/), 'Certificates not returned');
    await user.type(screen.getByLabelText(/Description/), 'The college is not returning the original mark sheets.');
    fireEvent.mouseDown(document.getElementById('intake-category_id')!);
    fireEvent.click(await screen.findByText('Certificates withheld'));
    const realPost = client.post.bind(client);
    vi.spyOn(client, 'post').mockImplementation(((url: string, ...rest: unknown[]) =>
      url === '/cases'
        ? Promise.reject({
            isAxiosError: true,
            message: 'Request failed',
            response: { status: 400, data: { success: false, error: { code: 'VALIDATION_ERROR', message: 'Validation failed', fields: { subject: ['Subject is not allowed'] } } } },
          })
        : (realPost as (...a: unknown[]) => unknown)(url, ...rest)) as typeof client.post);
    await user.click(screen.getByRole('button', { name: 'Register case' }));
    expect(await screen.findByText('Subject is not allowed')).toBeInTheDocument();
    expect(screen.getByText('Please correct the highlighted fields.')).toBeInTheDocument();
  });

  it('shows an error state with retry when the preview fails', async () => {
    const user = userEvent.setup();
    renderPage();
    vi.spyOn(client, 'post').mockRejectedValueOnce(new Error('Network down'));
    await user.type(await screen.findByLabelText(/Institution name/), 'vindya valley');
    expect(await screen.findByText('Network down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
  });

  it('renders API text as text, not HTML', async () => {
    const user = userEvent.setup();
    renderPage();
    vi.spyOn(client, 'post').mockResolvedValueOnce({
      data: { success: true, data: { decision: 'unresolved', candidates: [{ permanent_id: '1-1234567', name: '<b>bold</b>', district: 'D', state: 'S', score: 0.5, reasons: ['<i>x</i>'] }] } },
    });
    await user.type(await screen.findByLabelText(/Institution name/), 'something');
    // The name appears twice now: in the resolution line and in the candidate list.
    expect(await screen.findAllByText('<b>bold</b>')).not.toHaveLength(0);
    expect(document.querySelector('b')).toBeNull();
  });
});
