import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '../../lib/api/client';
import type { Alert, Envelope, Page, ReadAllResult } from '../../lib/api/types';

export const POLL_MS = 30_000;
const alertsKey = ['alerts'] as const;

const fetchAlerts = async (params: Record<string, unknown>, signal?: AbortSignal) =>
  (await client.get<Page<Alert>>('/alerts', { params, signal })).data;

/** The API pages at 100; the page shows the newest few hundred, which is already more than anyone reads. */
export const MAX_PAGES = 5;

/** The viewer's alerts, newest first, up to MAX_PAGES x 100; `pagination.total` is still the real total. */
export const useAlertList = () =>
  useQuery<Page<Alert>>({
    queryKey: [...alertsKey, 'list'],
    retry: false,
    refetchInterval: POLL_MS,
    queryFn: async ({ signal }) => {
      const first = await fetchAlerts({ limit: 100, page: 1 }, signal);
      const data = [...first.data];
      for (let page = 2; page <= Math.min(first.pagination.total_pages, MAX_PAGES); page += 1) {
        data.push(...(await fetchAlerts({ limit: 100, page }, signal)).data);
      }
      return { ...first, data };
    },
  });

/** The bell: the latest five, and the unread count (the total of a one-row unread query). */
export function useBell() {
  const latest = useQuery<Page<Alert>>({
    queryKey: [...alertsKey, 'bell-latest'], retry: false, refetchInterval: POLL_MS, queryFn: ({ signal }) => fetchAlerts({ limit: 5 }, signal),
  });
  const unread = useQuery<Page<Alert>>({
    queryKey: [...alertsKey, 'bell-unread'], retry: false, refetchInterval: POLL_MS, queryFn: ({ signal }) => fetchAlerts({ unread_only: true, limit: 1 }, signal),
  });
  return { latest, unread, unreadCount: unread.data?.pagination.total ?? 0 };
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await client.post<Envelope<Alert>>(`/alerts/${id}/read`)).data.data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alertsKey }),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await client.post<Envelope<ReadAllResult>>('/alerts/read-all')).data.data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alertsKey }),
  });
}
