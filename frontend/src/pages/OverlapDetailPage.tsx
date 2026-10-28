import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Card, Col, Row, Space, Typography } from 'antd';
import { useAuth } from '../auth/AuthProvider';
import { QueryBoundary } from '../components/states';
import { LinkedCaseCard, OverlapBanner, WhyFlagged } from '../components/signature';
import { DecisionDialog, type Decision } from '../features/overlaps/detail/DecisionDialog';
import { useOverlapDetail } from '../features/overlaps/detail/useOverlapDetail';
import { useMeta } from '../features/meta/useMeta';
import { OVERLAP_GROUP_STATUS_LABELS, OVERLAP_LEVEL_LABELS } from '../lib/api/enums';
import type { LinkedCaseCard as Card_, Meta, OverlapGroupDetail } from '../lib/api/types';
import { formatDateTime } from '../lib/format';

const { Title, Text } = Typography;

/** Which decisions are still possible: an open group takes any; a confirmed one can only be resolved. */
const available = (status: string): Decision[] => (status === 'open' ? ['confirm', 'dismiss', 'resolve'] : status === 'confirmed' ? ['resolve'] : []);

const View: React.FC<{ detail: OverlapGroupDetail; meta: Meta }> = ({ detail, meta }) => {
  const { user } = useAuth();
  const [decision, setDecision] = useState<Decision | null>(null);
  const { group } = detail;
  const cards: Card_[] = detail.cases;
  const byId = new Map(cards.map((c) => [c.case_id, c]));
  const clustered = new Set(detail.clusters.flatMap((c) => c.case_ids));
  const loose = cards.filter((c) => !clustered.has(c.case_id));
  const bureauIds = Array.from(new Set(cards.map((c) => c.bureau_id)));
  const canDecide = user?.role === 'senior_mgmt' || user?.role === 'bureau_head';
  const options = canDecide ? available(group.status) : [];
  const ref = (id: number) => byId.get(id)?.case_ref ?? `#${id}`;

  const column = (items: Card_[]) => (
    <Row gutter={[16, 16]}>
      {items.map((c) => (
        <Col key={c.case_id} xs={24} md={12} xl={8}>
          <LinkedCaseCard card={c} coordinatorName={group.coordinator_name} />
        </Col>
      ))}
    </Row>
  );

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <OverlapBanner tier={group.tier} bureauCodes={group.bureau_codes} caseCount={group.case_count} />
          <Title level={2} style={{ margin: 0 }}>{group.anchor_name}</Title>
          <Text type="secondary">
            {OVERLAP_LEVEL_LABELS[group.level]} · {OVERLAP_GROUP_STATUS_LABELS[group.status]}
            {group.coordinator_name ? ` · Coordinator: ${group.coordinator_name}` : ''}
          </Text>
          {group.status !== 'open' && group.decided_at && (
            <Alert
              type="info"
              showIcon
              title={`${OVERLAP_GROUP_STATUS_LABELS[group.status]} on ${formatDateTime(group.decided_at)}`}
              description={group.decision_remark ?? undefined}
            />
          )}
          <Space wrap>
            {options.length > 0 ? (
              options.map((d) => (
                <Button key={d} type={d === 'confirm' ? 'primary' : 'default'} danger={d === 'dismiss'} onClick={() => setDecision(d)}>
                  {d === 'confirm' ? 'Confirm overlap' : d === 'dismiss' ? 'Dismiss' : 'Resolve'}
                </Button>
              ))
            ) : (
              <Text type="secondary">
                {canDecide ? 'No further decision is needed on this group.' : 'Only bureau heads and senior management decide overlaps.'}
              </Text>
            )}
          </Space>
        </Space>
      </Card>

      {detail.clusters.map((cluster) => (
        <Card key={cluster.cluster_id} title={`Issue ${cluster.cluster_id}: ${cluster.label}`} size="small">
          {column(cluster.case_ids.map((id) => byId.get(id)).filter((c): c is Card_ => c !== undefined))}
        </Card>
      ))}
      {loose.length > 0 && <Card title="Other cases in this group" size="small">{column(loose)}</Card>}

      <Card title="Why these were flagged" size="small">
        <WhyFlagged reasons={detail.reasons} />
        {detail.pairs.map((p) => (
          <div key={p.id} style={{ marginTop: 16 }}>
            <Text strong>{ref(p.case_a_id)} ↔ {ref(p.case_b_id)}</Text>
            <WhyFlagged reasons={p.reasons} score={p.score} scoreLabel="Pair score" />
          </div>
        ))}
      </Card>

      {decision && <DecisionDialog groupId={group.id} decision={decision} bureauIds={bureauIds} meta={meta} onClose={() => setDecision(null)} />}
    </Space>
  );
};

export const OverlapDetailPage: React.FC = () => {
  const id = Number(useParams().id);
  const detail = useOverlapDetail(id);
  const meta = useMeta();
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Link to="/overlaps">← Overlap Center</Link>
      <div style={{ marginTop: 12 }}>
        <QueryBoundary query={meta} loadingTip="Loading">
          {(m) => (
            <QueryBoundary query={detail} loadingTip="Loading overlap group">
              {(d) => <View detail={d} meta={m} />}
            </QueryBoundary>
          )}
        </QueryBoundary>
      </div>
    </div>
  );
};

export default OverlapDetailPage;
