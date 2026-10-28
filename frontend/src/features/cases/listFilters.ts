import { CASE_STATUSES, REGIONS, type CaseStatus, type Region } from '../../lib/api/enums';
import type { CaseListParams } from '../../lib/api/types';

export const PAGE_SIZE = 20;
export const PAGE_SIZES = [10, 20, 50, 100];

/** The filters of GET /cases as the page holds them. The URL query string is the source of truth (PRD §7). */
export interface CaseFilters {
  q: string;
  permanentId: string;
  caseRef: string;
  bureauId: number | null;
  region: Region | null;
  category: string;
  statuses: CaseStatus[];
  from: string;
  to: string;
  beyondSla: boolean | null;
  inOverlap: boolean | null;
  pending: boolean | null;
  page: number;
  limit: number;
}

export const emptyFilters: CaseFilters = {
  q: '', permanentId: '', caseRef: '', bureauId: null, region: null, category: '', statuses: [],
  from: '', to: '', beyondSla: null, inOverlap: null, pending: null, page: 1, limit: PAGE_SIZE,
};

const bool = (v: string | null): boolean | null => (v === 'true' ? true : v === 'false' ? false : null);
const isoDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
const positive = (v: string | null, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
};

/** URL query -> filters. Anything unrecognised or malformed is ignored rather than sent to the API. */
export function parseFilters(search: URLSearchParams): CaseFilters {
  const region = search.get('region');
  const bureau = search.get('bureau_id');
  return {
    q: search.get('q') ?? '',
    permanentId: search.get('permanent_id') ?? '',
    caseRef: search.get('case_ref') ?? '',
    bureauId: bureau !== null && Number.isInteger(Number(bureau)) && bureau !== '' ? Number(bureau) : null,
    region: (REGIONS as readonly string[]).includes(region ?? '') ? (region as Region) : null,
    category: search.get('category') ?? '',
    statuses: (search.get('status') ?? '').split(',').filter((s): s is CaseStatus => (CASE_STATUSES as readonly string[]).includes(s)),
    from: isoDate(search.get('from')),
    to: isoDate(search.get('to')),
    beyondSla: bool(search.get('beyond_sla')),
    inOverlap: bool(search.get('in_overlap')),
    pending: bool(search.get('pending')),
    page: positive(search.get('page'), 1),
    limit: Math.min(100, positive(search.get('limit'), PAGE_SIZE)),
  };
}

/** Filters -> the GET /cases params (only what is set). The same keys are used in the page URL. */
export function toParams(f: CaseFilters): CaseListParams {
  const params: CaseListParams = {};
  if (f.q.trim()) params.q = f.q.trim();
  if (f.permanentId.trim()) params.permanent_id = f.permanentId.trim();
  if (f.caseRef.trim()) params.case_ref = f.caseRef.trim();
  if (f.bureauId !== null) params.bureau_id = f.bureauId;
  if (f.region) params.region = f.region;
  if (f.category) params.category = f.category as CaseListParams['category'];
  if (f.statuses.length) params.status = f.statuses.join(',');
  if (f.from) params.from = f.from;
  if (f.to) params.to = f.to;
  if (f.beyondSla !== null) params.beyond_sla = f.beyondSla;
  if (f.inOverlap !== null) params.in_overlap = f.inOverlap;
  if (f.pending !== null) params.pending = f.pending;
  if (f.page > 1) params.page = f.page;
  if (f.limit !== PAGE_SIZE) params.limit = f.limit;
  return params;
}

export function toSearch(f: CaseFilters): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(toParams(f))) search.set(key, String(value));
  return search;
}

/** The request always carries page and limit so the pagination is explicit. */
export const toRequest = (f: CaseFilters) => ({ ...toParams(f), page: f.page, limit: f.limit });

/** Does `f` filter on anything besides paging? */
export const isFiltered = (f: CaseFilters) => Object.keys(toParams(f)).some((k) => k !== 'page' && k !== 'limit');
