// src/lib/api/types.ts — mirrors the backend Pydantic schemas exactly (snake_case on purpose).
// Source: docs/Unicomply PRD.md §5 and §4.1; read-model shapes as served by contract/fixtures (#2).
// Nullable columns are `T | null` (the key is always present); optional request fields are `?`.

import type {
  ActionType,
  AgeingBucketKey,
  AliasSource,
  AlertSeverity,
  AlertType,
  ApiErrorCode,
  BureauKind,
  CaseStatus,
  CategoryCode,
  ComplainantType,
  DisposeOutcome,
  InstType,
  MatchStatus,
  OpenCaseStatus,
  OverlapGroupStatus,
  OverlapLevel,
  OverlapTier,
  PairDecision,
  Region,
  ReportFormat,
  ReportKind,
  ResolutionDecision,
  ReviewStatus,
  Role,
  SourceChannel,
} from './enums';

/** `YYYY-MM-DD` (e.g. `received_at`, `sla_due_on`). */
export type IsoDate = string;
/** UTC ISO 8601 ending in `Z` (e.g. `created_at`); parse with `parseUtc()`. */
export type UtcTimestamp = string;
/** AICTE Permanent ID, `1-` + 6–10 digits. */
export type PermanentId = string;

// ── Envelopes & errors (base blueprint §4) ───────────────────────────────

export type Envelope<T> = { success: true; data: T };
export type Pagination = { total: number; page: number; limit: number; total_pages: number };
export type Page<T> = { success: true; data: T[]; pagination: Pagination };

export type ApiErrorDetail = {
  code: ApiErrorCode;
  message: string;
  /** Only on VALIDATION_ERROR: field path → messages. */
  fields?: Record<string, string[]>;
  /** Only when a domain error needs structured data, e.g. OpenOverlapErrorDetails. */
  details?: unknown;
};
export type ApiError = { success: false; error: ApiErrorDetail };

/** `error.details` on 409 OPEN_OVERLAP. */
export type OpenOverlapErrorDetails = {
  case_ref: string;
  group_ids: number[];
  linked_case_refs: string[];
};

/** List endpoints accept `?page=1&limit=20` (limit max 100). */
export type PageParams = { page?: number; limit?: number };

// ── Health, auth, users, meta, demo ──────────────────────────────────────

/** GET /health — the only response without an envelope. */
export type Health = {
  status: 'ok';
  timestamp: UtcTimestamp;
  environment: 'development' | 'demo' | 'test';
  version: string;
};

export type UserMe = {
  id: number;
  email: string;
  name: string;
  role: Role;
  bureau_id: number | null;
  region: Region | null;
  is_admin: boolean;
};

export type LoginIn = { email: string; password: string };
export type LoginOut = { access_token: string; token_type: 'bearer'; user: UserMe };

export type CodeName<C extends string> = { code: C; name: string };

export type Bureau = {
  id: number;
  code: string;
  name: string;
  kind: BureauKind;
  region: Region | null;
};

export type Category = {
  id: number;
  code: CategoryCode;
  name: string;
  default_sla_days: number;
  default_bureau_code: string;
};

/** Case officer: a data row with no login (§0); pick list for assign / coordinator. */
export type Officer = { id: number; name: string; bureau_id: number };

export type Meta = {
  bureaus: Bureau[];
  regions: CodeName<Region>[];
  categories: Category[];
  statuses: CodeName<CaseStatus>[];
  channels: CodeName<SourceChannel>[];
  action_types: CodeName<ActionType>[];
  complainant_types: CodeName<ComplainantType>[];
  dispose_outcomes: CodeName<DisposeOutcome>[];
  inst_types: CodeName<InstType>[];
  officers: Officer[];
};

export type DemoResetResult = { status: 'reset' };

// ── Institutions ─────────────────────────────────────────────────────────

export type Trust = { id: number; name: string; address: string; state: string };

