import React from 'react';

/** Common short forms in complaints, so "engg" is read as a match for "Engineering". */
const SHORT: Record<string, string> = {
  engg: 'engineering', eng: 'engineering', engineering: 'engineering', coll: 'college', clg: 'college',
  inst: 'institute', instt: 'institute', tech: 'technology', univ: 'university', mgmt: 'management',
  poly: 'polytechnic', pharm: 'pharmacy', sci: 'sciences',
};

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** Levenshtein distance, capped: only small spelling slips count as the same word. */
function close(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 2 || Math.min(a.length, b.length) < 4) return false;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length] <= 2;
}

/** Which words of the registry name the complaint's own text accounts for. */
export function matchedWords(raw: string, name: string): boolean[] {
  const said = words(raw).map((w) => SHORT[w] ?? w);
  return name.split(/(\s+)/).filter((p) => p.trim()).map((part) => {
    const w = words(part)[0];
    return Boolean(w) && said.some((s) => close(s, w!));
  });
}

export interface ResolutionLineProps {
  /** The institution as the complainant wrote it. */
  raw: string;
  /** The registry institution it resolved to; omitted while unresolved. */
  name?: string | null;
  permanentId?: string | null;
  /** What the engine decided, in words (e.g. "Matched automatically"). */
  note?: string;
}

/**
 * The resolution, written out: the complainant's words, then the registry name with the words they
 * account for set in ink. It is the one place the accent marks resolution rather than an action.
 */
export const ResolutionLine: React.FC<ResolutionLineProps> = ({ raw, name, permanentId, note }) => {
  const marks = name ? matchedWords(raw, name) : [];
  const parts = name ? name.split(/\s+/).filter(Boolean) : [];
  return (
    <div className="uc-resline">
      <span className="uc-resline-raw">
        <span className="uc-sr">Written as </span>“{raw}”
      </span>
      <svg className="uc-resline-arrow" width="28" height="10" viewBox="0 0 28 10" aria-hidden="true">
        <path d="M1 5h24M21 1.5 25 5l-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {name ? (
        <span className="uc-resline-to">
          <span className="uc-sr">resolved to </span>
          {parts.map((p, i) => (
            <React.Fragment key={i}>
              {i > 0 && ' '}
              {marks[i] ? <span className="uc-resline-hit">{p}</span> : p}
            </React.Fragment>
          ))}
          {permanentId && <span className="uc-label" style={{ marginLeft: 8 }}>{permanentId}</span>}
        </span>
      ) : (
        <span className="uc-resline-to uc-muted">Not resolved yet</span>
      )}
      {note && <span className="uc-meta uc-resline-note">{note}</span>}
    </div>
  );
};

export default ResolutionLine;
