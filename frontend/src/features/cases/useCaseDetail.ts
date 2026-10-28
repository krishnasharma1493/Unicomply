import { useQuery } from '@tanstack/react-query';
import { client } from '../../lib/api/client';
import type { CaseDetail, Envelope } from '../../lib/api/types';

export const caseKey = (id: number) => ['case', id] as const;

export function useCaseDetail(id: number) {
  return useQuery<CaseDetail>({
    queryKey: caseKey(id),
    enabled: Number.isInteger(id) && id > 0,
    retry: false,
    queryFn: async ({ signal }) => (await client.get<Envelope<CaseDetail>>(`/cases/${id}`, { signal })).data.data,
  });
}
