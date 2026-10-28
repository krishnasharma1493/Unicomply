import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Button } from 'antd';
import { BackLink, PageHeader, Section } from '../components/layout/PageHeader';
import { TierChip } from '../components/ui';
import { useAuth } from '../auth/AuthProvider';
import { QueryBoundary } from '../components/states';
import { LinkedCaseCard, OverlapBanner, WhyFlagged } from '../components/signature';
import { DecisionDialog, type Decision } from '../features/overlaps/detail/DecisionDialog';
import { useOverlapDetail } from '../features/overlaps/detail/useOverlapDetail';
import { useMeta } from '../features/meta/useMeta';
import { OVERLAP_GROUP_STATUS_LABELS, OVERLAP_LEVEL_LABELS } from '../lib/api/enums';
import type { LinkedCaseCard as Card_, Meta, OverlapGroupDetail } from '../lib/api/types';
import { formatDateTime } from '../lib/format';

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
    <ul className="uc-rows">
      {items.map((c) => (
        <li key={c.case_id}>
          <LinkedCaseCard card={c} coordinatorName={group.coordinator_name} />
        </li>
      ))}
    </ul>
  );
  const issueCount = detail.clusters.length + (loose.length > 0 ? 1 : 0);

  return (
    <>
      <PageHeader
        title={group.anchor_name}
        titleExtra={<TierChip tier={group.tier} />}
        subtitle={
          <>
            {OVERLAP_LEVEL_LABELS[group.level]} · {OVERLAP_GROUP_STATUS_LABELS[group.status]}
            {group.coordinator_name ? ` · Coordinator: ${group.coordinator_name}` : ''}
          </>
        }
        actions={
          options.length > 0 ? (
            options.map((d) => (
              <Button key={d} type={d === 'confirm' ? 'primary' : 'default'} danger={d === 'dismiss'} onClick={() => setDecision(d)}>
                {d === 'confirm' ? 'Confirm overlap' : d === 'dismiss' ? 'Dismiss' : 'Resolve'}
              </Button>
            ))
          ) : (
            <span className="uc-meta">
              {canDecide ? 'No further decision is needed on this group.' : 'Only bureau heads and senior management decide overlaps.'}
            </span>
          )
        }
      />

      <div className="uc-stack">
        <OverlapBanner tier={group.tier} bureauCodes={group.bureau_codes} caseCount={group.case_count} />
        {group.status !== 'open' && group.decided_at && (
          <Alert
            type="info"
            showIcon
            title={`${OVERLAP_GROUP_STATUS_LABELS[group.status]} on ${formatDateTime(group.decided_at)}`}
            description={group.decision_remark ?? undefined}
          />
        )}

        <div className={issueCount > 1 ? 'uc-grid-2' : undefined}>
          {detail.clusters.map((cluster) => (
            <Section key={cluster.cluster_id} title={`Issue ${cluster.cluster_id}: ${cluster.label}`}>
              {column(cluster.case_ids.map((id) => byId.get(id)).filter((c): c is Card_ => c !== undefined))}
            </Section>
          ))}
          {loose.length > 0 && <Section title="Other cases in this group">{column(loose)}</Section>}
        </div>

        <Section title="Why these were flagged">
          <WhyFlagged reasons={detail.reasons} />
          {detail.pairs.length > 0 && (
            <ul className="uc-rows" style={{ marginTop: 20 }}>
              {detail.pairs.map((p) => (
                <li key={p.id}>
                  <div className="uc-pair-title uc-num">
                    {ref(p.case_a_id)} <span aria-hidden="true">↔</span>
                    <span className="uc-sr"> and </span> {ref(p.case_b_id)}
                  </div>
                  <WhyFlagged reasons={p.reasons} score={p.score} scoreLabel="Pair score" />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {decision && <DecisionDialog groupId={group.id} decision={decision} bureauIds={bureauIds} meta={meta} onClose={() => setDecision(null)} />}
    </>
  );
};

export const OverlapDetailPage: React.FC = () => {
  const id = Number(useParams().id);
  const detail = useOverlapDetail(id);
  const meta = useMeta();
  return (
    <div className="uc-page">
      <BackLink to="/overlaps" label="Overlap Center" />
      <div>
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