/** Minimal institution reference (parent, departments, trust siblings). */
export type InstitutionLite = {
  permanent_id: PermanentId;
  name: string;
  district: string;
  state: string;
  inst_type: InstType;
};

export type InstitutionListItem = {
  permanent_id: PermanentId;
  name: string;
  name_norm: string;
  acronym: string | null;
  address: string;
  district: string;
  state: string;
  pin: string;
  region: Region;
  inst_type: InstType;
  year_est: number | null;
  trust_id: number | null;
  parent_id: PermanentId | null;
  is_active: boolean;
  // derived
  trust_name: string | null;
  open_case_count: number;
};

export type InstitutionListParams = PageParams & {
  q?: string;
  state?: string;
  region?: Region;
  inst_type?: InstType;
};

export type CaseCounts = { total: number; open: number; disposed: number; beyond_sla: number };

export type BureauCaseColumn = {
  bureau_id: number;
  bureau_code: string;
  bureau_name: string;
  cases: LinkedCaseCard[];
};

/** GET /institutions/{permanent_id} */
export type Institution360 = {
  institution: InstitutionListItem;
  trust: Trust | null;
  parent: InstitutionLite | null;
  departments: InstitutionLite[];
  trust_institutions: InstitutionLite[];
  case_counts: CaseCounts;
  cases_by_bureau: BureauCaseColumn[];
  /** `cases` lists every member of each group. */
  overlap_groups: OverlapSummary[];
};

export type ResolvePreviewIn = {
  raw_text: string;
  state?: string | null;
  district?: string | null;
};

export type Candidate = {
  permanent_id: PermanentId;
  name: string;
  district: string;
  state: string;
  score: number;
  reasons: string[];
};

export type Resolution = {
  decision: ResolutionDecision;
  /** Top-k, best first. */
  candidates: Candidate[];
};

export type InstitutionAlias = {
  id: number;
  permanent_id: PermanentId;
  alias_norm: string;
  source: AliasSource;
  created_by: number | null;
  created_at: UtcTimestamp;
};

// ── Cases ────────────────────────────────────────────────────────────────

/** POST /cases body. Limits mirror the Pydantic `CaseCreate`. */
export type CaseCreate = {
  source_channel: SourceChannel;
  /** max 60, e.g. CPGRAMS registration no. */
  external_ref?: string | null;
  received_at: IsoDate;
  complainant_type: ComplainantType;
  /** max 120 */
  complainant_name?: string | null;
  /** 3–300 */
  raw_institution_text: string;
  /** max 60 */
  raw_state?: string | null;
  /** max 60 */
  raw_district?: string | null;
  /** `^1-\d{6,10}$`, if the operator already knows it */
  permanent_id?: PermanentId | null;
  category_id: number;
  /** 3–200 */
  subject: string;
  /** 10–4000 */
  description: string;
  /** default = the category's default bureau */
  route_to_bureau_id?: number | null;
};

/** `CaseRead`: every §4.1 `case` column plus derived read-only fields. */
export type CaseRead = {
  id: number;
  case_ref: string;
  source_channel: SourceChannel;
  external_ref: string | null;
  received_at: IsoDate;
  complainant_type: ComplainantType;
  complainant_name: string | null;
  raw_institution_text: string;
  raw_state: string | null;
  raw_district: string | null;
  permanent_id: PermanentId | null;
  match_score: number | null;
  match_status: MatchStatus;
  category_id: number;
  category_suggested_id: number | null;
  subject: string;
  description: string;
  status: CaseStatus;
  current_bureau_id: number;
  assigned_officer_id: number | null;
  last_action_type: ActionType | null;
  last_action_at: UtcTimestamp | null;
  next_action: string | null;
  expected_disposal_date: IsoDate | null;
  sla_due_on: IsoDate;
  disposed_at: UtcTimestamp | null;
  reopen_count: number;
  escalation_level: number;
  delay_risk: number | null;
  created_by: number;
  created_at: UtcTimestamp;
  updated_at: UtcTimestamp;
  // derived, never stored
  institution_name: string | null;
  region: Region | null;
  age_days: number;
  beyond_sla: boolean;
  in_overlap: boolean;
};
export type CaseListItem = CaseRead;

