// In-memory world behind the mock API (#10). Seeded from the contract fixtures, mutated by the
// POST handlers, re-seeded by POST /demo/reset (or a page reload). It mirrors the backend rules
// the UI depends on: §4.2 scope (404 outside it), the §4.3 transition table and the overlap guard.

import { CASE_STATUSES, CASE_STATUS_LABELS, OPEN_CASE_STATUSES } from '../enums';
import type { ActionType, CaseStatus, OverlapGroupStatus } from '../enums';
import type {
  Alert,
  ApiError,
  ApiErrorDetail,
  CaseAction,
  CaseActionIn,
  CaseActionResult,
  CaseCreate,
  CaseDetail,
  CaseInstitution,
  CaseIntakeResult,
  CaseRead,
  Institution360,
  InstitutionAlias,
  InstitutionListItem,
  InstitutionLite,
  LinkedCaseCard,
  OpenOverlapErrorDetails,
  OverlapCluster,
  OverlapDecisionIn,
  OverlapGroupDetail,
  OverlapGroupListItem,
  OverlapPair,
  OverlapSummary,
  PermanentId,
  ReviewDecideResult,
  ReviewItem,
  Trust,
  UserMe,
} from '../types';
import { fixtures } from './fixtures';

/** contract/README.md, "The fixture world". */
export const DEMO_TODAY = '2026-11-20';
// The mock clock starts just after the last seeded event (09:45Z) and runs in real time.
const CLOCK_START = Date.parse(`${DEMO_TODAY}T10:00:00Z`);
const loadedAt = Date.now();
export const nowUtc = () =>
  new Date(CLOCK_START + Date.now() - loadedAt).toISOString().replace(/\.\d{3}Z$/, 'Z');

const meta = fixtures.meta.data;
const registry = fixtures.institutions.data;
const personas = Object.values(fixtures.usersMe).map((f) => f.data);
const trusts = new Map<number, Trust>();
const seedTrust = fixtures.institution360.data.trust;
if (seedTrust) trusts.set(seedTrust.id, seedTrust);

// ── Errors ───────────────────────────────────────────────────────────────

export class MockApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.error.message);
  }
}

const fail = (status: number, code: ApiErrorDetail['code'], message: string, extra?: Partial<ApiErrorDetail>) =>
  new MockApiError(status, { success: false, error: { code, message, ...extra } });

export const notFound = (what: string) =>
  what === 'Case' ? new MockApiError(404, fixtures.errors.notFound) : fail(404, 'NOT_FOUND', `${what} not found`);
export const forbidden = () => new MockApiError(403, fixtures.errors.forbidden);
export const validationError = (fields: Record<string, string[]>) =>
  fail(400, 'VALIDATION_ERROR', 'Validation failed', { fields });

// ── State ────────────────────────────────────────────────────────────────

type GroupState = {
  group: OverlapGroupListItem;
  /** Every member case id, the case each response is about included. */
  memberIds: number[];
  reasons: string[];
  clusters: OverlapCluster[];
  pairs: OverlapPair[];
};

type World = {
  cases: CaseRead[];
  actions: CaseAction[];
  reviews: ReviewItem[];
  groups: GroupState[];
  alerts: Alert[];
  nextActionId: number;
  nextAliasId: number;
};

const ACTIVE_GROUP: readonly OverlapGroupStatus[] = ['open', 'confirmed'];

/** Members of an anchor: the institution, a parent and its departments, or a trust's institutions. */
function membersByAnchor(anchorKey: string, cases: CaseRead[]): number[] {
  let pids: PermanentId[];
  if (anchorKey.startsWith('parent:')) {
    const parent = anchorKey.slice('parent:'.length);
    pids = [parent, ...registry.filter((i) => i.parent_id === parent).map((i) => i.permanent_id)];
  } else if (anchorKey.startsWith('trust:')) {
    const trustId = Number(anchorKey.slice('trust:'.length));
    pids = registry.filter((i) => i.trust_id === trustId).map((i) => i.permanent_id);
  } else {
    pids = [anchorKey];
  }
  return cases
    .filter((c) => c.permanent_id !== null && pids.includes(c.permanent_id))
    .map((c) => c.id)
    .sort((a, b) => a - b);
}

