import { useQuery } from '@tanstack/react-query';
import { client } from '../../lib/api/client';
import type { Envelope, Meta } from '../../lib/api/types';

/** Reference data (bureaus, categories, officers, the server's "today"): fetched once, shared by every form. */
export function useMeta() {
  return useQuery<Meta>({
    queryKey: ['meta'],
    queryFn: async ({ signal }) => (await client.get<Envelope<Meta>>('/meta', { signal })).data.data,
    staleTime: Infinity,
  });
}
