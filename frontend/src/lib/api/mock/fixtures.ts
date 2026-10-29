// Typed views of the shared contract fixtures (contract/fixtures, #2) for the mock layer.
// Each import is checked with `satisfies Contract<…>`: a missing, extra or mistyped field,
// or a wrong nullability, fails `tsc`. JSON imports type every string as `string`, so
// enum *values* cannot be checked at compile time; src/test/mockFixtures.test.ts covers those.

import type {
  AgeingBucket,
  Alert,
  ApiError,
  CaseActionIn,
  CaseActionResult,
  CaseCreate,
  CaseDetail,
  CaseIntakeResult,
  CaseRead,
  DashboardSummary,
  DemoResetResult,
  Envelope,
  Health,
  Institution360,
  InstitutionListItem,
  InstitutionStatusRow,
  LoginIn,
  LoginOut,
  Meta,
  OverlapDecisionIn,
  OverlapGroupDetail,
  OverlapGroupListItem,
  Page,
  ReadAllResult,
  ReportByKind,
  Resolution,
  ResolvePreviewIn,
  ReviewDecideIn,
  ReviewDecideResult,
  ReviewItem,
  UserMe,
  WorkloadRow,
} from '../types';

import errAlreadyDecided from '../../../../../contract/fixtures/errors/already_decided.json';
import errForbidden from '../../../../../contract/fixtures/errors/forbidden.json';
import errInvalidTransition from '../../../../../contract/fixtures/errors/invalid_transition.json';
import errNotFound from '../../../../../contract/fixtures/errors/not_found.json';
import errOpenOverlap from '../../../../../contract/fixtures/errors/open_overlap.json';
import errRemarksRequired from '../../../../../contract/fixtures/errors/remarks_required.json';
import errUnauthorized from '../../../../../contract/fixtures/errors/unauthorized.json';
import errValidation from '../../../../../contract/fixtures/errors/validation_error.json';
import getAlerts from '../../../../../contract/fixtures/get_alerts.json';
import getCases from '../../../../../contract/fixtures/get_cases.json';
import getCasesId from '../../../../../contract/fixtures/get_cases_id.json';
import getDashboardAgeing from '../../../../../contract/fixtures/get_dashboard_ageing.json';
import getDashboardInstitutions from '../../../../../contract/fixtures/get_dashboard_institutions.json';
import getDashboardSummary from '../../../../../contract/fixtures/get_dashboard_summary.json';
import getDashboardWorkload from '../../../../../contract/fixtures/get_dashboard_workload.json';
import getHealth from '../../../../../contract/fixtures/get_health.json';
import getInstitutions from '../../../../../contract/fixtures/get_institutions.json';
import getInstitutionsPermanentId from '../../../../../contract/fixtures/get_institutions_permanent_id.json';
import getMeta from '../../../../../contract/fixtures/get_meta.json';
import getOverlaps from '../../../../../contract/fixtures/get_overlaps.json';
import getOverlapsId from '../../../../../contract/fixtures/get_overlaps_id.json';
import getReportsAgeing from '../../../../../contract/fixtures/get_reports_ageing.json';
import getReportsBureau from '../../../../../contract/fixtures/get_reports_bureau.json';
import getReportsDisposalRate from '../../../../../contract/fixtures/get_reports_disposal_rate.json';
import getReportsInstitution from '../../../../../contract/fixtures/get_reports_institution.json';
import getReportsOverlaps from '../../../../../contract/fixtures/get_reports_overlaps.json';
import getReportsPeriodic from '../../../../../contract/fixtures/get_reports_periodic.json';
import getReportsRegion from '../../../../../contract/fixtures/get_reports_region.json';
import getReportsReopenRate from '../../../../../contract/fixtures/get_reports_reopen_rate.json';
import getReportsStatus from '../../../../../contract/fixtures/get_reports_status.json';
import getReviews from '../../../../../contract/fixtures/get_reviews.json';
import getUsersMeIntake from '../../../../../contract/fixtures/get_users_me_intake.json';
import getUsersMePgrcHead from '../../../../../contract/fixtures/get_users_me_pgrc_head.json';
import getUsersMeRbHead from '../../../../../contract/fixtures/get_users_me_rb_head.json';
import getUsersMeRoNw from '../../../../../contract/fixtures/get_users_me_ro_nw.json';
import getUsersMeSenior from '../../../../../contract/fixtures/get_users_me_senior.json';
import postAlertsIdRead from '../../../../../contract/fixtures/post_alerts_id_read.json';
import postAlertsReadAll from '../../../../../contract/fixtures/post_alerts_read_all.json';
import postAuthLoginIntake from '../../../../../contract/fixtures/post_auth_login_intake.json';
import postAuthLoginPgrcHead from '../../../../../contract/fixtures/post_auth_login_pgrc_head.json';
import postAuthLoginRbHead from '../../../../../contract/fixtures/post_auth_login_rb_head.json';
import postAuthLoginRoNw from '../../../../../contract/fixtures/post_auth_login_ro_nw.json';
import postAuthLoginSenior from '../../../../../contract/fixtures/post_auth_login_senior.json';
import postCases from '../../../../../contract/fixtures/post_cases.json';
import postCasesIdActions from '../../../../../contract/fixtures/post_cases_id_actions.json';
import postDemoReset from '../../../../../contract/fixtures/post_demo_reset.json';
import postInstitutionsResolve from '../../../../../contract/fixtures/post_institutions_resolve.json';
import postOverlapsIdDecision from '../../../../../contract/fixtures/post_overlaps_id_decision.json';
import postReviewsIdDecide from '../../../../../contract/fixtures/post_reviews_id_decide.json';
import reqPostAuthLogin from '../../../../../contract/fixtures/requests/post_auth_login.json';
import reqPostCases from '../../../../../contract/fixtures/requests/post_cases.json';
import reqPostCasesIdActions from '../../../../../contract/fixtures/requests/post_cases_id_actions.json';
import reqPostInstitutionsResolve from '../../../../../contract/fixtures/requests/post_institutions_resolve.json';
import reqPostOverlapsIdDecision from '../../../../../contract/fixtures/requests/post_overlaps_id_decision.json';
import reqPostReviewsIdDecide from '../../../../../contract/fixtures/requests/post_reviews_id_decide.json';

