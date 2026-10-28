import { useQuery } from '@tanstack/react-query';
import { client } from '../../lib/api/client';
import type { InstitutionListItem, Page, ReviewItem } from '../../lib/api/types';
import { useDebouncedValue } from '../intake/useDebouncedValue';

export const reviewsKey = ['reviews', 'pending'] as const;

/** The pending queue, oldest first. It is a work list, so it is fetched whole rather than paged. */
export function usePendingReviews() {
  return useQuery<Page<ReviewItem>>({
    queryKey: reviewsKey,
    retry: false,
    queryFn: async ({ signal }) =>
      (await client.get<Page<ReviewItem>>('/reviews', { params: { status: 'pending', limit: 100 }, signal })).data,
  });
}

export const SEARCH_MIN_CHARS = 2;

/** Registry search by name or Permanent ID for when none of the suggested candidates is right. */
export function useRegistrySearch(term: string) {
  const debounced = useDebouncedValue(term.trim(), 300);
  return useQuery<Page<InstitutionListItem>>({
    queryKey: ['institution-search', debounced],
    enabled: debounced.length >= SEARCH_MIN_CHARS,
    retry: false,
    queryFn: async ({ signal }) =>
      (await client.get<Page<InstitutionListItem>>('/institutions', { params: { q: debounced, limit: 8 }, signal })).data,
  });
}