export type CaseListParams = PageParams & {
  q?: string;
  permanent_id?: PermanentId;
  case_ref?: string;
  bureau_id?: number;
  region?: Region;
  category?: CategoryCode;
  status?: CaseStatus;
  from?: IsoDate;
  to?: IsoDate;
  beyond_sla?: boolean;
  in_overlap?: boolean;
};

/** One `case_action` row: the action history / timeline. */
export type CaseAction = {
  id: number;
  case_id: number;
  action_type: ActionType;
  actor_id: number;
  actor_name: string;
  bureau_id: number;
  from_bureau_id: number | null;
  to_bureau_id: number | null;
  to_officer_id: number | null;
  outcome: DisposeOutcome | null;
  remarks: string | null;
  created_at: UtcTimestamp;
};

/** POST /cases/{id}/actions body. Per-action rules (remarks, date, outcome) live in §4.3. */
export type CaseActionIn = {
  action_type: ActionType;
  /** max 2000; required for transfer, escalate, dispose, reopen */
  remarks?: string | null;
  /** required for transfer */
  to_bureau_id?: number | null;
  to_officer_id?: number | null;
  /** required for interim_reply */
  expected_disposal_date?: IsoDate | null;
  /** required for dispose */
  outcome?: DisposeOutcome | null;
  /** must be true to dispose a case in an open overlap group (else 409 OPEN_OVERLAP) */
  confirm_open_overlap?: boolean;
};

export type CaseActionResult = { case: CaseRead; action: CaseAction };

export type CaseInstitution = InstitutionLite & {
  region: Region;
  trust_id: number | null;
  trust_name: string | null;
};

/** GET /cases/{id} */
export type CaseDetail = {
  case: CaseRead;
  /** null while the institution is unresolved */
  institution: CaseInstitution | null;
  actions: CaseAction[];
  /** Open or confirmed groups containing this case; `cases` excludes this case. */
  overlaps: OverlapSummary[];
};

/** POST /cases → 201 */
export type CaseIntakeResult = {
  case: CaseRead;
  resolution: Resolution;
  /** `cases` excludes the new case. */
  overlaps: OverlapSummary[];
};

// ── Overlaps ─────────────────────────────────────────────────────────────

/** Summary card of a case in an overlap group; shown even outside the viewer's scope (§4.2). */
export type LinkedCaseCard = {
  case_id: number;
  case_ref: string;
  permanent_id: PermanentId | null;
  institution_name: string | null;
  bureau_id: number;
  bureau_code: string;
  status: CaseStatus;
  category_id: number;
  category_code: CategoryCode;
  subject: string;
  assigned_officer_id: number | null;
  assigned_officer_name: string | null;
  last_action_type: ActionType | null;
  last_action_at: UtcTimestamp | null;
  received_at: IsoDate;
  /** Whether the viewer may open the full case. */
  in_scope: boolean;
};

export type OverlapSummary = {
  group_id: number;
  level: OverlapLevel;
  tier: OverlapTier;
  status: OverlapGroupStatus;
  /** "Potential Overlapping Cases – Coordination Required" for probable. */
  banner: string;
  cases: LinkedCaseCard[];
  reasons: string[];
};

export type OverlapGroupListItem = {
  id: number;
  level: OverlapLevel;
  /** Permanent ID, `parent:<permanent_id>` or `trust:<id>`. */
  anchor_key: string;
  anchor_name: string;
  tier: OverlapTier;
  status: OverlapGroupStatus;
  banner: string;
  coordinator_id: number | null;
  coordinator_name: string | null;
  decided_by: number | null;
  decided_at: UtcTimestamp | null;
  decision_remark: string | null;
  created_at: UtcTimestamp;
  updated_at: UtcTimestamp;
  case_count: number;
  bureau_codes: string[];
  top_score: number;
};

