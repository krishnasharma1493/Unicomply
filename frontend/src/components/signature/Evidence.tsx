import React from 'react';
import { Progress } from 'antd';
import { EVIDENCE_LABELS, EVIDENCE_ORDER, groupEvidence, readReason, similarityWords, type Evidence, type EvidenceKind } from '../../lib/evidence';

const describe = (e: Evidence): string => {
  if (e.kind === 'timing' && e.value !== undefined) return `${e.value} ${e.value === 1 ? 'day' : 'days'} apart`;
  if (e.kind === 'text' && e.value !== undefined) return `${similarityWords(e.value)} (${e.value.toFixed(2)})`;
  return e.text;
};

/**
 * Why a group was flagged, as a short ledger: one row per kind of evidence, always in the same order
 * (institution, issue, bureaus, timing, text). Used where only the group's reasons are known.
 */
export const EvidenceSummary: React.FC<{ reasons: string[]; title?: string }> = ({ reasons, title = 'Why these were flagged' }) => {
  const groups = groupEvidence(reasons);
  if (groups.length === 0) return <p className="uc-muted" style={{ margin: 0 }}>No reasons recorded.</p>;
  return (
    <div className="uc-evidence">
      <h3 className="uc-subhead">{title}</h3>
      <dl className="uc-ledger">
        {groups.map(({ kind, items }) => (
          <div key={kind} className="uc-ledger-row">
            <dt>{EVIDENCE_LABELS[kind]}</dt>
            <dd>
              {kind === 'timing' && items.every((i) => i.value !== undefined)
                ? `${items
                    .map((i) => i.value as number)
                    .sort((a, b) => a - b)
                    .join(', ')} days apart`
                : items.map((i) => <span key={i.text} className="uc-ledger-item">{describe(i)}</span>)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

export interface EvidencePair {
  id: number | string;
  /** Short label for the column, e.g. "00412 and 00133". */
  label: string;
  reasons: string[];
  score?: number;
}

/**
 * Pair-by-pair evidence: kinds down the side, pairs across. Each cell says what that pair shares;
 * an empty cell means the engine found nothing of that kind, written out, not left blank.
 */
export const EvidenceGrid: React.FC<{ pairs: EvidencePair[]; scoreLabel?: string }> = ({ pairs, scoreLabel = 'Pair score' }) => {
  const read = pairs.map((p) => ({ ...p, evidence: p.reasons.map(readReason) }));
  const kinds: EvidenceKind[] = EVIDENCE_ORDER.filter((k) => read.some((p) => p.evidence.some((e) => e.kind === k)));
  return (
    <div className="uc-grid-scroll" role="region" aria-label="Evidence for each pair of cases" tabIndex={0}>
      <table className="uc-evidence-grid">
        <caption className="uc-sr">Evidence for each pair of cases</caption>
        <thead>
          <tr>
            <th scope="col"><span className="uc-sr">Evidence</span></th>
            {read.map((p) => (
              <th key={p.id} scope="col" className="uc-ref">{p.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {kinds.map((kind) => (
            <tr key={kind}>
              <th scope="row">{EVIDENCE_LABELS[kind]}</th>
              {read.map((p) => {
                const items = p.evidence.filter((e) => e.kind === kind);
                return (
                  <td key={p.id}>
                    {items.length === 0 ? (
                      <span className="uc-muted">{kind === 'issue' ? 'Different issues' : kind === 'bureaus' ? 'Same bureau' : 'None'}</span>
                    ) : (
                      items.map((e) => <div key={e.text}>{describe(e)}</div>)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {read.some((p) => p.score !== undefined) && (
            <tr>
              <th scope="row">{scoreLabel}</th>
              {read.map((p) => (
                <td key={p.id}>
                  {p.score !== undefined && (
                    <div className="uc-score">
                      <Progress
                        percent={Math.round(p.score * 100)}
                        size="small"
                        showInfo={false}
                        aria-label={`${scoreLabel} ${Math.round(p.score * 100)} out of 100`}
                        strokeColor="var(--uc-accent)"
                      />
                      <span className="uc-meta uc-num">{Math.round(p.score * 100)} / 100</span>
                    </div>
                  )}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
