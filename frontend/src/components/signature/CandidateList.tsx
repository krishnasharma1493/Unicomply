import React from 'react';
import { Button } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import type { Candidate } from '../../lib/api/types';
import { EmptyState } from '../states';
import { WhyFlagged } from './WhyFlagged';

export interface CandidateListProps {
  candidates: Candidate[];
  /** Permanent ID of the chosen candidate. */
  selectedId?: string | null;
  onSelect?: (candidate: Candidate) => void;
  emptyText?: string;
}

/** Ranked institution candidates with their reasons (PRD §4.4, §7). Rank 1 is the best match. */
export const CandidateList: React.FC<CandidateListProps> = ({
  candidates,
  selectedId = null,
  onSelect,
  emptyText = 'No matching institution in the registry.',
}) => {
  if (candidates.length === 0) return <EmptyState description={emptyText} minHeight={80} />;
  return (
    <ol className="uc-candidates" aria-label="Candidate institutions">
      {candidates.map((c, index) => {
        const selected = c.permanent_id === selectedId;
        return (
          <li
            key={c.permanent_id}
            aria-label={`Candidate ${c.name}`}
            className={selected ? 'uc-candidate uc-candidate--selected' : 'uc-candidate'}
          >
            <div className="uc-candidate-head">
              <span className="uc-candidate-rank uc-num">#{index + 1}</span>
              <div className="uc-candidate-name">
                <strong>{c.name}</strong>
                <div className="uc-meta">
                  {c.permanent_id} · {c.district}, {c.state}
                </div>
              </div>
              {selected && !onSelect && (
                <span className="uc-selected-mark">
                  <CheckCircleFilled /> Selected
                </span>
              )}
              {onSelect && (
                <Button
                  size="small"
                  type={selected ? 'primary' : 'default'}
                  icon={selected ? <CheckCircleFilled /> : undefined}
                  aria-pressed={selected}
                  aria-label={`Select ${c.name}`}
                  onClick={() => onSelect(c)}
                >
                  {selected ? 'Selected' : 'Select'}
                </Button>
              )}
            </div>
            <WhyFlagged reasons={c.reasons} score={c.score} />
          </li>
        );
      })}
    </ol>
  );
};

export default CandidateList;
