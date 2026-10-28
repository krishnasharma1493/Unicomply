import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, message } from 'antd';
import { useAuth } from '../auth/AuthProvider';
import { QueryBoundary } from '../components/states';
import { BackLink, PageHeader, Section } from '../components/layout/PageHeader';
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

const CaseView: React.FC<{ detail: CaseDetail; meta: Meta }> = ({ detail, meta }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [action, setAction] = useState<ActionType | null>(null);
  const c = detail.case;
  const officer = meta.officers.find((o) => o.id === c.assigned_officer_id);
  const actions = user ? allowedActions(user, c) : [];
  const ownBureau = meta.bureaus.find((b) => b.id === c.current_bureau_id);

  return (
    <>
      <PageHeader
        title={<span className="uc-num">{c.case_ref}</span>}
        titleExtra={
          <>
            <StatusChip status={c.status} />
            <SlaBadge ageDays={c.age_days} beyondSla={c.beyond_sla} receivedAt={c.received_at} slaDueOn={c.sla_due_on} status={c.status} />
            {ownBureau && <BureauChip code={ownBureau.code} name={ownBureau.name} />}
          </>
        }
        subtitle={
          <>
            <span style={{ color: 'var(--uc-text)' }}>{c.subject}</span>
            <br />
            {detail.institution ? detail.institution.name : c.raw_institution_text} · Officer: {officer?.name ?? 'Not assigned'}
          </>
        }
        actions={
          actions.length === 0 ? (
            <span className="uc-meta">You can view this case but not act on it.</span>
          ) : (
            actions.map((a, i) => (
              <Button key={a} type={i === 0 && a !== 'dispose' ? 'primary' : 'default'} danger={a === 'dispose'} onClick={() => setAction(a)}>
                {ACTION_TYPE_LABELS[a]}
              </Button>
            ))
          )
        }
      />

      <div className="uc-stack">
        {detail.overlaps.map((group) => (
          <Section key={group.group_id} aria-label="Overlap">
            <div className="uc-stack" style={{ gap: 16 }}>
              <OverlapBanner
                tier={group.tier}
                groupId={group.group_id}
                caseCount={group.cases.length + 1}
                bureauCodes={Array.from(new Set([...(ownBureau ? [ownBureau.code] : []), ...group.cases.map((x) => x.bureau_code)]))}
              />
              {group.coordinator_name && <strong>Coordinator: {group.coordinator_name}</strong>}
              <div>
                <h3 className="uc-subhead">Why these were flagged</h3>
                <WhyFlagged reasons={group.reasons} />
              </div>
              <div>
                <h3 className="uc-subhead">Linked cases</h3>
                <ul className="uc-rows">
                  {group.cases.map((x) => (
                    <li key={x.case_id}>
                      <LinkedCaseCard card={x} coordinatorName={group.coordinator_name} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>
        ))}

        <div className="uc-grid-split">
          <Section title="Case details">
            <TrackingFields detail={detail} meta={meta} />
          </Section>
          <Section title="History">
            <ActionTimeline actions={detail.actions} meta={meta} />
          </Section>
        </div>
      </div>

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
    </>
  );
};

export const CaseDetailPage: React.FC = () => {
  const id = Number(useParams().id);
  const detail = useCaseDetail(id);
  const meta = useMeta();
  return (
    <div className="uc-page">
      <BackLink to="/cases" label="All cases" />
      <div>
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
