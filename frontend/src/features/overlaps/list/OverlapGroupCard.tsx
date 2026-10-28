import React from 'react';
import { Link } from 'react-router-dom';
import { Card, Space, Typography } from 'antd';
import { OVERLAP_GROUP_STATUS_LABELS, OVERLAP_LEVEL_LABELS } from '../../../lib/api/enums';
import type { OverlapGroupListItem } from '../../../lib/api/types';
import { BureauChip, TierChip } from '../../../components/ui';
import { diffCalendarDays } from '../../../lib/format';

const { Text } = Typography;

const isPermanentId = (anchor: string) => /^1-\d{6,10}$/.test(anchor);

export const OverlapGroupCard: React.FC<{ group: OverlapGroupListItem; today?: string }> = ({ group, today }) => {
  const days = today ? Math.max(0, diffCalendarDays(group.created_at, today)) : null;
  const decided = group.status !== 'open';
  return (
    <Link to={`/overlaps/${group.id}`} aria-label={`Overlap group: ${group.anchor_name}`} style={{ display: 'block' }}>
      <Card hoverable size="small">
        <Space orientation="vertical" size={6} style={{ width: '100%' }}>
          <Space wrap>
            <TierChip tier={group.tier} />
            <Text type="secondary">{OVERLAP_LEVEL_LABELS[group.level]}</Text>
            {decided && <Text strong>{OVERLAP_GROUP_STATUS_LABELS[group.status]}</Text>}
          </Space>
          <Text strong style={{ fontSize: 16 }}>{group.anchor_name}</Text>
          {isPermanentId(group.anchor_key) && <Text type="secondary">{group.anchor_key}</Text>}
          <Space wrap size={[4, 4]}>
            {group.bureau_codes.map((code) => <BureauChip key={code} code={code} />)}
          </Space>
          <Text type="secondary">
            {group.case_count} {group.case_count === 1 ? 'case' : 'cases'}
            {days !== null && ` · ${days === 0 ? 'flagged today' : `flagged ${days} ${days === 1 ? 'day' : 'days'} ago`}`}
            {group.coordinator_name ? ` · Coordinator: ${group.coordinator_name}` : ''}
          </Text>
        </Space>
      </Card>
    </Link>
  );
};
