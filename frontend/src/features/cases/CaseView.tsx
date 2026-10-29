import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Skeleton, message } from 'antd';
import { useAuth } from '../../auth/AuthProvider';
import { PageHeader, Section } from '../../components/layout/PageHeader';
import { EvidenceGrid, EvidenceSummary, LinkedCaseCard, OverlapBanner, OverlapLanes, type EvidencePair, type LaneCase } from '../../components/signature';
import { BureauChip, SlaBadge, StatusChip } from '../../components/ui';
import { ACTION_TYPE_LABELS, type ActionType } from '../../lib/api/enums';
import type { CaseDetail, CaseRead, Meta, OverlapSummary } from '../../lib/api/types';
import { useOverlapDetail } from '../overlaps/detail/useOverlapDetail';
import { ActionTimeline } from './ActionTimeline';
import { CaseActionDialog } from './CaseActionDialog';
import type { ActionFormValues } from './actionSchema';
import { TrackingFields } from './TrackingFields';
import { allowedActions } from './workflow';
import '../../styles/cases.css';

/**
 * Why this case was flagged, pair by pair, but only the pairs this case is part of: a reason two
 * other cases share says nothing about this one. If the group cannot be read, the group's reasons stand in.
 */
const PairEvidence: React.FC<{ group: OverlapSummary; caseId: number }> = ({ group, caseId }) => {
  const detail = useOverlapDetail(group.group_id);
  if (detail.isLoading) {
    return (
      <div role="status" aria-label="Loading the evidence">
        <h3 className="uc-subhead">Why these were flagged</h3>
        <Skeleton active title={false} paragraph={{ rows: 3 }} />
      </div>
    );
  }
  const d = detail.data;
  const pairs: EvidencePair[] = d
    ? d.pairs
        .filter((p) => p.case_a_id === caseId || p.case_b_id === caseId)
        .map((p) => {
          const other = p.case_a_id === caseId ? p.case_b_id : p.case_a_id;
          const ref = d.cases.find((x) => x.case_id === other)?.case_ref ?? group.cases.find((x) => x.case_id === other)?.case_ref ?? `#${other}`;
          return { id: p.id, label: `with ${ref}`, reasons: p.reasons, score: p.score };
        })
    : [];
  if (pairs.length === 0) return <EvidenceSummary reasons={group.reasons} />;
  return (
    <div className="uc-evidence">
      <h3 className="uc-subhead">Why these were flagged</h3>
      <EvidenceGrid pairs={pairs} scoreLabel="Pair score" />
    </div>
  );
};

const OverlapBlock: React.FC<{ group: OverlapSummary; c: CaseRead; ownCode?: string }> = ({ group, c, ownCode }) => {
  const lanes: LaneCase[] = [
    { case_id: c.id, case_ref: c.case_ref, bureau_code: ownCode ?? String(c.current_bureau_id), received_at: c.received_at, in_scope: true, current: true },
    ...group.cases.map((x) => ({ case_id: x.case_id, case_ref: x.case_ref, bureau_code: x.bureau_code, received_at: x.received_at, in_scope: x.in_scope })),
  ];
  return (
    <Section title="Overlap" className="uc-case-overlap">
      <div className="uc-stack" style={{ gap: 20 }}>
        <OverlapBanner
          tier={group.tier}
          groupId={group.group_id}
          caseCount={group.cases.length + 1}
          bureauCodes={Array.from(new Set([...(ownCode ? [ownCode] : []), ...group.cases.map((x) => x.bureau_code)]))}
        />
        {group.coordinator_name && <p className="uc-settled">Coordinator: {group.coordinator_name}</p>}
        <div className="uc-overlap-cols">
          <div className="uc-stack" style={{ gap: 20 }}>
            <div>
              <h3 className="uc-subhead">On a shared timeline</h3>
              <OverlapLanes cases={lanes} caption={`${c.case_ref} and its linked cases`} />
            </div>
            <PairEvidence group={group} caseId={c.id} />
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
      </div>
    </Section>
  );
};