function seed(): World {
  const cases = structuredClone(fixtures.cases.data);
  const detail = fixtures.overlapDetail.data;
  // Member cards are listed in full by Institution 360 and the overlap detail; other groups
  // (no member cards in the fixtures) fall back to their anchor.
  const known = new Map<number, Pick<GroupState, 'memberIds' | 'reasons'>>();
  for (const g of fixtures.institution360.data.overlap_groups) {
    known.set(g.group_id, { memberIds: g.cases.map((c) => c.case_id), reasons: g.reasons });
  }
  known.set(detail.group.id, { memberIds: detail.cases.map((c) => c.case_id), reasons: detail.reasons });

  const groups = structuredClone(fixtures.overlaps.data).map((group): GroupState => {
    const seen = known.get(group.id);
    const isDetail = group.id === detail.group.id;
    return {
      group,
      memberIds: [...(seen?.memberIds ?? membersByAnchor(group.anchor_key, cases))],
      reasons: [...(seen?.reasons ?? [])],
      clusters: isDetail ? structuredClone(detail.clusters) : [],
      pairs: isDetail ? structuredClone(detail.pairs) : [],
    };
  });

  const actions = structuredClone(fixtures.caseDetail.data.actions);
  const actionIds = [...actions.map((a) => a.id), fixtures.caseAction.data.action.id];
  return {
    cases,
    actions,
    reviews: structuredClone(fixtures.reviews.data),
    groups,
    alerts: structuredClone(fixtures.alerts.data),
    nextActionId: Math.max(...actionIds) + 1,
    nextAliasId: (fixtures.reviewDecide.data.alias?.id ?? 0) + 1,
  };
}

export let world = seed();

export function resetWorld() {
  world = seed();
}

// ── Lookups & derived read models ────────────────────────────────────────

const bureauOf = (id: number) => meta.bureaus.find((b) => b.id === id);
const categoryOf = (id: number) => meta.categories.find((c) => c.id === id);
export const institutionOf = (pid: string | null) => registry.find((i) => i.permanent_id === pid);
/** Officers and personas can both be assigned or named coordinator. */
const userName = (id: number | null) =>
  (meta.officers.find((o) => o.id === id) ?? personas.find((p) => p.id === id))?.name ?? null;

export const findCase = (id: number) => world.cases.find((c) => c.id === id);
const isOpen = (status: CaseStatus) => status !== 'disposed';

const lite = (i: InstitutionListItem): InstitutionLite => ({
  permanent_id: i.permanent_id,
  name: i.name,
  district: i.district,
  state: i.state,
  inst_type: i.inst_type,
});

/** §4.2 `scope_cases`. */
export function inScope(viewer: UserMe, c: CaseRead): boolean {
  switch (viewer.role) {
    case 'senior_mgmt':
      return true;
    case 'bureau_head':
      return c.current_bureau_id === viewer.bureau_id;
    case 'ro_officer':
      return c.region !== null && c.region === viewer.region;
    case 'intake_operator':
      return c.created_by === viewer.id;
  }
}

/** By-id loads are 404 outside scope, never 403 (§4.2). */
export function caseInScopeOr404(viewer: UserMe, id: number): CaseRead {
  const c = findCase(id);
  if (!c || !inScope(viewer, c)) throw notFound('Case');
  return c;
}

function card(c: CaseRead, viewer: UserMe): LinkedCaseCard {
  return {
    case_id: c.id,
    case_ref: c.case_ref,
    permanent_id: c.permanent_id,
    institution_name: c.institution_name,
    bureau_id: c.current_bureau_id,
    bureau_code: bureauOf(c.current_bureau_id)?.code ?? '',
    status: c.status,
    category_id: c.category_id,
    category_code: categoryOf(c.category_id)?.code ?? 'other',
    subject: c.subject,
    assigned_officer_id: c.assigned_officer_id,
    assigned_officer_name: userName(c.assigned_officer_id),
    last_action_type: c.last_action_type,
    last_action_at: c.last_action_at,
    received_at: c.received_at,
    in_scope: inScope(viewer, c),
  };
}