export type OverlapListParams = PageParams & {
  tier?: OverlapTier;
  status?: OverlapGroupStatus;
  level?: OverlapLevel;
  bureau_id?: number;
};

/** Issue cluster inside a group (complete linkage). */
export type OverlapCluster = { cluster_id: number; label: string; case_ids: number[] };

/** One `overlap_pair` row: pairwise evidence, `case_a_id < case_b_id`. */
export type OverlapPair = {
  id: number;
  case_a_id: number;
  case_b_id: number;
  level: OverlapLevel;
  score: number;
  reasons: string[];
  decision: PairDecision;
  created_at: UtcTimestamp;
};

/** GET /overlaps/{id} and POST /overlaps/{id}/decision */
export type OverlapGroupDetail = {
  group: OverlapGroupListItem;
  cases: LinkedCaseCard[];
  clusters: OverlapCluster[];
  pairs: OverlapPair[];
  reasons: string[];
};

/** POST /overlaps/{id}/decision body. Dismiss always needs a remark (§4.3). */
export type OverlapDecisionIn =
  | { decision: 'confirm'; coordinator_id: number; remark?: string | null }
  | { decision: 'dismiss'; remark: string }
  | { decision: 'resolve'; remark?: string | null };

// ── Match review ─────────────────────────────────────────────────────────

export type ReviewItem = {
  id: number;
  case_id: number;
  candidates: Candidate[];
  status: ReviewStatus;
  decided_permanent_id: PermanentId | null;
  decided_by: number | null;
  decided_at: UtcTimestamp | null;
  // from the case
  case_ref: string;
  raw_institution_text: string;
  raw_state: string | null;
  raw_district: string | null;
  subject: string;
  received_at: IsoDate;
  created_at: UtcTimestamp;
};

export type ReviewListParams = PageParams & { status?: ReviewStatus };

/** POST /reviews/{id}/decide body: pick an institution, or mark "not in registry". */
export type ReviewDecideIn = { permanent_id: PermanentId } | { none: true };

export type ReviewDecideResult = {
  review: ReviewItem;
  case: CaseRead;
  /** null when decided with `{none: true}` */
  alias: InstitutionAlias | null;
  /** Groups created or extended by the overlap re-run; `cases` excludes this case. */
  overlaps: OverlapSummary[];
};

// ── Alerts ───────────────────────────────────────────────────────────────

export type Alert = {
  id: number;
  type: AlertType;
  severity: AlertSeverity;
  recipient_id: number;
  case_id: number | null;
  group_id: number | null;
  permanent_id: PermanentId | null;
  title: string;
  body: string;
  /** `type:recipient:entity:date` */
  dedupe_key: string;
  is_read: boolean;
  created_at: UtcTimestamp;
  // derived, for grouping per institution per day
  case_ref: string | null;
  institution_name: string | null;
};

export type AlertListParams = PageParams & { unread_only?: boolean };

export type ReadAllResult = { updated: number };

// ── Dashboard ────────────────────────────────────────────────────────────

export type DashboardSummary = {
  as_of: IsoDate;
  total: number;
  pending: number;
  under_process: number;
  disposed: number;
  transferred: number;
  escalated: number;
  beyond_sla: number;
  open_overlaps: number;
};

/** GET /dashboard/workload — open cases per current bureau. */
export type WorkloadRow = {
  bureau_id: number;
  bureau_code: string;
  bureau_name: string;
  open: number;
  beyond_sla: number;
  by_status: Record<OpenCaseStatus, number>;
};

/** GET /dashboard/ageing — open cases by days since `received_at`. */
export type AgeingBucket = {
  bucket: AgeingBucketKey;
  label: string;
  min_days: number;
  /** null for the open-ended 45+ bucket */
  max_days: number | null;
  count: number;
};

/** GET /dashboard/institutions — institution-wise status table. */
export type InstitutionStatusRow = {
  permanent_id: PermanentId;
  name: string;
  district: string;
  state: string;
  region: Region;
  total: number;
  open: number;
  beyond_sla: number;
  open_overlap_groups: number;
  by_status: Record<CaseStatus, number>;
};

