import React from 'react';
import { Link } from 'react-router-dom';
import { Card, Space, Tag, Typography } from 'antd';
import { ACTION_TYPE_LABELS } from '../../lib/api/enums';
import type { LinkedCaseCard as LinkedCaseCardData } from '../../lib/api/types';
import { formatDate } from '../../lib/format';
import { BureauChip, StatusChip } from '../ui';

const { Text } = Typography;

export interface LinkedCaseCardProps {
  card: LinkedCaseCardData;
  /** Shown when the overlap group is confirmed. */
  coordinatorName?: string | null;
}

const words = (code: string) => code.replace(/_/g, ' ');

/**
 * The coordination summary of a case in an overlap group (PRD §4.2). It never carries the
 * description or complainant name; a case outside the viewer's scope is plain text, not a link.
 */
export const LinkedCaseCard: React.FC<LinkedCaseCardProps> = ({ card, coordinatorName }) => (
  <Card size="small" aria-label={`Linked case ${card.case_ref}`}>
    <Space orientation="vertical" size={4} style={{ width: '100%' }}>
      <Space wrap>
        {card.in_scope ? (
          <Link to={`/cases/${card.case_id}`}>
            <Text strong>{card.case_ref}</Text>
          </Link>
        ) : (
          <>
            <Text strong>{card.case_ref}</Text>
            <Tag>Summary only</Tag>
          </>
        )}
        <BureauChip code={card.bureau_code} />
        <StatusChip status={card.status} />
      </Space>
      <Text>{card.subject}</Text>
      <Text type="secondary">
        {words(card.category_code)} · Officer: {card.assigned_officer_name ?? 'Not assigned'}
      </Text>
      <Text type="secondary">
        {card.last_action_type && card.last_action_at
          ? `Last action: ${ACTION_TYPE_LABELS[card.last_action_type]}, ${formatDate(card.last_action_at)}`
          : `Received ${formatDate(card.received_at)}; no action yet`}
      </Text>
      {coordinatorName && <Text type="secondary">Coordinator: {coordinatorName}</Text>}
    </Space>
  </Card>
);

export default LinkedCaseCard;