const members = (g: GroupState) => g.memberIds.flatMap((id) => findCase(id) ?? []);

function summary(g: GroupState, viewer: UserMe, excludeCaseId?: number): OverlapSummary {
  return {
    group_id: g.group.id,
    level: g.group.level,
    tier: g.group.tier,
    status: g.group.status,
    banner: g.group.banner,
    cases: members(g)
      .filter((c) => c.id !== excludeCaseId)
      .map((c) => card(c, viewer)),
    reasons: g.reasons,
    coordinator_name: g.group.coordinator_name,
  };
}

const activeGroupsOf = (caseId: number) =>
  world.groups.filter((g) => ACTIVE_GROUP.includes(g.group.status) && g.memberIds.includes(caseId));

/** Keeps the derived group and case fields in step with membership and decisions. */
function refreshDerived() {
  for (const g of world.groups) {
    const cs = members(g);
    g.group.case_count = cs.length;
    g.group.bureau_codes = [...new Set(cs.map((c) => bureauOf(c.current_bureau_id)?.code ?? ''))].sort();
    if (g.pairs.length > 0) g.group.top_score = Math.max(...g.pairs.map((p) => p.score));
  }
  for (const c of world.cases) {
    c.in_overlap = activeGroupsOf(c.id).length > 0;
    c.beyond_sla = isOpen(c.status) && c.sla_due_on < DEMO_TODAY;
  }
}

