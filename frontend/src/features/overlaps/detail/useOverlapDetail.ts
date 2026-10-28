import { useQuery } from '@tanstack/react-query';
import { client } from '../../../lib/api/client';
import type { Envelope, OverlapGroupDetail } from '../../../lib/api/types';

export const overlapKey = (id: number) => ['overlap', id] as const;

export function useOverlapDetail(id: number) {
  return useQuery<OverlapGroupDetail>({
    queryKey: overlapKey(id),
    enabled: Number.isInteger(id) && id > 0,
    retry: false,
    queryFn: async ({ signal }) => (await client.get<Envelope<OverlapGroupDetail>>(`/overlaps/${id}`, { signal })).data.data,
  });
}
