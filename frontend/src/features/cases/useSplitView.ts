import { useSyncExternalStore } from 'react';

/** Where the Cases list and the open case sit side by side. Below it, a case opens full page. */
export const SPLIT_QUERY = '(min-width: 1280px)';

function subscribe(query: string) {
  return (onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  };
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribe(query),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useSplitView = () => useMediaQuery(SPLIT_QUERY);

/** What the list hands to a case it opens, so the case page can go back to the same list and step through it. */
export interface FromList {
  /** The list URL, with its filters, page and order. */
  from: string;
  /** The case ids on that page of the list, in order. */
  ids: number[];
}

export function readFromList(state: unknown): FromList | null {
  const s = state as Partial<FromList> | null;
  return s && typeof s.from === 'string' && Array.isArray(s.ids) ? { from: s.from, ids: s.ids } : null;
}