export function caseDetail(c: CaseRead, viewer: UserMe): CaseDetail {
  const inst = institutionOf(c.permanent_id);
  const institution: CaseInstitution | null = inst
    ? { ...lite(inst), region: inst.region, trust_id: inst.trust_id, trust_name: inst.trust_name }
    : null;
  return {
    case: c,
    institution,
    actions: world.actions
      .filter((a) => a.case_id === c.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    overlaps: activeGroupsOf(c.id).map((g) => summary(g, viewer, c.id)),
  };
}

export function withOpenCount(i: InstitutionListItem): InstitutionListItem {
  const open = world.cases.filter((c) => c.permanent_id === i.permanent_id && isOpen(c.status)).length;
  return { ...i, open_case_count: open };
}

export function institution360(inst: InstitutionListItem, viewer: UserMe): Institution360 {
  const cases = world.cases.filter((c) => c.permanent_id === inst.permanent_id);
  const bureauIds = [...new Set(cases.map((c) => c.current_bureau_id))].sort((a, b) => a - b);
  const parent = institutionOf(inst.parent_id);
  return {
    institution: withOpenCount(inst),
    trust: inst.trust_id === null ? null : (trusts.get(inst.trust_id) ?? null),
    parent: parent ? lite(parent) : null,
    departments: registry.filter((i) => i.parent_id === inst.permanent_id).map(lite),
    trust_institutions:
      inst.trust_id === null
        ? []
        : registry
            .filter((i) => i.trust_id === inst.trust_id && i.permanent_id !== inst.permanent_id)
            .map(lite),
    case_counts: {
      total: cases.length,
      open: cases.filter((c) => isOpen(c.status)).length,
      disposed: cases.filter((c) => c.status === 'disposed').length,
      beyond_sla: cases.filter((c) => c.beyond_sla).length,
    },
    cases_by_bureau: bureauIds.map((id) => ({
      bureau_id: id,
      bureau_code: bureauOf(id)?.code ?? '',
      bureau_name: bureauOf(id)?.name ?? '',
      cases: cases.filter((c) => c.current_bureau_id === id).map((c) => card(c, viewer)),
    })),
    overlap_groups: world.groups
      .filter((g) => ACTIVE_GROUP.includes(g.group.status) && cases.some((c) => g.memberIds.includes(c.id)))
      .map((g) => summary(g, viewer)),
  };
}

// ── Overlaps ─────────────────────────────────────────────────────────────

const groupInScope = (g: GroupState, viewer: UserMe) => members(g).some((c) => inScope(viewer, c));

export const visibleGroups = (viewer: UserMe) => world.groups.filter((g) => groupInScope(g, viewer));

export function groupInScopeOr404(viewer: UserMe, id: number): GroupState {
  const g = world.groups.find((x) => x.group.id === id);
  if (!g || !groupInScope(g, viewer)) throw notFound('Overlap group');
  return g;
}

export function overlapDetail(g: GroupState, viewer: UserMe): OverlapGroupDetail {
  return {
    group: g.group,
    cases: members(g).map((c) => card(c, viewer)),
    clusters: g.clusters,
    pairs: g.pairs,
    reasons: g.reasons,
  };
}

const GROUP_STATUS_AFTER: Record<OverlapDecisionIn['decision'], OverlapGroupStatus> = {
  confirm: 'confirmed',
  dismiss: 'dismissed',
  resolve: 'resolved',
};

/** POST /overlaps/{id}/decision: heads (own-bureau groups) and senior management. */
export function decideOverlap(g: GroupState, body: Partial<OverlapDecisionIn>, viewer: UserMe): OverlapGroupDetail {
  const ownBureauInvolved = members(g).some((c) => c.current_bureau_id === viewer.bureau_id);
  if (!(viewer.role === 'senior_mgmt' || (viewer.role === 'bureau_head' && ownBureauInvolved))) throw forbidden();

  const decision = body.decision;
  if (decision !== 'confirm' && decision !== 'dismiss' && decision !== 'resolve') {
    throw validationError({ decision: ["Input should be 'confirm', 'dismiss' or 'resolve'"] });
  }
  const decidable: readonly OverlapGroupStatus[] = decision === 'resolve' ? ACTIVE_GROUP : ['open'];
  if (!decidable.includes(g.group.status)) {
    throw fail(409, 'ALREADY_DECIDED', `This overlap group has already been ${g.group.status}`, {
      details: { group_id: g.group.id, status: g.group.status, decided_at: g.group.decided_at },
    });
  }
  const remark = body.remark?.trim() || null;
  if (decision === 'dismiss' && !remark) {
    throw fail(400, 'REMARKS_REQUIRED', 'Remarks are required to dismiss an overlap group', {
      details: { group_id: g.group.id, decision },
    });
  }
  const coordinatorId = body.decision === 'confirm' ? body.coordinator_id : undefined;
  if (decision === 'confirm' && (typeof coordinatorId !== 'number' || userName(coordinatorId) === null)) {
    throw validationError({ coordinator_id: ['Field required'] });
  }

  const now = nowUtc();
  const patch: Partial<OverlapGroupListItem> = {
    status: GROUP_STATUS_AFTER[decision],
    decided_by: viewer.id,
    decided_at: now,
    decision_remark: remark,
    updated_at: now,
  };
  if (coordinatorId !== undefined) {
    patch.coordinator_id = coordinatorId;
    patch.coordinator_name = userName(coordinatorId);
  }
  Object.assign(g.group, patch);
  if (decision !== 'resolve') {
    for (const p of g.pairs) p.decision = decision === 'confirm' ? 'confirmed' : 'dismissed';
  }
  refreshDerived();
  return overlapDetail(g, viewer);
}

// ── Case intake & workflow (§4.3) ────────────────────────────────────────

/** POST /cases always yields the hero intake (#2 `post_cases.json`); repeating it is idempotent. */
export function intakeHeroCase() {
  const result = structuredClone(fixtures.intake.data);
  if (!findCase(result.case.id)) {
    world.cases.unshift(structuredClone(result.case));
    const decided = fixtures.overlapDecision.data;
    for (const o of result.overlaps) {
      const g = world.groups.find((x) => x.group.id === o.group_id);
      if (!g) continue;
      g.memberIds.push(result.case.id);
      g.reasons = [...o.reasons];
      g.group.updated_at = result.case.created_at;
      if (g.group.id === decided.group.id) {
        // The post-intake clusters and pairs, before anyone has decided on them.
        g.clusters = structuredClone(decided.clusters);
        g.pairs = decided.pairs.map((p) => ({ ...p, decision: 'none' }));
      }
    }
    refreshDerived();
  }
  return result;
}

const normalizeText = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

/** A seeded review whose raw text the intake repeats (e.g. the ambiguous "S.I.T. Bhopal"). */
export const reviewForText = (raw: string) =>
  fixtures.reviews.data.find((r) => normalizeText(r.raw_institution_text) === normalizeText(raw));

const addDays = (isoDate: string, days: number) =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * POST /cases for a name the engine will not guess (#42): the case is registered unresolved and
 * queued for match review with the same candidates as the seeded review it repeats.
 */
export function intakePendingCase(body: CaseCreate, seeded: ReviewItem, viewer: UserMe): CaseIntakeResult {
  const category = categoryOf(body.category_id);
  const bureauId =
    body.route_to_bureau_id ?? meta.bureaus.find((b) => b.code === category?.default_bureau_code)?.id ?? 2;
  const id = Math.max(...world.cases.map((c) => c.id), fixtures.intake.data.case.id) + 1;
  const now = nowUtc();
  const created: CaseRead = {
    id,
    case_ref: `${bureauOf(bureauId)?.code ?? 'PGRC'}/2026/${String(600 + id).padStart(5, '0')}`,
    source_channel: body.source_channel,
    external_ref: body.external_ref ?? null,
    received_at: body.received_at,
    complainant_type: body.complainant_type,
    complainant_name: body.complainant_name ?? null,
    raw_institution_text: body.raw_institution_text,
    raw_state: body.raw_state ?? null,
    raw_district: body.raw_district ?? null,
    permanent_id: null,
    match_score: seeded.candidates[0]?.score ?? null,
    match_status: 'pending_review',
    category_id: body.category_id,
    category_suggested_id: null,
    subject: body.subject,
    description: body.description,
    status: 'received',
    current_bureau_id: bureauId,
    assigned_officer_id: null,
    last_action_type: null,
    last_action_at: null,
    next_action: null,
    expected_disposal_date: null,
    sla_due_on: addDays(body.received_at, category?.default_sla_days ?? 21),
    disposed_at: null,
    reopen_count: 0,
    escalation_level: 0,
    delay_risk: null,
    created_by: viewer.id,
    created_at: now,
    updated_at: now,
    institution_name: null,
    region: null,
    age_days: Math.max(0, Math.round((Date.parse(DEMO_TODAY) - Date.parse(body.received_at)) / 86_400_000)),
    beyond_sla: false,
    in_overlap: false,
  };
  world.cases.unshift(created);
  world.reviews.push({
    id: Math.max(...world.reviews.map((r) => r.id)) + 1,
    case_id: id,
    candidates: structuredClone(seeded.candidates),
    status: 'pending',
    decided_permanent_id: null,
    decided_by: null,
    decided_at: null,
    case_ref: created.case_ref,
    raw_institution_text: created.raw_institution_text,
    raw_state: created.raw_state,
    raw_district: created.raw_district,
    subject: created.subject,
    received_at: created.received_at,
    created_at: now,
  });
  return { case: created, resolution: { decision: 'pending_review', candidates: structuredClone(seeded.candidates) }, overlaps: [] };
}

const OPEN = OPEN_CASE_STATUSES;
/** §4.3 `ALLOWED`: action → (from statuses, to status). */
const ALLOWED: Record<ActionType, [from: readonly CaseStatus[], to: CaseStatus | null]> = {
  assign: [['received', 'transferred', 'escalated', 'reopened'], 'under_process'],
  transfer: [OPEN, 'transferred'],
  escalate: [OPEN, 'escalated'],
  interim_reply: [['under_process', 'escalated', 'reopened'], 'interim_reply'],
  remark: [[...OPEN, 'disposed'], null],
  dispose: [OPEN, 'disposed'],
  reopen: [['disposed'], 'reopened'],
};
const REMARKS_REQUIRED: readonly ActionType[] = ['transfer', 'escalate', 'dispose', 'reopen'];
const VERB: Record<ActionType, string> = {
  assign: 'assign',
  transfer: 'transfer',
  escalate: 'escalate',
  interim_reply: 'send an interim reply on',
  remark: 'add a remark to',
  dispose: 'dispose',
  reopen: 'reopen',
};

/** §4.2: heads and ROs act on cases in their own bureau; senior management may escalate or remark. */
function canAct(viewer: UserMe, c: CaseRead, action: ActionType): boolean {
  switch (viewer.role) {
    case 'senior_mgmt':
      return action === 'escalate' || action === 'remark';
    case 'bureau_head':
    case 'ro_officer':
      return c.current_bureau_id === viewer.bureau_id;
    case 'intake_operator':
      return false;
  }
}

export function applyAction(c: CaseRead, body: Partial<CaseActionIn>, viewer: UserMe): CaseActionResult {
  const type = body.action_type;
  if (type === undefined || !(type in ALLOWED)) {
    throw validationError({ action_type: ['Field required'] });
  }
  if (!canAct(viewer, c, type)) throw forbidden();

  const [from, to] = ALLOWED[type];
  if (!from.includes(c.status)) {
    throw fail(400, 'INVALID_TRANSITION', `Cannot ${VERB[type]} a case that is ${CASE_STATUS_LABELS[c.status].toLowerCase()}`, {
      details: { case_ref: c.case_ref, status: c.status, action_type: type, allowed_from: CASE_STATUSES.filter((s) => from.includes(s)) },
    });
  }
  const remarks = body.remarks?.trim() || null;
  if (REMARKS_REQUIRED.includes(type) && !remarks) {
    throw fail(400, 'REMARKS_REQUIRED', `Remarks are required to ${VERB[type]} a case`, {
      details: { case_ref: c.case_ref, action_type: type },
    });
  }
  const required: Partial<Record<ActionType, keyof CaseActionIn>> = {
    assign: 'to_officer_id',
    transfer: 'to_bureau_id',
    interim_reply: 'expected_disposal_date',
    dispose: 'outcome',
  };
  const field = required[type];
  if (field && (body[field] === undefined || body[field] === null)) {
    throw validationError({ [field]: ['Field required'] });
  }

  if (type === 'dispose' && !body.confirm_open_overlap) {
    const groups = activeGroupsOf(c.id);
    if (groups.length > 0) {
      const details: OpenOverlapErrorDetails = {
        case_ref: c.case_ref,
        group_ids: groups.map((g) => g.group.id),
        linked_case_refs: [
          ...new Set(groups.flatMap((g) => members(g).filter((m) => m.id !== c.id).map((m) => m.case_ref))),
        ],
      };
      const fixture = fixtures.errors.openOverlap;
      throw new MockApiError(409, {
        ...fixture,
        error: { ...fixture.error, message: `${c.case_ref} is part of an open overlap group. Confirm to dispose anyway.`, details },
      });
    }
  }

  const now = nowUtc();
  const action: CaseAction = {
    id: world.nextActionId++,
    case_id: c.id,
    action_type: type,
    actor_id: viewer.id,
    actor_name: viewer.name,
    bureau_id: c.current_bureau_id,
    from_bureau_id: null,
    to_bureau_id: null,
    to_officer_id: null,
    outcome: null,
    remarks,
    created_at: now,
  };
  switch (type) {
    case 'assign':
      c.assigned_officer_id = action.to_officer_id = body.to_officer_id ?? null;
      break;
    case 'transfer':
      action.from_bureau_id = c.current_bureau_id;
      c.current_bureau_id = action.to_bureau_id = body.to_bureau_id ?? c.current_bureau_id;
      c.assigned_officer_id = null;
      break;
    case 'escalate':
      c.escalation_level += 1;
      break;
    case 'interim_reply':
      c.expected_disposal_date = body.expected_disposal_date ?? null;
      break;
    case 'dispose':
      action.outcome = body.outcome ?? null;
      c.disposed_at = now;
      break;
    case 'reopen':
      c.reopen_count += 1;
      c.disposed_at = null;
      c.sla_due_on = addDays(DEMO_TODAY, categoryOf(c.category_id)?.default_sla_days ?? 21);
      break;
    case 'remark':
      break;
  }
  if (to) c.status = to;
  c.last_action_type = type;
  c.last_action_at = c.updated_at = now;
  world.actions.push(action);
  refreshDerived();
  return { case: c, action };
}

// ── Match review ─────────────────────────────────────────────────────────

/** POST /reviews/{id}/decide: the hero decision replays its fixture; any other is applied generically. */
export function decideReview(review: ReviewItem, body: { permanent_id?: unknown; none?: unknown }, viewer: UserMe): ReviewDecideResult {
  if (!(viewer.role === 'intake_operator' || viewer.is_admin)) throw forbidden();
  if (review.status !== 'pending') {
    throw fail(409, 'ALREADY_DECIDED', 'This match review has already been decided', {
      details: { review_id: review.id, status: review.status, decided_at: review.decided_at },
    });
  }
  const pid = typeof body.permanent_id === 'string' ? body.permanent_id : null;
  const inst = institutionOf(pid);
  if (!inst && body.none !== true) {
    throw validationError({ permanent_id: ['Pick an institution from the registry, or send {"none": true}'] });
  }
  const c = findCase(review.case_id);
  if (!c) throw notFound('Case');

  const hero = fixtures.reviewDecide.data;
  if (review.id === hero.review.id && pid === hero.review.decided_permanent_id) {
    const result = structuredClone(hero);
    Object.assign(review, result.review);
    Object.assign(c, result.case);
    for (const o of result.overlaps) {
      if (world.groups.some((g) => g.group.id === o.group_id)) continue;
      const anchor = institutionOf(c.permanent_id);
      world.groups.push({
        group: {
          id: o.group_id,
          level: o.level,
          anchor_key: c.permanent_id ?? '',
          anchor_name: anchor?.name ?? '',
          tier: o.tier,
          status: o.status,
          banner: o.banner,
          coordinator_id: null,
          coordinator_name: null,
          decided_by: null,
          decided_at: null,
          decision_remark: null,
          created_at: result.review.decided_at ?? nowUtc(),
          updated_at: result.review.decided_at ?? nowUtc(),
          case_count: 0,
          bureau_codes: [],
          // No pair evidence for this group in the fixtures.
          top_score: 0,
        },
        memberIds: [c.id, ...o.cases.map((x) => x.case_id)].sort((a, b) => a - b),
        reasons: o.reasons,
        clusters: [],
        pairs: [],
      });
    }
    refreshDerived();
    return result;
  }

  const now = nowUtc();
  const reviewPatch: Partial<ReviewItem> = {
    status: 'resolved',
    decided_permanent_id: inst?.permanent_id ?? null,
    decided_by: viewer.id,
    decided_at: now,
  };
  Object.assign(review, reviewPatch);
  let alias: InstitutionAlias | null = null;
  let casePatch: Partial<CaseRead> = { match_status: 'unresolved', updated_at: now };
  if (inst) {
    casePatch = {
      permanent_id: inst.permanent_id,
      match_score: review.candidates.find((x) => x.permanent_id === inst.permanent_id)?.score ?? null,
      match_status: 'reviewed',
      institution_name: inst.name,
      region: inst.region,
      updated_at: now,
    };
    alias = {
      id: world.nextAliasId++,
      permanent_id: inst.permanent_id,
      alias_norm: normalizeText(c.raw_institution_text),
      source: 'review',
      created_by: viewer.id,
      created_at: now,
    };
  }
  Object.assign(c, casePatch);
  refreshDerived();
  // The overlap re-run is the engine's job (#8); the mock creates no new groups here.
  return { review, case: c, alias, overlaps: [] };
}
