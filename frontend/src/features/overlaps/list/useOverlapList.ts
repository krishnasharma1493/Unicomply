import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
