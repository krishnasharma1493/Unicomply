import React from 'react';
import { Tag } from 'antd';
import { ExclamationCircleFilled, InfoCircleOutlined, WarningFilled } from '@ant-design/icons';
import type { Alert } from '../../lib/api/types';
import type { AlertSeverity } from '../../lib/api/enums';

export const SEVERITY_COLOUR: Record<AlertSeverity, string> = { critical: 'red', warning: 'gold', info: 'default' };

const SEVERITY_ICON: Record<AlertSeverity, React.ReactNode> = {
  critical: <ExclamationCircleFilled />,
  warning: <WarningFilled />,
  info: <InfoCircleOutlined />,
};

/** Severity as icon + word on its semantic tint; never colour alone. */
export const SeverityLabel: React.FC<{ severity: AlertSeverity; label: string }> = ({ severity, label }) => (
  <Tag color={SEVERITY_COLOUR[severity]} icon={SEVERITY_ICON[severity]} style={{ margin: 0 }}>
    {label}
  </Tag>
);

/** Where an alert points: the overlap group for an overlap, else the case. */
export function alertTarget(a: Pick<Alert, 'group_id' | 'case_id' | 'case_ref' | 'type'>): { to: string; label: string } | null {
  if (a.type === 'overlap' && a.group_id !== null) return { to: `/overlaps/${a.group_id}`, label: 'Open overlap' };
  if (a.case_id !== null) return { to: `/cases/${a.case_id}`, label: a.case_ref ? `Open ${a.case_ref}` : 'Open case' };
  if (a.group_id !== null) return { to: `/overlaps/${a.group_id}`, label: 'Open overlap' };
  return null;
}
