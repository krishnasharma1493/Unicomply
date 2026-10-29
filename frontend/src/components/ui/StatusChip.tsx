import React from 'react';
import { CASE_STATUS_LABELS, type CaseStatus } from '../../lib/api/enums';

export interface StatusChipProps {
  status: CaseStatus;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Case status as a word with a small dot. The word carries the meaning; the dot only separates the
 * states that need a second look (escalated, reopened) and the closed one from the rest.
 */
const DOT: Record<CaseStatus, string> = {
  received: '#9aa19d',
  under_process: '#0b5e6b',
  interim_reply: '#0b5e6b',
  transferred: '#9aa19d',
  escalated: '#c26a00',
  reopened: '#c26a00',
  disposed: '#1d7a34',
};

export const StatusChip: React.FC<StatusChipProps> = ({ status, className, style }) => (
  <span
    className={['uc-status', className].filter(Boolean).join(' ')}
    style={{ '--uc-status-dot': DOT[status] ?? '#9aa19d', ...style } as React.CSSProperties}
  >
    {CASE_STATUS_LABELS[status] ?? status}
  </span>
);

export default StatusChip;
