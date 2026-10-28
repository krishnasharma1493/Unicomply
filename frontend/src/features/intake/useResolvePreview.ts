import { useQuery } from '@tanstack/react-query';
import { client } from '../../lib/api/client';
import type { Envelope, ResolvePreviewIn, Resolution } from '../../lib/api/types';
import { useDebouncedValue } from './useDebouncedValue';

export const PREVIEW_DEBOUNCE_MS = 300;
export const PREVIEW_MIN_CHARS = 3;
const TOP_K = 3;

export interface PreviewInput {
  rawText: string;
  state: string;
  district: string;
}

/**
 * Live institution candidates while the operator types (PRD §7). The input is debounced, and the
 * query key carries it, so a response for an older input can never replace a newer one; the
 * superseded request is also aborted.
 */
export function useResolvePreview(input: PreviewInput) {
  const debounced = useDebouncedValue(input, PREVIEW_DEBOUNCE_MS);
  const text = debounced.rawText.trim();
  const query = useQuery<Resolution>({
    queryKey: ['resolve-preview', text, debounced.state.trim(), debounced.district.trim()],
    enabled: text.length >= PREVIEW_MIN_CHARS,
    retry: false,
    queryFn: async ({ signal }) => {
      const body: ResolvePreviewIn = {
        raw_text: text,
        state: debounced.state.trim() || null,
        district: debounced.district.trim() || null,
      };
      const res = await client.post<Envelope<Resolution>>('/institutions/resolve', body, { signal });
      return { ...res.data.data, candidates: res.data.data.candidates.slice(0, TOP_K) };
    },
  });
  return { ...query, tooShort: text.length < PREVIEW_MIN_CHARS };
}