/** The contract type with every literal union widened to its primitive, as a JSON import is typed. */
type Widened<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer U)[]
        ? Widened<U>[]
        : T extends object
          ? { [K in keyof T]: Widened<T[K]> }
          : T;

type KeysOf<T> = T extends unknown ? keyof T : never;
type Prop<T, K> = T extends unknown ? (K extends keyof T ? T[K] : never) : never;

/** Maps any key of the fixture `J` that the contract `T` does not declare to `never`. */
type NoExtraKeys<J, T> = unknown extends T
  ? J
  : J extends readonly (infer E)[]
    ? NoExtraKeys<E, Prop<T, number>>[]
    : J extends object
      ? { [K in keyof J]: K extends KeysOf<T> ? NoExtraKeys<J[K], Prop<T, K>> : never }
      : J;

type Contract<J, T> = Widened<T> & NoExtraKeys<J, T>;

type Report<K extends keyof ReportByKind> = Envelope<ReportByKind[K]>;

export const fixtures = {
  health: getHealth satisfies Contract<typeof getHealth, Health> as Health,
  meta: getMeta satisfies Contract<typeof getMeta, Envelope<Meta>> as Envelope<Meta>,

  login: {
    senior: postAuthLoginSenior satisfies Contract<typeof postAuthLoginSenior, Envelope<LoginOut>> as Envelope<LoginOut>,
    pgrc_head: postAuthLoginPgrcHead satisfies Contract<typeof postAuthLoginPgrcHead, Envelope<LoginOut>> as Envelope<LoginOut>,
    rb_head: postAuthLoginRbHead satisfies Contract<typeof postAuthLoginRbHead, Envelope<LoginOut>> as Envelope<LoginOut>,
    ro_nw: postAuthLoginRoNw satisfies Contract<typeof postAuthLoginRoNw, Envelope<LoginOut>> as Envelope<LoginOut>,
    intake: postAuthLoginIntake satisfies Contract<typeof postAuthLoginIntake, Envelope<LoginOut>> as Envelope<LoginOut>,
  },
  usersMe: {
    senior: getUsersMeSenior satisfies Contract<typeof getUsersMeSenior, Envelope<UserMe>> as Envelope<UserMe>,
    pgrc_head: getUsersMePgrcHead satisfies Contract<typeof getUsersMePgrcHead, Envelope<UserMe>> as Envelope<UserMe>,
    rb_head: getUsersMeRbHead satisfies Contract<typeof getUsersMeRbHead, Envelope<UserMe>> as Envelope<UserMe>,
    ro_nw: getUsersMeRoNw satisfies Contract<typeof getUsersMeRoNw, Envelope<UserMe>> as Envelope<UserMe>,
    intake: getUsersMeIntake satisfies Contract<typeof getUsersMeIntake, Envelope<UserMe>> as Envelope<UserMe>,
  },

  institutions: getInstitutions satisfies Contract<typeof getInstitutions, Page<InstitutionListItem>> as Page<InstitutionListItem>,
  institution360: getInstitutionsPermanentId satisfies Contract<typeof getInstitutionsPermanentId, Envelope<Institution360>> as Envelope<Institution360>,
  resolve: postInstitutionsResolve satisfies Contract<typeof postInstitutionsResolve, Envelope<Resolution>> as Envelope<Resolution>,

  cases: getCases satisfies Contract<typeof getCases, Page<CaseRead>> as Page<CaseRead>,
  caseDetail: getCasesId satisfies Contract<typeof getCasesId, Envelope<CaseDetail>> as Envelope<CaseDetail>,
  intake: postCases satisfies Contract<typeof postCases, Envelope<CaseIntakeResult>> as Envelope<CaseIntakeResult>,
  caseAction: postCasesIdActions satisfies Contract<typeof postCasesIdActions, Envelope<CaseActionResult>> as Envelope<CaseActionResult>,

  reviews: getReviews satisfies Contract<typeof getReviews, Page<ReviewItem>> as Page<ReviewItem>,
  reviewDecide: postReviewsIdDecide satisfies Contract<typeof postReviewsIdDecide, Envelope<ReviewDecideResult>> as Envelope<ReviewDecideResult>,

  overlaps: getOverlaps satisfies Contract<typeof getOverlaps, Page<OverlapGroupListItem>> as Page<OverlapGroupListItem>,
  overlapDetail: getOverlapsId satisfies Contract<typeof getOverlapsId, Envelope<OverlapGroupDetail>> as Envelope<OverlapGroupDetail>,
  overlapDecision: postOverlapsIdDecision satisfies Contract<typeof postOverlapsIdDecision, Envelope<OverlapGroupDetail>> as Envelope<OverlapGroupDetail>,

  alerts: getAlerts satisfies Contract<typeof getAlerts, Page<Alert>> as Page<Alert>,
  alertRead: postAlertsIdRead satisfies Contract<typeof postAlertsIdRead, Envelope<Alert>> as Envelope<Alert>,
  alertsReadAll: postAlertsReadAll satisfies Contract<typeof postAlertsReadAll, Envelope<ReadAllResult>> as Envelope<ReadAllResult>,

  dashboardSummary: getDashboardSummary satisfies Contract<typeof getDashboardSummary, Envelope<DashboardSummary>> as Envelope<DashboardSummary>,
  dashboardWorkload: getDashboardWorkload satisfies Contract<typeof getDashboardWorkload, Envelope<WorkloadRow[]>> as Envelope<WorkloadRow[]>,
  dashboardAgeing: getDashboardAgeing satisfies Contract<typeof getDashboardAgeing, Envelope<AgeingBucket[]>> as Envelope<AgeingBucket[]>,
  dashboardInstitutions: getDashboardInstitutions satisfies Contract<typeof getDashboardInstitutions, Envelope<InstitutionStatusRow[]>> as Envelope<InstitutionStatusRow[]>,

  reports: {
    bureau: getReportsBureau satisfies Contract<typeof getReportsBureau, Report<'bureau'>> as Report<'bureau'>,
    region: getReportsRegion satisfies Contract<typeof getReportsRegion, Report<'region'>> as Report<'region'>,
    institution: getReportsInstitution satisfies Contract<typeof getReportsInstitution, Report<'institution'>> as Report<'institution'>,
    status: getReportsStatus satisfies Contract<typeof getReportsStatus, Report<'status'>> as Report<'status'>,
    ageing: getReportsAgeing satisfies Contract<typeof getReportsAgeing, Report<'ageing'>> as Report<'ageing'>,
    disposal_rate: getReportsDisposalRate satisfies Contract<typeof getReportsDisposalRate, Report<'disposal_rate'>> as Report<'disposal_rate'>,
    reopen_rate: getReportsReopenRate satisfies Contract<typeof getReportsReopenRate, Report<'reopen_rate'>> as Report<'reopen_rate'>,
    overlaps: getReportsOverlaps satisfies Contract<typeof getReportsOverlaps, Report<'overlaps'>> as Report<'overlaps'>,
    periodic: getReportsPeriodic satisfies Contract<typeof getReportsPeriodic, Report<'periodic'>> as Report<'periodic'>,
  } satisfies { [K in keyof ReportByKind]: Report<K> },

  demoReset: postDemoReset satisfies Contract<typeof postDemoReset, Envelope<DemoResetResult>> as Envelope<DemoResetResult>,

  errors: {
    alreadyDecided: errAlreadyDecided satisfies Contract<typeof errAlreadyDecided, ApiError> as ApiError,
    forbidden: errForbidden satisfies Contract<typeof errForbidden, ApiError> as ApiError,
    invalidTransition: errInvalidTransition satisfies Contract<typeof errInvalidTransition, ApiError> as ApiError,
    notFound: errNotFound satisfies Contract<typeof errNotFound, ApiError> as ApiError,
    openOverlap: errOpenOverlap satisfies Contract<typeof errOpenOverlap, ApiError> as ApiError,
    remarksRequired: errRemarksRequired satisfies Contract<typeof errRemarksRequired, ApiError> as ApiError,
    unauthorized: errUnauthorized satisfies Contract<typeof errUnauthorized, ApiError> as ApiError,
    validation: errValidation satisfies Contract<typeof errValidation, ApiError> as ApiError,
  },

  requests: {
    login: reqPostAuthLogin satisfies Contract<typeof reqPostAuthLogin, LoginIn> as LoginIn,
    resolve: reqPostInstitutionsResolve satisfies Contract<typeof reqPostInstitutionsResolve, ResolvePreviewIn> as ResolvePreviewIn,
    createCase: reqPostCases satisfies Contract<typeof reqPostCases, CaseCreate> as CaseCreate,
    caseAction: reqPostCasesIdActions satisfies Contract<typeof reqPostCasesIdActions, CaseActionIn> as CaseActionIn,
    reviewDecide: reqPostReviewsIdDecide satisfies Contract<typeof reqPostReviewsIdDecide, ReviewDecideIn> as ReviewDecideIn,
    overlapDecision: reqPostOverlapsIdDecision satisfies Contract<typeof reqPostOverlapsIdDecision, OverlapDecisionIn> as OverlapDecisionIn,
  },
};

export type Persona = keyof typeof fixtures.login;
