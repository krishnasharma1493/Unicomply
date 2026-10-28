import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Space, Typography, message } from 'antd';
import { useAuth } from '../auth/AuthProvider';
import { QueryBoundary } from '../components/states';
import { LinkedCaseCard, OverlapBanner, WhyFlagged } from '../components/signature';
import { BureauChip, SlaBadge, StatusChip } from '../components/ui';
import { ActionTimeline } from '../features/cases/ActionTimeline';
import { CaseActionDialog } from '../features/cases/CaseActionDialog';
import { TrackingFields } from '../features/cases/TrackingFields';
import { useCaseDetail } from '../features/cases/useCaseDetail';
import { allowedActions } from '../features/cases/workflow';
import { useMeta } from '../features/meta/useMeta';
import { ACTION_TYPE_LABELS, type ActionType } from '../lib/api/enums';
import type { CaseDetail, Meta } from '../lib/api/types';

const { Title, Text } = Typography;

const CaseView: React.FC<{ detail: CaseDetail; meta: Meta }> = ({ detail, meta }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [action, setAction] = useState<ActionType | null>(null);
  const c = detail.case;
  const officer = meta.officers.find((o) => o.id === c.assigned_officer_id);
  const actions = user ? allowedActions(user, c) : [];
  const ownBureau = meta.bureaus.find((b) => b.id === c.current_bureau_id);

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space orientation="vertical" size="small" style={{ width: '100%' }}>
          <Space wrap align="center">
            <Title level={2} style={{ margin: 0 }}>{c.case_ref}</Title>
            <StatusChip status={c.status} />
            <SlaBadge ageDays={c.age_days} beyondSla={c.beyond_sla} receivedAt={c.received_at} slaDueOn={c.sla_due_on} status={c.status} />
            {ownBureau && <BureauChip code={ownBureau.code} name={ownBureau.name} />}
          </Space>
          <Text>{c.subject}</Text>
          <Text type="secondary">
            {detail.institution ? detail.institution.name : c.raw_institution_text} · Officer: {officer?.name ?? 'Not assigned'}
          </Text>
          <Space wrap>
            {actions.length === 0 ? (
              <Text type="secondary">You can view this case but not act on it.</Text>
            ) : (
              actions.map((a) => (
                <Button key={a} type={a === 'dispose' ? 'default' : 'primary'} danger={a === 'dispose' || a === 'escalate'} onClick={() => setAction(a)}>
                  {ACTION_TYPE_LABELS[a]}
                </Button>
              ))
            )}
          </Space>
        </Space>
      </Card>

      {detail.overlaps.map((group) => (
        <Card key={group.group_id} size="small">
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <OverlapBanner
              tier={group.tier}
              groupId={group.group_id}
              caseCount={group.cases.length + 1}
              bureauCodes={Array.from(new Set([...(ownBureau ? [ownBureau.code] : []), ...group.cases.map((x) => x.bureau_code)]))}
            />
            {group.coordinator_name && <Text strong>Coordinator: {group.coordinator_name}</Text>}
            <WhyFlagged reasons={group.reasons} />
            <div style={{ display: 'grid', gap: 8 }}>
              {group.cases.map((x) => (
                <LinkedCaseCard key={x.case_id} card={x} coordinatorName={group.coordinator_name} />
              ))}
            </div>
          </Space>
        </Card>
      ))}

      <Card title="Case details">
        <TrackingFields detail={detail} meta={meta} />
      </Card>
      <Card title="History">
        <ActionTimeline actions={detail.actions} meta={meta} />
      </Card>

      {action && (
        <CaseActionDialog
          type={action}
          caseRead={c}
          meta={meta}
          onClose={() => setAction(null)}
          leavesScope={action === 'transfer' && user?.role !== 'senior_mgmt'}
          onLeftScope={() => {
            void message.success(`${c.case_ref} was transferred and is no longer in your bureau's queue.`);
            navigate('/cases');
          }}
        />
      )}
    </Space>
  );
};

export const CaseDetailPage: React.FC = () => {
  const id = Number(useParams().id);
  const detail = useCaseDetail(id);
  const meta = useMeta();
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <Link to="/cases">← All cases</Link>
      <div style={{ marginTop: 12 }}>
        <QueryBoundary query={meta} loadingTip="Loading">
          {(m) => (
            <QueryBoundary query={detail} loadingTip="Loading case">
              {(d) => <CaseView detail={d} meta={m} />}
            </QueryBoundary>
          )}
        </QueryBoundary>
      </div>
    </div>
  );
};

export default CaseDetailPage;
