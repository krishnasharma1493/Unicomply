import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { client } from '../../lib/api/client';
import type { CaseRead, Page } from '../../lib/api/types';
import { toRequest, type CaseFilters } from './listFilters';

export function useCaseList(filters: CaseFilters) {
  const params = toRequest(filters);
  return useQuery<Page<CaseRead>>({
    queryKey: ['cases', params],
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => (await client.get<Page<CaseRead>>('/cases', { params, signal })).data,
  });
}