export type DashboardInstitutionsParams = { limit?: number };

// ── Reports ──────────────────────────────────────────────────────────────

export type ReportParams = {
  from?: IsoDate;
  to?: IsoDate;
  group_by?: string;
  format?: ReportFormat;
};

export type ReportColumn<Row> = { key: Extract<keyof Row, string>; label: string };

/** GET /reports/{kind}?format=json. With format=csv the header is `columns[].label`, the body `rows`. */
export type Report<K extends ReportKind, Row, Totals> = {
  kind: K;
  from: IsoDate;
  to: IsoDate;
  group_by: string;
  generated_at: UtcTimestamp;
  columns: ReportColumn<Row>[];
  rows: Row[];
  totals: Totals;
};

export type BureauReportRow = CaseCounts & {
  bureau_code: string;
  bureau_name: string;
  avg_open_age_days: number | null;
};

export type RegionReportRow = CaseCounts & {
  /** null = institution not yet resolved */
  region: Region | null;
  region_name: string;
};

export type InstitutionReportRow = CaseCounts & {
  permanent_id: PermanentId;
  name: string;
  region: Region;
  reopened: number;
  overlap_groups: number;
};

export type StatusReportRow = { status: CaseStatus; status_name: string; count: number };
export type StatusReportTotals = { count: number };

export type AgeingReportRow = { bucket: AgeingBucketKey; label: string; open: number; beyond_sla: number };
export type AgeingReportTotals = { open: number; beyond_sla: number };

export type DisposalRateRow = {
  bureau_code: string;
  received: number;
  disposed: number;
  /** null when nothing was received */
  disposal_rate: number | null;
};
export type DisposalRateTotals = Omit<DisposalRateRow, 'bureau_code'>;

export type ReopenRateRow = {
  bureau_code: string;
  /** disposed at least once */
  disposed: number;
  reopened: number;
  /** null when nothing was disposed */
  reopen_rate: number | null;
};
export type ReopenRateTotals = Omit<ReopenRateRow, 'bureau_code'>;

export type OverlapsReportRow = {
  level: OverlapLevel;
  tier: OverlapTier;
  status: OverlapGroupStatus;
  groups: number;
  cases: number;
};
export type OverlapsReportTotals = { groups: number; cases: number };

export type PeriodicReportRow = {
  /** `YYYY-MM` (monthly) or `YYYY-Qn` (quarterly) */
  period: string;
  received: number;
  disposed: number;
  reopened: number;
};
export type PeriodicReportTotals = Omit<PeriodicReportRow, 'period'>;

/** Response `data` for each report kind. */
export type ReportByKind = {
  bureau: Report<'bureau', BureauReportRow, CaseCounts>;
  region: Report<'region', RegionReportRow, CaseCounts>;
  institution: Report<'institution', InstitutionReportRow, CaseCounts>;
  status: Report<'status', StatusReportRow, StatusReportTotals>;
  ageing: Report<'ageing', AgeingReportRow, AgeingReportTotals>;
  disposal_rate: Report<'disposal_rate', DisposalRateRow, DisposalRateTotals>;
  reopen_rate: Report<'reopen_rate', ReopenRateRow, ReopenRateTotals>;
  overlaps: Report<'overlaps', OverlapsReportRow, OverlapsReportTotals>;
  periodic: Report<'periodic', PeriodicReportRow, PeriodicReportTotals>;
};
export type AnyReport = ReportByKind[ReportKind];

// ── Helpers (base blueprint §7) ──────────────────────────────────────────

/** SQLite drops the UTC offset; treat offset-less timestamps as UTC. */
export const parseUtc = (s: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`);

/** Human-readable message from any API error. Never render raw error objects. */
export function apiErrorMessage(err: unknown): string {
  const body = (err as { response?: { data?: ApiError } })?.response?.data;
  return body?.error?.message ?? 'Something went wrong — please try again';
}
