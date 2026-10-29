import React from 'react';
import { Button } from 'antd';
import { CheckCircleFilled, ExclamationCircleFilled } from '@ant-design/icons';
import { motion } from 'motion/react';
import type { Candidate, Resolution } from '../../lib/api/types';
import { ResolutionLine } from '../../components/signature';
import { ErrorState } from '../../components/states';
import { apiErrorMessage } from '../../lib/format';
import { useMotionPrefs } from '../../lib/motion';
import { RerankingCandidates } from './RerankingCandidates';

export const DECISION_LABELS: Record<Resolution['decision'], string> = {
  auto: 'Matched automatically',
  pending_review: 'Likely match, but it will be queued for review',
  unresolved: 'No confident match: it will be queued for review',
  provided: 'Permanent ID entered by the operator',
};

export interface ResolutionPanelProps {
  tooShort: boolean;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  resolution?: Resolution;
  /** The institution text the shown resolution was computed for (the debounced input). */
  rawText?: string;
  selectedId: string | null;
  onSelect: (candidate: Candidate) => void;
  onClear: () => void;
}

/** One short sentence for screen readers, instead of re-reading the whole panel on every keystroke. */
export function summarize(resolution: Resolution): string {
  const n = resolution.candidates.length;
  if (n === 0) return 'No matching institution in the registry.';
  const [best] = resolution.candidates;
  return `${n} ${n === 1 ? 'candidate' : 'candidates'}; best match ${best.name}, ${Math.round(best.score * 100)} of 100.`;
}

/** A quiet placeholder shaped like the coming rows: a decision line, the resolution line, three candidates. */
const Skeleton: React.FC = () => (
  <div className="uc-intake-skel" aria-hidden="true">
    <span style={{ width: '38%' }} />
    <span style={{ width: '86%' }} />
    {[0, 1, 2].map((i) => (
      <div key={i} className="uc-intake-skel-row">
        <span style={{ width: `${72 - i * 12}%` }} />
        <span style={{ width: '44%' }} />
      </div>
    ))}
  </div>
);

/**
 * The live candidate panel beside the form (demo step 3). It answers in the order an operator reads:
 * what the system decided, how the written name resolves to the registry, then the ranked candidates
 * with their reasons. Rows re-rank in place as the text changes. Screen readers hear one short status
 * line per lookup, not the whole panel.
 */
export const ResolutionPanel = React.memo(function ResolutionPanel({
  tooShort, loading, error, onRetry, resolution, rawText, selectedId, onSelect, onClear,
}: ResolutionPanelProps) {
  const motionPrefs = useMotionPrefs();
  const best = resolution?.candidates[0];
  const confident = resolution?.decision === 'auto' || resolution?.decision === 'provided';
  const status = tooShort || error ? '' : resolution ? summarize(resolution) : loading ? 'Looking up institutions' : '';
  return (
    <section className="uc-section uc-intake-panel" aria-labelledby="intake-match-title">
      <div className="uc-section-head">
        <h2 className="uc-section-title" id="intake-match-title">Institution match</h2>
      </div>
      <div className="uc-section-body">
        <div role="status" className="uc-sr">{status}</div>
        {selectedId && (
          <div className="uc-intake-chosen">
            <CheckCircleFilled aria-hidden="true" />
            <span>{`Permanent ID ${selectedId} will be used`}</span>
            <Button size="small" onClick={onClear}>Clear</Button>
          </div>
        )}
        {tooShort ? (
          <p className="uc-muted uc-intake-prompt">Type the institution name as written in the complaint to see matching institutions.</p>
        ) : error ? (
          <ErrorState message={apiErrorMessage(error)} onRetry={onRetry} style={{ padding: 0 }} />
        ) : !resolution ? (
          <Skeleton />
        ) : (
          <motion.div
            className={loading ? 'uc-intake-match is-updating' : 'uc-intake-match'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={motionPrefs.quick}
          >
            <p className={confident ? 'uc-intake-decision' : 'uc-intake-decision is-review'}>
              {confident ? <CheckCircleFilled aria-hidden="true" /> : <ExclamationCircleFilled aria-hidden="true" />}
              <span>{DECISION_LABELS[resolution.decision]}</span>
            </p>
            {best && rawText && (
              <div className="uc-intake-resline">
                <ResolutionLine raw={rawText} name={best.name} permanentId={best.permanent_id} />
              </div>
            )}
            <RerankingCandidates
              reduce={motionPrefs.reduce}
              candidates={resolution.candidates}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          </motion.div>
        )}
      </div>
    </section>
  );
});
