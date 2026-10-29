import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import { motion } from 'motion/react';
import type { CaseIntakeResult, CaseRead, Meta, OverlapSummary } from '../../lib/api/types';
import { useAuth } from '../../auth/AuthProvider';
import {
  EvidenceGrid, EvidenceSummary, LinkedCaseCard, OverlapBanner, OverlapLanes, type EvidencePair, type LaneCase,
} from '../../components/signature';
import { BureauChip } from '../../components/ui';
import { useOverlapDetail } from '../overlaps/detail/useOverlapDetail';
import { formatDate } from '../../lib/format';
import { useMotionPrefs } from '../../lib/motion';
import { DECISION_LABELS } from './ResolutionPanel';
import '../../styles/intake.css';

export interface IntakeResultProps {
  result: CaseIntakeResult;
  meta: Meta;
  onNewCase: () => void;
}

/** "PGRC, RB and RO-CRO" */
export const listWords = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/**
 * The evidence for this case only: the pairs that involve it, one column per linked case. The group
 * detail is scoped, so when the operator may not open it the group's reasons are shown instead.
 */
const PairEvidence: React.FC<{ group: OverlapSummary; created: CaseRead }> = ({ group, created }) => {
  const detail = useOverlapDetail(group.group_id);
  if (detail.isPending) {
    return (
      <div className="uc-intake-skel" aria-hidden="true">
        <span style={{ width: '30%' }} />
        <span style={{ width: '90%' }} />
        <span style={{ width: '80%' }} />
      </div>
    );
  }
  const refOf = new Map<number, string>([
    ...group.cases.map((c) => [c.case_id, c.case_ref] as [number, string]),
    ...(detail.data?.cases ?? []).map((c) => [c.case_id, c.case_ref] as [number, string]),
  ]);
  const pairs: EvidencePair[] = (detail.data?.pairs ?? [])
    .filter((p) => p.case_a_id === created.id || p.case_b_id === created.id)
    .map((p) => {
      const other = p.case_a_id === created.id ? p.case_b_id : p.case_a_id;
      return { id: p.id, label: refOf.get(other) ?? `Case ${other}`, reasons: p.reasons, score: p.score };
    });
  if (detail.isError || pairs.length === 0) return <EvidenceSummary reasons={group.reasons} title="Why this was flagged" />;
  return (
    <div className="uc-evidence">
      <h3 className="uc-subhead">Why this was flagged</h3>
      <p className="uc-meta uc-intake-note">
        What <span className="uc-ref">{created.case_ref}</span> shares with each linked case.
      </p>
      <EvidenceGrid pairs={pairs} />
    </div>
  );
};

