// src/lib/api/enums.ts — string-literal unions + display labels for every enum in PRD §4.1 / §4.3 / §5.
// Each enum is a readonly tuple (iterate it for dropdowns or z.enum()), a union type and a label map.
// Labels match the `name` values served by GET /meta.

// ── Roles & organisation ─────────────────────────────────────────────────

export const ROLES = ['senior_mgmt', 'bureau_head', 'ro_officer', 'intake_operator'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  senior_mgmt: 'Senior management',
  bureau_head: 'Bureau head',
  ro_officer: 'Regional Office officer',
  intake_operator: 'Intake operator',
};

export const BUREAU_KINDS = ['bureau', 'cell', 'regional_office'] as const;
export type BureauKind = (typeof BUREAU_KINDS)[number];
export const BUREAU_KIND_LABELS: Record<BureauKind, string> = {
  bureau: 'Bureau',
  cell: 'Cell',
  regional_office: 'Regional Office',
};

export const REGIONS = [
  'central',
  'eastern',
  'north_eastern',
  'northern',
  'north_western',
  'south_central',
  'south_eastern',
  'southern',
  'south_western',
  'western',
] as const;
export type Region = (typeof REGIONS)[number];
export const REGION_LABELS: Record<Region, string> = {
  central: 'Central',
  eastern: 'Eastern',
  north_eastern: 'North-Eastern',
  northern: 'Northern',
  north_western: 'North-Western',
  south_central: 'South-Central',
  south_eastern: 'South-Eastern',
  southern: 'Southern',
  south_western: 'South-Western',
  western: 'Western',
};

// ── Institutions ─────────────────────────────────────────────────────────

export const INST_TYPES = [
  'engineering',
  'management',
  'pharmacy',
  'polytechnic',
  'university',
  'university_department',
] as const;
export type InstType = (typeof INST_TYPES)[number];
export const INST_TYPE_LABELS: Record<InstType, string> = {
  engineering: 'Engineering & Technology',
  management: 'Management',
  pharmacy: 'Pharmacy',
  polytechnic: 'Polytechnic',
  university: 'University',
  university_department: 'University department',
};

export const ALIAS_SOURCES = ['seed', 'review', 'official'] as const;
export type AliasSource = (typeof ALIAS_SOURCES)[number];
export const ALIAS_SOURCE_LABELS: Record<AliasSource, string> = {
  seed: 'Seed data',
  review: 'Confirmed by a reviewer',
  official: 'Official',
};

// ── Cases ────────────────────────────────────────────────────────────────

export const CASE_STATUSES = [
  'received',
  'under_process',
  'interim_reply',
  'transferred',
  'escalated',
  'reopened',
  'disposed',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
/** Every status except `disposed` counts as pending (§4.1 derived fields). */
export type OpenCaseStatus = Exclude<CaseStatus, 'disposed'>;
export const OPEN_CASE_STATUSES = CASE_STATUSES.filter(
  (s): s is OpenCaseStatus => s !== 'disposed',
);
export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  received: 'Received',
  under_process: 'Under process',
  interim_reply: 'Interim reply',
  transferred: 'Transferred',
  escalated: 'Escalated',
  reopened: 'Reopened',
  disposed: 'Disposed',
};

export const SOURCE_CHANNELS = [
  'cpgrams',
  'aicte_portal',
  'email',
  'letter',
  'ro_referral',
  'rb_suo_motu',
  'inspection',
] as const;
export type SourceChannel = (typeof SOURCE_CHANNELS)[number];
export const SOURCE_CHANNEL_LABELS: Record<SourceChannel, string> = {
  cpgrams: 'CPGRAMS',
  aicte_portal: 'AICTE feedback portal',
  email: 'Email',
  letter: 'Letter',
  ro_referral: 'Regional Office referral',
  rb_suo_motu: 'RB suo motu',
  inspection: 'Inspection',
};

export const COMPLAINANT_TYPES = [
  'student',
  'parent',
  'faculty',
  'staff',
  'public',
  'anonymous',
  'internal',
] as const;
export type ComplainantType = (typeof COMPLAINANT_TYPES)[number];
export const COMPLAINANT_TYPE_LABELS: Record<ComplainantType, string> = {
  student: 'Student',
  parent: 'Parent',
  faculty: 'Faculty',
  staff: 'Staff',
  public: 'Member of the public',
  anonymous: 'Anonymous',
  internal: 'AICTE (internal)',
};

export const CATEGORY_CODES = [
  'fee_refund',
  'certificate_withheld',
  'admission_irregularity',
  'faculty_shortage',
  'infrastructure_deficiency',
  'salary_non_payment',
  'ragging',
  'unapproved_course',
  'scholarship',
  'harassment',
  'exam_result',
  'other',
] as const;
export type CategoryCode = (typeof CATEGORY_CODES)[number];
export const CATEGORY_LABELS: Record<CategoryCode, string> = {
  fee_refund: 'Fee refund',
  certificate_withheld: 'Certificates withheld',
  admission_irregularity: 'Admission irregularity',
  faculty_shortage: 'Faculty shortage',
  infrastructure_deficiency: 'Infrastructure deficiency',
  salary_non_payment: 'Salary non-payment',
  ragging: 'Ragging',
  unapproved_course: 'Unapproved course',
  scholarship: 'Scholarship',
  harassment: 'Harassment',
  exam_result: 'Exam result',
  other: 'Other',
};

export const ACTION_TYPES = [
  'assign',
  'transfer',
  'escalate',
  'interim_reply',
  'remark',
  'dispose',
  'reopen',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];
export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  assign: 'Assign officer',
  transfer: 'Transfer',
  escalate: 'Escalate',
  interim_reply: 'Interim reply',
  remark: 'Add remark',
  dispose: 'Dispose',
  reopen: 'Reopen',
};

