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
  received: '#aeaeb2',
  under_process: '#0071e3',
  interim_reply: '#0071e3',
  transferred: '#aeaeb2',
  escalated: '#c26a00',
  reopened: '#c26a00',
  disposed: '#1d7a34',
};

export const StatusChip: React.FC<StatusChipProps> = ({ status, className, style }) => (
  <span
    className={['uc-status', className].filter(Boolean).join(' ')}
    style={{ '--uc-status-dot': DOT[status] ?? '#aeaeb2', ...style } as React.CSSProperties}
  >
    {CASE_STATUS_LABELS[status] ?? status}
  </span>
);

export default StatusChip;