export interface CaseViewProps {
  detail: CaseDetail;
  meta: Meta;
  /** Where to go if an action takes the case out of the viewer's scope: the list they came from. */
  listHref?: string;
  /** Rendered beside the list rather than as its own page. */
  embedded?: boolean;
}

/** One case: header with actions, the overlap if there is one, then the record beside its history. */
export const CaseView: React.FC<CaseViewProps> = ({ detail, meta, listHref = '/cases', embedded = false }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [action, setAction] = useState<ActionType | null>(null);
  const [lastAction, setLastAction] = useState<ActionType>('remark');
  const [open, setOpen] = useState(false);
  // Drafts live in a ref: typing must not re-render the whole case.
  const drafts = useRef<Partial<Record<ActionType, ActionFormValues>>>({});
  const [said, setSaid] = useState('');
  const c = detail.case;
  const officer = meta.officers.find((o) => o.id === c.assigned_officer_id);
  const actions = user ? allowedActions(user, c) : [];
  const ownBureau = meta.bureaus.find((b) => b.id === c.current_bureau_id);
  const openOverlapRefs = detail.overlaps.filter((g) => g.status === 'open').flatMap((g) => g.cases.map((x) => x.case_ref));
  const current = action ?? lastAction;

  const start = (a: ActionType) => {
    setAction(a);
    setLastAction(a);
    setOpen(true);
  };
  const close = useCallback(() => {
    setOpen(false);
    setAction(null);
  }, []);
  const onDraftChange = useCallback((v: ActionFormValues) => {
    drafts.current[current] = v;
  }, [current]);

  return (
    <div className={['uc-caseview', embedded ? 'is-embedded' : ''].join(' ')}>
      <PageHeader
        title={<span className="uc-ref">{c.case_ref}</span>}
        titleExtra={
          <span className="uc-case-facts">
            <StatusChip status={c.status} />
            <SlaBadge ageDays={c.age_days} beyondSla={c.beyond_sla} receivedAt={c.received_at} slaDueOn={c.sla_due_on} status={c.status} />
            {ownBureau && <BureauChip code={ownBureau.code} name={ownBureau.name} />}
          </span>
        }
        subtitle={
          <>
            <span className="uc-case-subject">{c.subject}</span>
            <br />
            {detail.institution ? detail.institution.name : c.raw_institution_text} · Officer: {officer?.name ?? 'Not assigned'}
          </>
        }
        actions={
          actions.length === 0 ? (
            <span className="uc-meta">You can view this case but not act on it.</span>
          ) : (
            actions.map((a, i) => (
              <Button key={a} type={i === 0 && a !== 'dispose' ? 'primary' : 'default'} danger={a === 'dispose'} onClick={() => start(a)}>
                {ACTION_TYPE_LABELS[a]}
              </Button>
            ))
          )
        }
      />

      <div role="status" className="uc-sr">{said}</div>

      <div className="uc-stack">
        {detail.overlaps.map((group) => (
          <OverlapBlock key={group.group_id} group={group} c={c} ownCode={ownBureau?.code} />
        ))}

        <div className="uc-case-body">
          <Section title="Case details">
            <TrackingFields detail={detail} meta={meta} />
          </Section>
          <Section title="History">
            <ActionTimeline actions={detail.actions} meta={meta} />
          </Section>
        </div>
      </div>

      {actions.length > 0 && (
        <CaseActionDialog
          open={open}
          type={current}
          caseRead={c}
          meta={meta}
          onClose={close}
          draft={drafts.current[current]}
          onDraftChange={onDraftChange}
          openOverlapRefs={openOverlapRefs}
          onDone={(type, sentence) => {
            drafts.current[type] = undefined;
            setSaid(`${sentence} on ${c.case_ref}.`);
            if (!(type === 'transfer' && user?.role !== 'senior_mgmt')) void message.success(`${sentence}.`);
          }}
          leavesScope={current === 'transfer' && user?.role !== 'senior_mgmt'}
          onLeftScope={() => {
            void message.success(`${c.case_ref} was transferred and is no longer in your bureau's queue.`);
            navigate(listHref);
          }}
        />
      )}
    </div>
  );
};

export default CaseView;
