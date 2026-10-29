/**
 * Reads the engine's plain-language reasons (backend/app/matching/overlap.py `_reasons`) into a few fixed
 * kinds, so evidence is shown in the same order everywhere. The strings stay the source of truth: an
 * unrecognised reason is kept, verbatim, as `other`.
 */
export type EvidenceKind = 'institution' | 'bureaus' | 'issue' | 'text' | 'timing' | 'other';

export interface Evidence {
  kind: EvidenceKind;
  /** The reason exactly as the engine wrote it. */
  text: string;
  /** Days apart, or the description similarity (0..1), when the reason carries one. */
  value?: number;
}

export const EVIDENCE_LABELS: Record<EvidenceKind, string> = {
  institution: 'Institution',
  bureaus: 'Bureaus',
  issue: 'Issue',
  text: 'Complaint text',
  timing: 'Received',
  other: 'Also',
};

export const EVIDENCE_ORDER: EvidenceKind[] = ['institution', 'issue', 'bureaus', 'timing', 'text', 'other'];

export function readReason(text: string): Evidence {
  const t = text.trim();
  if (/^(Same institution|Institutions belong to the same parent|Both run by|Institutions share a trust|Permanent ID)/i.test(t)) {
    return { kind: 'institution', text: t };
  }
  if (/^(Handled by|Both handled by|Both with)/i.test(t)) return { kind: 'bureaus', text: t };
  if (/^(Both about|Related issues)/i.test(t) || /\bare both about\b/i.test(t)) return { kind: 'issue', text: t };
  const sim = /^Description similarity (\d+(?:\.\d+)?)/i.exec(t);
  if (sim) return { kind: 'text', text: t, value: Number(sim[1]) };
  const days = /^Received (\d+) days? apart/i.exec(t);
  if (days) return { kind: 'timing', text: t, value: Number(days[1]) };
  return { kind: 'other', text: t };
}

/** Plain words for a similarity score, so the number is never shown alone. */
export function similarityWords(value: number): string {
  if (value >= 0.6) return 'closely similar wording';
  if (value >= 0.3) return 'some shared wording';
  return 'little shared wording';
}

/** De-duplicated reasons grouped by kind, in display order. */
export function groupEvidence(reasons: string[]): { kind: EvidenceKind; items: Evidence[] }[] {
  const seen = new Set<string>();
  const byKind = new Map<EvidenceKind, Evidence[]>();
  for (const r of reasons) {
    if (seen.has(r)) continue;
    seen.add(r);
    const e = readReason(r);
    byKind.set(e.kind, [...(byKind.get(e.kind) ?? []), e]);
  }
  return EVIDENCE_ORDER.filter((k) => byKind.has(k)).map((kind) => ({ kind, items: byKind.get(kind)! }));
}
