import { CASE_STATUS_LABELS, CASE_STATUSES, REGION_LABELS, REGIONS, type CaseStatus, type Region } from '../../lib/api/enums';
import type { CaseListParams, Meta } from '../../lib/api/types';
import { formatDate } from '../../lib/format';

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
  /** List order: newest received first (the API default) or soonest SLA due first. */
  sort: CaseSort;
  page: number;
  limit: number;
}

export type CaseSort = NonNullable<CaseListParams['sort']>;
export const DEFAULT_SORT: CaseSort = 'received_desc';
export const SORT_LABELS: Record<CaseSort, string> = { received_desc: 'Newest received', sla_due_asc: 'Due soonest' };

export const emptyFilters: CaseFilters = {
  q: '', permanentId: '', caseRef: '', bureauId: null, region: null, category: '', statuses: [],
  from: '', to: '', beyondSla: null, inOverlap: null, pending: null, sort: DEFAULT_SORT, page: 1, limit: PAGE_SIZE,
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
    sort: search.get('sort') === 'sla_due_asc' ? 'sla_due_asc' : DEFAULT_SORT,
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
  if (f.sort !== DEFAULT_SORT) params.sort = f.sort;
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
export const isFiltered = (f: CaseFilters) => Object.keys(toParams(f)).some((k) => k !== 'page' && k !== 'limit' && k !== 'sort');

/** One active filter, in words, with the filters that remain once it is removed. */
export interface FilterToken {
  key: string;
  label: string;
  without: CaseFilters;
}

const yesNo = (v: boolean, yes: string, no: string) => (v ? yes : no);

/** The active filters as removable tokens, in the order an officer would say them. Paging and order are not filters. */
export function filterTokens(f: CaseFilters, meta?: Pick<Meta, 'bureaus' | 'categories'>): FilterToken[] {
  const out: FilterToken[] = [];
  const add = (key: string, label: string, patch: Partial<CaseFilters>) => out.push({ key, label, without: { ...f, ...patch, page: 1 } });
  if (f.beyondSla !== null) add('beyond_sla', yesNo(f.beyondSla, 'Past SLA', 'Within SLA'), { beyondSla: null });
  if (f.pending !== null) add('pending', yesNo(f.pending, 'Open', 'Disposed'), { pending: null });
  if (f.inOverlap !== null) add('in_overlap', yesNo(f.inOverlap, 'In an overlap', 'Not in an overlap'), { inOverlap: null });
  if (f.bureauId !== null) add('bureau_id', meta?.bureaus.find((b) => b.id === f.bureauId)?.code ?? `Bureau ${f.bureauId}`, { bureauId: null });
  if (f.region) add('region', REGION_LABELS[f.region], { region: null });
  if (f.category) add('category', meta?.categories.find((c) => c.code === f.category)?.name ?? f.category.replace(/_/g, ' '), { category: '' });
  if (f.statuses.length) add('status', f.statuses.map((s) => CASE_STATUS_LABELS[s]).join(' or '), { statuses: [] });
  if (f.from || f.to) {
    const label = f.from && f.to ? `Received ${formatDate(f.from)} to ${formatDate(f.to)}` : f.from ? `Received from ${formatDate(f.from)}` : `Received until ${formatDate(f.to)}`;
    add('received', label, { from: '', to: '' });
  }
  if (f.q.trim()) add('q', `Institution “${f.q.trim()}”`, { q: '' });
  if (f.permanentId.trim()) add('permanent_id', `ID ${f.permanentId.trim()}`, { permanentId: '' });
  if (f.caseRef.trim()) add('case_ref', `Ref ${f.caseRef.trim()}`, { caseRef: '' });
  return out;
}

/** The list in one line: "Past SLA · PGRC · 52 cases". Without filters it says whose cases they are. */
export function describeFilters(f: CaseFilters, total?: number, meta?: Pick<Meta, 'bureaus' | 'categories'>): string {
  const parts = filterTokens(f, meta).map((t) => t.label);
  if (parts.length === 0) parts.push('All cases in your scope');
  if (total !== undefined) parts.push(`${total} ${total === 1 ? 'case' : 'cases'}`);
  return parts.join(' · ');
}
