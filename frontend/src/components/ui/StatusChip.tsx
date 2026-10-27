import React from 'react';
import { Tag } from 'antd';
import { CASE_STATUS_LABELS, type CaseStatus } from '../../lib/api/enums';

export interface StatusChipProps {
  status: CaseStatus;
  className?: string;
  style?: React.CSSProperties;
}

const STATUS_COLORS: Record<CaseStatus, string> = {
  received: 'blue',
  under_process: 'processing',
  interim_reply: 'purple',
  transferred: 'cyan',
  escalated: 'volcano',
  reopened: 'magenta',
  disposed: 'success',
};

export const StatusChip: React.FC<StatusChipProps> = ({ status, className, style }) => {
  const label = CASE_STATUS_LABELS[status] ?? status;
  const color = STATUS_COLORS[status] ?? 'default';

  return (
    <Tag color={color} className={className} style={{ fontWeight: 500, ...style }}>
      {label}
    </Tag>
  );
};

export default StatusChip;
