import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { client } from '../../lib/api/client';
import type { Envelope, Institution360, InstitutionListItem, InstitutionListParams, Page } from '../../lib/api/types';
import { useDebouncedValue } from '../intake/useDebouncedValue';

export const SEARCH_PAGE_SIZE = 12;

export interface InstitutionFilters {
  q: string;
  state: string;
  region: InstitutionListParams['region'] | null;
  instType: InstitutionListParams['inst_type'] | null;
  page: number;
}

export function searchParams(f: InstitutionFilters): InstitutionListParams {
  const params: InstitutionListParams = { page: f.page, limit: SEARCH_PAGE_SIZE };
  if (f.q.trim()) params.q = f.q.trim();
  if (f.state.trim()) params.state = f.state.trim();
  if (f.region) params.region = f.region;
  if (f.instType) params.inst_type = f.instType;
  return params;
}

/** Registry search: the text boxes are debounced, the dropdowns apply at once. */
export function useInstitutionSearch(filters: InstitutionFilters) {
  const text = useDebouncedValue({ q: filters.q, state: filters.state }, 300);
  const params = searchParams({ ...filters, ...text });
  return useQuery<Page<InstitutionListItem>>({
    queryKey: ['institutions', params],
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => (await client.get<Page<InstitutionListItem>>('/institutions', { params, signal })).data,
  });
}

export function useInstitution(permanentId: string) {
  return useQuery<Institution360>({
    queryKey: ['institution', permanentId],
    enabled: permanentId.length > 0,
    retry: false,
    queryFn: async ({ signal }) =>
      (await client.get<Envelope<Institution360>>(`/institutions/${encodeURIComponent(permanentId)}`, { signal })).data.data,
  });
}