export const DISPOSE_OUTCOMES = [
  'redressed',
  'action_taken_against_institution',
  'rejected_not_maintainable',
  'forwarded_to_institution_grc',
] as const;
export type DisposeOutcome = (typeof DISPOSE_OUTCOMES)[number];
export const DISPOSE_OUTCOME_LABELS: Record<DisposeOutcome, string> = {
  redressed: 'Redressed',
  action_taken_against_institution: 'Action taken against institution',
  rejected_not_maintainable: 'Rejected – not maintainable',
  forwarded_to_institution_grc: 'Forwarded to institution GRC',
};

// ── Institution resolution & match review ────────────────────────────────

export const RESOLUTION_DECISIONS = ['auto', 'pending_review', 'unresolved', 'provided'] as const;
export type ResolutionDecision = (typeof RESOLUTION_DECISIONS)[number];
export const RESOLUTION_DECISION_LABELS: Record<ResolutionDecision, string> = {
  auto: 'Matched automatically',
  pending_review: 'Needs review',
  unresolved: 'Not matched',
  provided: 'Permanent ID provided',
};

/** `case.match_status`: a resolution decision, or `reviewed` once a match review is decided. */
export const MATCH_STATUSES = [...RESOLUTION_DECISIONS, 'reviewed'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];
export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  ...RESOLUTION_DECISION_LABELS,
  reviewed: 'Confirmed by a reviewer',
};

export const REVIEW_STATUSES = ['pending', 'resolved'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'Pending',
  resolved: 'Resolved',
};

// ── Overlap engine ───────────────────────────────────────────────────────

export const OVERLAP_TIERS = ['probable', 'possible'] as const;
export type OverlapTier = (typeof OVERLAP_TIERS)[number];
export const OVERLAP_TIER_LABELS: Record<OverlapTier, string> = {
  probable: 'Probable',
  possible: 'Possible',
};

export const OVERLAP_LEVELS = ['institution', 'parent', 'trust'] as const;
export type OverlapLevel = (typeof OVERLAP_LEVELS)[number];
export const OVERLAP_LEVEL_LABELS: Record<OverlapLevel, string> = {
  institution: 'Same institution',
  parent: 'Same parent university',
  trust: 'Same trust',
};

export const OVERLAP_GROUP_STATUSES = ['open', 'confirmed', 'dismissed', 'resolved'] as const;
export type OverlapGroupStatus = (typeof OVERLAP_GROUP_STATUSES)[number];
export const OVERLAP_GROUP_STATUS_LABELS: Record<OverlapGroupStatus, string> = {
  open: 'Open',
  confirmed: 'Confirmed',
  dismissed: 'Dismissed',
  resolved: 'Resolved',
};

export const PAIR_DECISIONS = ['none', 'confirmed', 'dismissed'] as const;
export type PairDecision = (typeof PAIR_DECISIONS)[number];
export const PAIR_DECISION_LABELS: Record<PairDecision, string> = {
  none: 'Not decided',
  confirmed: 'Confirmed',
  dismissed: 'Dismissed',
};

export const OVERLAP_DECISIONS = ['confirm', 'dismiss', 'resolve'] as const;
export type OverlapDecision = (typeof OVERLAP_DECISIONS)[number];
export const OVERLAP_DECISION_LABELS: Record<OverlapDecision, string> = {
  confirm: 'Confirm',
  dismiss: 'Dismiss',
  resolve: 'Resolve',
};

/** Banner text per tier (§4.5); the Probable text is the PS's exact wording. */
export const OVERLAP_BANNERS: Record<OverlapTier, string> = {
  probable: 'Potential Overlapping Cases – Coordination Required',
  possible: 'Possible Overlapping Cases – Review Suggested',
};

// ── Alerts ───────────────────────────────────────────────────────────────

export const ALERT_TYPES = ['overlap', 'sla_warning', 'sla_breach', 'escalation', 'reminder'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];
export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  overlap: 'Overlap',
  sla_warning: 'SLA warning',
  sla_breach: 'SLA breach',
  escalation: 'Escalation',
  reminder: 'No-action reminder',
};

export const ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];
export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
};

// ── Dashboard & reports ──────────────────────────────────────────────────

export const AGEING_BUCKETS = ['0_7', '8_14', '15_21', '22_45', '45_plus'] as const;
export type AgeingBucketKey = (typeof AGEING_BUCKETS)[number];
export const AGEING_BUCKET_LABELS: Record<AgeingBucketKey, string> = {
  '0_7': '0–7 days',
  '8_14': '8–14 days',
  '15_21': '15–21 days',
  '22_45': '22–45 days',
  '45_plus': '45+ days',
};

export const REPORT_KINDS = [
  'bureau',
  'region',
  'institution',
  'status',
  'ageing',
  'disposal_rate',
  'reopen_rate',
  'overlaps',
  'periodic',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  bureau: 'Bureau-wise',
  region: 'Region-wise',
  institution: 'Institution-wise history',
  status: 'Status-wise',
  ageing: 'Ageing',
  disposal_rate: 'Disposal rate',
  reopen_rate: 'Reopen rate',
  overlaps: 'Overlaps',
  periodic: 'Monthly / quarterly',
};

export const REPORT_FORMATS = ['json', 'csv'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

// ── Errors (base blueprint master reference + PRD §5 domain codes) ──────

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'TOKEN_EXPIRED',
  'TOKEN_INVALID',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'CONFLICT',
  'INTERNAL_ERROR',
  'HTTP_ERROR',
  'INVALID_TRANSITION',
  'REMARKS_REQUIRED',
  'OPEN_OVERLAP',
  'ALREADY_DECIDED',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
