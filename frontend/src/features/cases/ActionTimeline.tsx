import React from 'react';
import { Tag, Timeline, Typography } from 'antd';
import { ACTION_TYPE_LABELS, DISPOSE_OUTCOME_LABELS } from '../../lib/api/enums';
import type { CaseAction, Meta } from '../../lib/api/types';
import { EmptyState } from '../../components/states';
import { formatDateTime } from '../../lib/format';

const { Text } = Typography;

const COLOURS: Record<string, string> = {
  transfer: 'blue', escalate: 'red', dispose: 'green', reopen: 'magenta', interim_reply: 'purple',
};

/** The full history, oldest first (PS feature 5). Transfers and escalations are marked in words as well as colour. */
export const ActionTimeline: React.FC<{ actions: CaseAction[]; meta: Meta }> = ({ actions, meta }) => {
  if (actions.length === 0) return <EmptyState description="No action has been recorded on this case yet." minHeight={80} />;
  const code = (id: number | null) => meta.bureaus.find((b) => b.id === id)?.code ?? (id === null ? '' : `#${id}`);
  const officer = (id: number | null) => meta.officers.find((o) => o.id === id)?.name ?? (id === null ? '' : `#${id}`);
  return (
    <Timeline
      items={actions.map((a) => ({
        key: a.id,
        color: COLOURS[a.action_type] ?? 'gray',
        content: (
          <div>
            <Text strong>{ACTION_TYPE_LABELS[a.action_type]}</Text>
            {a.action_type === 'transfer' && <Tag color="blue" style={{ marginLeft: 8 }}>{code(a.from_bureau_id)} → {code(a.to_bureau_id)}</Tag>}
            {a.action_type === 'escalate' && <Tag color="red" style={{ marginLeft: 8 }}>Escalated</Tag>}
            {a.action_type === 'assign' && a.to_officer_id !== null && <Tag style={{ marginLeft: 8 }}>to {officer(a.to_officer_id)}</Tag>}
            {a.outcome && <Tag color="green" style={{ marginLeft: 8 }}>{DISPOSE_OUTCOME_LABELS[a.outcome]}</Tag>}
            <div>
              <Text type="secondary">
                {a.actor_name} · {code(a.bureau_id)} · {formatDateTime(a.created_at)}
              </Text>
            </div>
            {a.remarks && <div style={{ marginTop: 4 }}>{a.remarks}</div>}
          </div>
        ),
      }))}
    />
  );
};
