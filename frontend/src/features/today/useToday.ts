import { useQuery } from '@tanstack/react-query';
import { client } from '../../lib/api/client';
import type { Role } from '../../lib/api/enums';
import type { Alert, OverlapGroupListItem, Page } from '../../lib/api/types';
import { POLL_MS } from '../alerts/useAlerts';
import { emptyFilters, toSearch, type CaseFilters } from '../cases/listFilters';
import { useOverlapList } from '../overlaps/list/useOverlapList';

/** What each role's Today is made of. Each part is fetched on its own, so one failing does not blank the page. */
export interface TodayPlan {
  decisions: boolean;
  reviews: boolean;
  sla: boolean;
  unassigned: boolean;
  recent: boolean;
  register: boolean;
}

export function todayPlan(role: Role): TodayPlan {
  switch (role) {
    case 'senior_mgmt':
      return { decisions: true, reviews: true, sla: true, unassigned: false, recent: false, register: false };
    case 'bureau_head':
      return { decisions: true, reviews: false, sla: true, unassigned: false, recent: false, register: false };
    case 'ro_officer':
      return { decisions: false, reviews: false, sla: true, unassigned: true, recent: false, register: false };
    case 'intake_operator':
      return { decisions: false, reviews: true, sla: false, unassigned: false, recent: true, register: true };
  }
}

export const QUEUE_SIZE = 8;

/** The case queues Today shows, as list filters, so "See all" opens exactly the same list (in the same order). */
export const QUEUES = {
  pastSla: { ...emptyFilters, beyondSla: true, sort: 'sla_due_asc', limit: QUEUE_SIZE } satisfies CaseFilters,
  dueSoon: { ...emptyFilters, pending: true, beyondSla: false, sort: 'sla_due_asc', limit: QUEUE_SIZE } satisfies CaseFilters,
  /** Unassigned is not a server filter: it is read from the open cases due soonest. */
  open: { ...emptyFilters, pending: true, sort: 'sla_due_asc', limit: 50 } satisfies CaseFilters,
  recent: { ...emptyFilters, limit: 50 } satisfies CaseFilters,
};

/** The full list behind a queue: same filters and order, the default page size. */
export const seeAll = (f: CaseFilters) => {
  const q = toSearch({ ...f, limit: emptyFilters.limit, page: 1 }).toString();
  return q ? `/cases?${q}` : '/cases';
};

/** Open overlap groups, probable first (each tier is its own request, so counts stay exact). */
export function useOpenOverlaps() {
  const base = { decision: 'confirmed' as const, level: null, bureauId: null, page: 1 };
  const probable = useOverlapList({ ...base, tab: 'probable' });
  const possible = useOverlapList({ ...base, tab: 'possible' });
  const groups: OverlapGroupListItem[] = [...(probable.data?.data ?? []), ...(possible.data?.data ?? [])];
  return {
    groups,
    total: (probable.data?.pagination.total ?? 0) + (possible.data?.pagination.total ?? 0),
    isLoading: probable.isLoading || possible.isLoading,
    isError: probable.isError || possible.isError,
    error: probable.error ?? possible.error,
    refetch: () => {
      void probable.refetch();
      void possible.refetch();
    },
  };
}

/** The newest unread alerts. Marking one read invalidates every ['alerts', …] query, this one included. */
export function useUnreadAlerts(limit = 6) {
  return useQuery<Page<Alert>>({
    queryKey: ['alerts', 'today-unread', limit],
    retry: false,
    refetchInterval: POLL_MS,
    queryFn: async ({ signal }) => (await client.get<Page<Alert>>('/alerts', { params: { unread_only: true, limit }, signal })).data,
  });
}
