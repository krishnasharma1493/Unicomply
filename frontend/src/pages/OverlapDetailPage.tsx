import React, { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, message } from 'antd';
import { AnimatePresence, motion } from 'motion/react';
import { BackLink, PageHeader, Section } from '../components/layout/PageHeader';
import { TierChip } from '../components/ui';
import { useAuth } from '../auth/AuthProvider';
import { QueryBoundary } from '../components/states';
import { EvidenceGrid, EvidenceSummary, LinkedCaseCard, OverlapBanner, OverlapLanes } from '../components/signature';
import { ConfirmPopover, DecisionModal, alertedSentence, settledMessage, type Decision } from '../features/overlaps/detail/DecisionDialog';
import { useOverlapDetail } from '../features/overlaps/detail/useOverlapDetail';
import { useMeta } from '../features/meta/useMeta';
import { OVERLAP_GROUP_STATUS_LABELS, OVERLAP_LEVEL_LABELS } from '../lib/api/enums';
import type { LinkedCaseCard as Card_, Meta, OverlapGroupDetail } from '../lib/api/types';
import { formatDateTime } from '../lib/format';
import { useMotionPrefs } from '../lib/motion';
import '../styles/overlaps.css';

/** Which decisions are still possible: an open group takes any; a confirmed one can only be resolved. */
const available = (status: string): Decision[] => (status === 'open' ? ['confirm', 'dismiss', 'resolve'] : status === 'confirmed' ? ['resolve'] : []);

/** PGRC/2026/00412 → 00412: the pair columns name cases by serial; the lanes and rows carry the bureau. */
const serial = (ref: string) => ref.split('/').pop() ?? ref;

const View: React.FC<{ detail: OverlapGroupDetail; meta: Meta }> = ({ detail, meta }) => {
  const { user } = useAuth();
  const prefs = useMotionPrefs();
  const [modal, setModal] = useState<Decision | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const settled = useRef<HTMLSpanElement>(null);
  const { group } = detail;
  const cards: Card_[] = detail.cases;
  const byId = new Map(cards.map((c) => [c.case_id, c]));
  const clustered = new Set(detail.clusters.flatMap((c) => c.case_ids));
  const loose = cards.filter((c) => !clustered.has(c.case_id));
  const bureauIds = Array.from(new Set(cards.map((c) => c.bureau_id)));
  const canDecide = user?.role === 'senior_mgmt' || user?.role === 'bureau_head';
  const options = canDecide ? available(group.status) : [];
  const ref = (id: number) => serial(byId.get(id)?.case_ref ?? `#${id}`);

  const decided = (d: OverlapGroupDetail) => {
    const text = settledMessage(d);
    setAnnouncement(text);
    void message.success(text);
    setConfirming(false);
    setModal(null);
    setModalKey((k) => k + 1); // a decided modal gives way at once to the settled state; Cancel still animates out
    // The button that opened the decision may be gone now: land on the line that states the outcome.
    requestAnimationFrame(() => settled.current?.focus());
  };
  const shared = { groupId: group.id, bureauIds, meta, cases: cards, onDecided: decided };

  const columns: { key: string; title: string; items: Card_[] }[] = [
    ...detail.clusters.map((cl) => ({
      key: `c${cl.cluster_id}`,
      title: `Issue ${cl.cluster_id}: ${cl.label}`,
      items: cl.case_ids.map((id) => byId.get(id)).filter((c): c is Card_ => c !== undefined),
    })),
    ...(loose.length > 0 ? [{ key: 'loose', title: 'Other cases in this group', items: loose }] : []),
  ];

  // Confirm stays on screen while its popover is open, so an error inside it is never orphaned.
  const showConfirm = options.includes('confirm') || confirming;
  const buttons: Decision[] = [...(showConfirm ? (['confirm'] as Decision[]) : []), ...options.filter((d) => d !== 'confirm')];
  const item = { initial: prefs.enter(4), animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: prefs.quick };

  return (
    <>
      <PageHeader
        title={group.anchor_name}
        titleExtra={<TierChip tier={group.tier} />}
        subtitle={
          <span ref={settled} tabIndex={-1} className="ov-settled">
            {OVERLAP_LEVEL_LABELS[group.level]} · {OVERLAP_GROUP_STATUS_LABELS[group.status]}
            {group.coordinator_name ? ` · Coordinator: ${group.coordinator_name}` : ''}
          </span>
        }
        actions={
          <motion.div layout={!prefs.reduce} transition={prefs.spring} className="ov-decision-bar">
            <AnimatePresence initial={false} mode="popLayout">
              {buttons.length > 0 ? (
                buttons.map((d) => (
                  <motion.div key={d} layout={!prefs.reduce} {...item}>
                    {d === 'confirm' ? (
                      <ConfirmPopover {...shared} open={confirming} onOpenChange={setConfirming} />
                    ) : (
                      <Button danger={d === 'dismiss'} onClick={() => setModal(d)}>
                        {d === 'dismiss' ? 'Dismiss' : 'Resolve'}
                      </Button>
                    )}
                  </motion.div>
                ))
              ) : (
                <motion.span key="none" className="uc-meta" {...item}>
                  {canDecide ? 'No further decision is needed on this group.' : 'Only bureau heads and senior management decide overlaps.'}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        }
      />
      <div role="status" className="uc-sr">{announcement}</div>

      <div className="uc-stack">
        <div className="ov-banner-block">
          <OverlapBanner tier={group.tier} bureauCodes={group.bureau_codes} caseCount={group.case_count} />
          <AnimatePresence initial={false}>
            {group.status !== 'open' && group.decided_at && (
              <motion.div key={group.status} className="ov-decided" initial={prefs.enter(4)} animate={{ opacity: 1, y: 0 }} transition={prefs.spring}>
                <strong>
                  {OVERLAP_GROUP_STATUS_LABELS[group.status]} on {formatDateTime(group.decided_at)}
                </strong>
                {group.status === 'confirmed' && <span className="uc-meta">{alertedSentence(group.bureau_codes)}</span>}
                {group.decision_remark && <p className="ov-remark">{group.decision_remark}</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Section title="Cases on a shared timeline" extra={<span className="uc-meta ov-head-note">One lane per bureau; each case sits where it was received</span>}>
          <OverlapLanes cases={cards} caption={`${group.anchor_name}, cases on a shared timeline`} />
        </Section>

        <Section title="Cases by issue">
          <div className="ov-columns" data-cols={Math.min(columns.length, 3)}>
            {columns.map((col) => (
              <div key={col.key} className="ov-column">
                <h3 className="ov-column-title">{col.title}</h3>
                <ul className="uc-rows">
                  {col.items.map((c) => (
                    <li key={c.case_id}>
                      <LinkedCaseCard card={c} coordinatorName={group.coordinator_name} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Why these were flagged">
          <div className="ov-evidence">
            <EvidenceSummary reasons={detail.reasons} title="For the whole group" />
            {detail.pairs.length > 0 && (
              <div>
                <h3 className="uc-subhead">Pair by pair</h3>
                <EvidenceGrid
                  pairs={detail.pairs.map((p) => ({
                    id: p.id,
                    label: `${ref(p.case_a_id)} and ${ref(p.case_b_id)}`,
                    reasons: p.reasons,
                    score: p.score,
                  }))}
                />
              </div>
            )}
          </div>
        </Section>
      </div>

      <DecisionModal key={modalKey} {...shared} decision={modal} onClose={() => setModal(null)} />
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