const OverlapOutcome: React.FC<{ group: OverlapSummary; created: CaseRead; ownBureau?: string; index: number }> = ({
  group, created, ownBureau, index,
}) => {
  const motionPrefs = useMotionPrefs();
  const lanes: LaneCase[] = [
    {
      case_id: created.id,
      case_ref: created.case_ref,
      bureau_code: ownBureau ?? `Bureau ${created.current_bureau_id}`,
      received_at: created.received_at,
      in_scope: true,
      current: true,
    },
    ...group.cases.map((c) => ({ case_id: c.case_id, case_ref: c.case_ref, bureau_code: c.bureau_code, received_at: c.received_at, in_scope: c.in_scope })),
  ];
  const titleId = `intake-overlap-${group.group_id}`;
  return (
    <motion.section
      className="uc-section uc-intake-overlap"
      aria-labelledby={titleId}
      initial={motionPrefs.enter(8)}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...motionPrefs.spring, delay: motionPrefs.reduce ? 0 : 0.06 + index * 0.04 }}
    >
      <div className="uc-section-body uc-stack">
        <h2 id={titleId} className="uc-sr">Overlap with other bureaus</h2>
        <OverlapBanner
          tier={group.tier}
          groupId={group.group_id}
          caseCount={group.cases.length + 1}
          bureauCodes={Array.from(new Set([...(ownBureau ? [ownBureau] : []), ...group.cases.map((c) => c.bureau_code)]))}
        />
        <div>
          <h3 className="uc-subhead">On one timeline</h3>
          <p className="uc-meta uc-intake-note uc-intake-cause">
            <span className="uc-intake-cause-dot" aria-hidden="true" />
            <span>
              <span className="uc-ref">{created.case_ref}</span>, registered now, joins {group.cases.length}{' '}
              {group.cases.length === 1 ? 'case' : 'cases'} already open about this institution.
            </span>
          </p>
          <OverlapLanes cases={lanes} caption="This case and the cases it overlaps" />
        </div>
        <PairEvidence group={group} created={created} />
        <div>
          <h3 className="uc-subhead">Linked cases</h3>
          <ul className="uc-rows">
            {group.cases.map((c) => (
              <li key={c.case_id}>
                <LinkedCaseCard card={c} coordinatorName={group.coordinator_name} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.section>
  );
};

/**
 * What the system did with the new case (demo step 4): a one-line summary of the registered case and
 * what happens next, then, when other bureaus already hold the same matter, the overlap drawn on its
 * lanes with the evidence for this case and the linked cases.
 */
export const IntakeResult: React.FC<IntakeResultProps> = ({ result, meta, onNewCase }) => {
  const { user } = useAuth();
  const motionPrefs = useMotionPrefs();
  const heading = useRef<HTMLHeadingElement>(null);
  const { case: created, resolution, overlaps } = result;
  const bureau = meta.bureaus.find((b) => b.id === created.current_bureau_id);
  const ownBureau = bureau?.code;
  // The roles GET /reviews allows (backend: require_roles(intake_operator, senior_mgmt)).
  const canOpenReviews = user?.role === 'intake_operator' || user?.role === 'senior_mgmt';
  const candidateCount = resolution.candidates.length;
  const alerted = Array.from(new Set([...(ownBureau ? [ownBureau] : []), ...overlaps.flatMap((g) => g.cases.map((c) => c.bureau_code))]));
  const probable = overlaps.some((g) => g.tier === 'probable');

  // Move focus to the outcome, so keyboard and screen-reader users land where the form was.
  useEffect(() => heading.current?.focus(), []);

  return (
    <div className="uc-stack uc-intake-outcome">
      <motion.section
        className="uc-section uc-intake-summary"
        aria-labelledby="intake-registered"
        initial={motionPrefs.enter(-6)}
        animate={{ opacity: 1, y: 0 }}
        transition={motionPrefs.spring}
      >
        <div className="uc-intake-summary-grid">
          <CheckCircleFilled className="uc-intake-ok" aria-hidden="true" />
          <div className="uc-intake-summary-main">
            <h2 id="intake-registered" ref={heading} tabIndex={-1}>
              Case registered: <span className="uc-ref">{created.case_ref}</span>
            </h2>
            <p className="uc-intake-summary-facts">
              <span className="uc-intake-summary-inst">
                {created.institution_name ?? <span className="uc-muted">“{created.raw_institution_text}”</span>}
              </span>
              {ownBureau && <BureauChip code={ownBureau} />}
            </p>
            <p className="uc-meta uc-intake-next">
              <span>{DECISION_LABELS[resolution.decision]}.</span>{' '}
              Routed to {ownBureau ? `${ownBureau} (${bureau?.name})` : `bureau ${created.current_bureau_id}`}; due {formatDate(created.sla_due_on)}.
              {overlaps.length > 0 && ` The heads of ${listWords(alerted)}${probable ? ' and senior management' : ''} have been alerted.`}
              {overlaps.length === 0 && created.permanent_id !== null && (
                <>
                  {' '}
                  <span>No overlapping cases found for this institution.</span>
                </>
              )}
            </p>
          </div>
          <span className="uc-intake-summary-actions">
            <Link to={`/cases/${created.id}`} className="uc-intake-linkbtn">
              Open case
            </Link>
            <Button type="primary" onClick={onNewCase}>Register another</Button>
          </span>
        </div>
      </motion.section>

      {created.permanent_id === null && (
        <Alert
          type="warning"
          showIcon
          title="Institution not confirmed: queued for match review"
          description={
            <span>
              {candidateCount === 0
                ? 'No institution in the registry matched; a reviewer searches for it. '
                : candidateCount === 1
                  ? 'One possible institution; a reviewer confirms whether it is the right one. '
                  : `${candidateCount} possible institutions; a reviewer picks the right one. `}
              Overlap checks run once the institution is confirmed.
            </span>
          }
          action={canOpenReviews ? <Link to="/reviews">Open review queue</Link> : undefined}
        />
      )}
      {overlaps.map((group, i) => (
        <OverlapOutcome key={group.group_id} group={group} created={created} ownBureau={ownBureau} index={i} />
      ))}
    </div>
  );
};
