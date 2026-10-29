import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { client } from '../../../lib/api/client';
import type { OverlapGroupStatus, OverlapLevel, OverlapTier } from '../../../lib/api/enums';
import type { OverlapGroupListItem, Page } from '../../../lib/api/types';

export type OverlapTab = 'probable' | 'possible' | 'decided';
export const DECIDED_STATUSES: OverlapGroupStatus[] = ['confirmed', 'dismissed', 'resolved'];
export const PAGE_SIZE = 12;

export interface OverlapListFilters {
  tab: OverlapTab;
  decision: OverlapGroupStatus; // only used on the Decided tab
  level: OverlapLevel | null;
  bureauId: number | null;
  page: number;
}

/** Probable and Possible are the groups still waiting for a decision; Decided is one of the three outcomes. */
export function listParams(f: OverlapListFilters) {
  const params: Record<string, string | number> = { page: f.page, limit: PAGE_SIZE };
  if (f.tab === 'decided') params.status = f.decision;
  else {
    params.tier = f.tab satisfies OverlapTier;
    params.status = 'open';
  }
  if (f.level) params.level = f.level;
  if (f.bureauId !== null) params.bureau_id = f.bureauId;
  return params;
}

export function useOverlapList(filters: OverlapListFilters) {
  const params = listParams(filters);
  return useQuery<Page<OverlapGroupListItem>>({
    queryKey: ['overlaps', params],
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => (await client.get<Page<OverlapGroupListItem>>('/overlaps', { params, signal })).data,
  });
}

const COUNT_PARAMS: [OverlapTab | OverlapGroupStatus, Record<string, string | number>][] = [
  ['probable', { tier: 'probable', status: 'open' }],
  ['possible', { tier: 'possible', status: 'open' }],
  ...DECIDED_STATUSES.map((s): [OverlapGroupStatus, Record<string, string | number>] => [s, { status: s }]),
];

/**
 * How many groups each tab holds, from `pagination.total` of a one-row request per tier and outcome.
 * They wait until the list itself has answered, so the list is always the first thing asked for.
 */
export function useOverlapCounts(enabled: boolean): Partial<Record<OverlapTab, number>> {
  const results = useQueries({
    queries: COUNT_PARAMS.map(([, p]) => {
      const params = { ...p, page: 1, limit: 1 };
      return {
        queryKey: ['overlaps', 'count', params],
        enabled,
        retry: false,
        staleTime: 30_000,
        queryFn: async ({ signal }: { signal: AbortSignal }) =>
          (await client.get<Page<OverlapGroupListItem>>('/overlaps', { params, signal })).data.pagination.total,
      };
    }),
  });
  const total = (key: string) => {
    const i = COUNT_PARAMS.findIndex(([k]) => k === key);
    return results[i]?.data;
  };
  const decided = DECIDED_STATUSES.map(total);
  return {
    probable: total('probable'),
    possible: total('possible'),
    decided: decided.every((n) => n !== undefined) ? decided.reduce<number>((a, n) => a + (n as number), 0) : undefined,
  };
}
