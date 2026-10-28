import React from 'react';
import { Progress } from 'antd';

export interface WhyFlaggedProps {
  reasons: string[];
  /** 0..1. Shown as a labelled bar next to the reasons, never as a bare percentage. */
  score?: number;
  scoreLabel?: string;
}

/**
 * "Why was this flagged?" (PRD §7): the plain-language reasons first, the score as supporting evidence.
 * The bar is neutral on purpose: red is reserved for Probable overlaps and breaches.
 */
export const WhyFlagged: React.FC<WhyFlaggedProps> = ({ reasons, score, scoreLabel = 'Match score' }) => {
  const unique = Array.from(new Set(reasons));
  const pct = score === undefined ? 0 : Math.round(score * 100);
  return (
    <div className="uc-why">
      {unique.length === 0 ? (
        <span className="uc-muted">No reasons recorded.</span>
      ) : (
        <ul className="uc-reasons">
          {unique.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {score !== undefined && (
        <div className="uc-score">
          <span className="uc-meta">{scoreLabel}</span>
          <Progress
            percent={pct}
            size="small"
            showInfo={false}
            aria-label={`${scoreLabel} ${pct} out of 100`}
            strokeColor="var(--uc-accent)"
          />
          <span className="uc-meta uc-num">{pct} / 100</span>
        </div>
      )}
    </div>
  );
};

export default WhyFlagged;
