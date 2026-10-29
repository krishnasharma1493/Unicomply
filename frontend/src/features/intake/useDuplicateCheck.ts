import { useQuery, type QueryClient } from '@tanstack/react-query';
import { client } from '../../lib/api/client';
import type { CaseListItem, Page, Resolution } from '../../lib/api/types';
import { PERMANENT_ID_PATTERN } from './schema';

export interface DuplicateProbe {
  /** The institution the new case resolves to: the entered Permanent ID, or the best candidate. */
  permanentId: string | null;
  receivedAt: string;
  categoryId: number | undefined;
  subject: string;
}

/** The institution a new case will resolve to: the Permanent ID the operator entered, else the best candidate. */
export function resolvedPid(entered: string, resolution: Resolution | undefined): string | null {
  if (PERMANENT_ID_PATTERN.test(entered)) return entered;
  if (!resolution || resolution.decision === 'unresolved') return null;
  return resolution.candidates[0]?.permanent_id ?? null;
}

const words = (s: string) => new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 2));

/** Share of distinct words two subjects have in common (Jaccard); 0.6 and above reads as "the same". */
export function subjectSimilarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (x.size === 0 || y.size === 0) return 0;
  let common = 0;
  x.forEach((w) => y.has(w) && common++);
  return common / (x.size + y.size - common);
}

export const SIMILAR_SUBJECT = 0.6;

export interface DuplicateHit {
  case: CaseListItem;
  /** What makes it look like the same complaint. */
  why: 'category' | 'subject';
}

/** The first same-day case for the same institution with the same category or a near-identical subject. */
export function findDuplicate(cases: CaseListItem[], probe: DuplicateProbe): DuplicateHit | null {
  for (const c of cases) {
    if (c.permanent_id !== probe.permanentId || c.received_at !== probe.receivedAt) continue;
    if (probe.categoryId !== undefined && c.category_id === probe.categoryId) return { case: c, why: 'category' };
    if (probe.subject.trim() && subjectSimilarity(c.subject, probe.subject) >= SIMILAR_SUBJECT) return { case: c, why: 'subject' };
  }
  return null;
}

const key = (pid: string, date: string) => ['cases', 'duplicate-check', pid, date] as const;

async function fetchSameDay(pid: string, date: string, signal?: AbortSignal): Promise<CaseListItem[]> {
  const res = await client.get<Page<CaseListItem>>('/cases', { params: { permanent_id: pid, from: date, to: date, limit: 5 }, signal });
  return res.data.data;
}

const ready = (p: DuplicateProbe): p is DuplicateProbe & { permanentId: string } =>
  Boolean(p.permanentId && PERMANENT_ID_PATTERN.test(p.permanentId) && /^\d{4}-\d{2}-\d{2}$/.test(p.receivedAt));

/**
 * Registering the same complaint twice is otherwise accepted silently. Once the operator reaches the
 * complaint text (`armed`), the same-day cases for the resolved institution are looked up (scoped like
 * every case list). It only warns: a failed lookup never stops a registration.
 */
export function useDuplicateHit(probe: DuplicateProbe, armed: boolean): DuplicateHit | null {
  const query = useQuery<CaseListItem[]>({
    queryKey: key(probe.permanentId ?? '', probe.receivedAt),
    enabled: armed && ready(probe),
    retry: false,
    queryFn: ({ signal }) => fetchSameDay(probe.permanentId!, probe.receivedAt, signal),
  });
  return armed && query.data ? findDuplicate(query.data, probe) : null;
}

/** The same check on submit, for when the operator never reached the complaint fields first. */
export async function checkDuplicate(queryClient: QueryClient, probe: DuplicateProbe): Promise<DuplicateHit | null> {
  if (!ready(probe)) return null;
  try {
    const cases = await queryClient.fetchQuery({
      queryKey: key(probe.permanentId, probe.receivedAt),
      queryFn: ({ signal }) => fetchSameDay(probe.permanentId, probe.receivedAt, signal),
      retry: false,
      staleTime: 30_000,
    });
    return findDuplicate(cases, probe);
  } catch {
    return null;
  }
}
