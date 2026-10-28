import React from 'react';
import { Progress, Typography } from 'antd';

const { Text } = Typography;

export interface WhyFlaggedProps {
  reasons: string[];
  /** 0..1. Shown as a labelled bar next to the reasons, never as a bare percentage. */
  score?: number;
  scoreLabel?: string;
}

/** "Why was this flagged?" (PRD §7): the plain-language reasons first, the score as supporting evidence. */
export const WhyFlagged: React.FC<WhyFlaggedProps> = ({ reasons, score, scoreLabel = 'Match score' }) => (
  <div>
    {score !== undefined && (
      <div style={{ marginBottom: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {scoreLabel}
        </Text>
        <Progress
          percent={Math.round(score * 100)}
          size="small"
          aria-label={`${scoreLabel} ${Math.round(score * 100)} out of 100`}
          strokeColor={score >= 0.8 ? '#16a34a' : score >= 0.6 ? '#d97706' : '#dc2626'}
        />
      </div>
    )}
    {reasons.length === 0 ? (
      <Text type="secondary">No reasons recorded.</Text>
    ) : (
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    )}
  </div>
);

export default WhyFlagged;
