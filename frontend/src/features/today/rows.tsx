import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'antd';
import { AnimatePresence, motion } from 'motion/react';
import { BureauChip, SlaBadge, StatusChip, TierChip } from '../../components/ui';
import { ALERT_SEVERITY_LABELS } from '../../lib/api/enums';
import type { Alert, CaseRead, OverlapGroupListItem, ReviewItem } from '../../lib/api/types';
import { apiErrorMessage, diffCalendarDays, formatDate, formatDateTime } from '../../lib/format';
import { useMotionPrefs } from '../../lib/motion';
import { alertTarget, SeverityLabel } from '../alerts/AlertItem';
import { useMarkRead } from '../alerts/useAlerts';
import type { FromList } from '../cases/useSplitView';

const ago = (iso: string, today?: string) => {
  if (!today) return null;
  const d = Math.max(0, diffCalendarDays(iso, today));
  return d === 0 ? 'today' : `${d} ${d === 1 ? 'day' : 'days'} ago`;
};

/** Cases in a queue. Opening one carries the queue along, so the case page can step to the next. */
export const CaseRows: React.FC<{ cases: CaseRead[]; from: string }> = ({ cases, from }) => {
  const state: FromList = { from, ids: cases.map((c) => c.id) };
  return (
    <ul className="uc-today-rows">
      {cases.map((c) => (
        <li key={c.id}>
          <Link to={`/cases/${c.id}`} state={state} className="uc-today-row uc-today-case uc-pressable">
            <span className="uc-today-case-main">
              <span className="uc-ref">{c.case_ref}</span>
              <span className="uc-today-inst">{c.institution_name ?? c.raw_institution_text}</span>
            </span>
            <span className="uc-today-case-facts">
              <StatusChip status={c.status} />
              <SlaBadge ageDays={c.age_days} beyondSla={c.beyond_sla} receivedAt={c.received_at} slaDueOn={c.sla_due_on} status={c.status} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
};

/** Open overlap groups: the tier in words, the institution, who is involved, how many cases, how long it has waited. */
export const OverlapRows: React.FC<{ groups: OverlapGroupListItem[]; today?: string }> = ({ groups, today }) => (
  <ul className="uc-today-rows">
    {groups.map((g) => {
      const waited = ago(g.created_at, today);
      return (
        <li key={g.id}>
          <Link to={`/overlaps/${g.id}`} className="uc-today-row uc-today-group uc-pressable" aria-label={`${g.tier === 'probable' ? 'Probable' : 'Possible'} overlap: ${g.anchor_name}, ${g.case_count} cases`}>
            <TierChip tier={g.tier} />
            <span className="uc-today-group-main">
              <span className="uc-today-group-name">{g.anchor_name}</span>
              <span className="uc-today-group-codes">
                {g.bureau_codes.map((code) => <BureauChip key={code} code={code} />)}
              </span>
            </span>
            <span className="uc-today-group-when uc-meta">
              <span className="uc-num uc-today-strong">{g.case_count} {g.case_count === 1 ? 'case' : 'cases'}</span>
              {waited && <span>flagged {waited}</span>}
            </span>
          </Link>
        </li>
      );
    })}
  </ul>
);

/** Pending match reviews, oldest first: the case and what was written, to be matched to the registry. */
export const ReviewRows: React.FC<{ reviews: ReviewItem[] }> = ({ reviews }) => (
  <ul className="uc-today-rows">
    {reviews.map((r) => (
      <li key={r.id} className="uc-today-row uc-today-review">
        <span className="uc-today-review-main">
          <span className="uc-ref">{r.case_ref}</span>
          <span className="uc-asw">{r.raw_institution_text}</span>
          <span className="uc-meta">
            Received {formatDate(r.received_at)} · {r.candidates.length} {r.candidates.length === 1 ? 'candidate' : 'candidates'}
          </span>
        </span>
        <Link to="/reviews" className="uc-today-action" aria-label={`Review ${r.case_ref}`}>
          Review
        </Link>
      </li>
    ))}
  </ul>
);

/**
 * The newest unread alerts. "Mark read" takes an alert out at once (the list closes over the gap)
 * and focus moves to the next one, so a run of alerts can be cleared from the keyboard.
 */
export const AlertRows: React.FC<{ alerts: Alert[] }> = ({ alerts }) => {
  const m = useMotionPrefs();
  const markRead = useMarkRead();
  const [leaving, setLeaving] = useState<Set<number>>(new Set());
  const [said, setSaid] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const shown = alerts.filter((a) => !leaving.has(a.id));

  const read = (a: Alert) => {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-mark-read]') ?? []);
    const at = buttons.findIndex((b) => b.dataset.markRead === String(a.id));
    const next = buttons[at + 1] ?? buttons[at - 1];
    setLeaving((s) => new Set(s).add(a.id));
    next?.focus();
    markRead.mutate(a.id, {
      onSuccess: () => setSaid(`Marked read: ${a.title}`),
      onError: () =>
        setLeaving((s) => {
          const copy = new Set(s);
          copy.delete(a.id);
          return copy;
        }),
    });
  };

  return (
    <>
      {markRead.isError && <p className="uc-today-error" role="alert">{apiErrorMessage(markRead.error)}</p>}
      <span role="status" className="uc-sr">{said}</span>
      {shown.length === 0 ? (
        <p className="uc-queue-empty">No unread alerts.</p>
      ) : (
        <ul className="uc-today-rows" ref={listRef}>
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((a) => {
              const target = alertTarget(a);
              return (
                <motion.li
                  key={a.id}
                  layout={m.reduce ? false : 'position'}
                  initial={m.enter(6)}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  exit={m.reduce ? { opacity: 0 } : { opacity: 0, x: 16 }}
                  transition={m.spring}
                  className="uc-today-row uc-today-alert"
                >
                  <div className="uc-today-alert-head">
                    <SeverityLabel severity={a.severity} label={ALERT_SEVERITY_LABELS[a.severity]} />
                    <time className="uc-meta" dateTime={a.created_at}>{formatDateTime(a.created_at)}</time>
                  </div>
                  <strong className="uc-today-alert-title">{a.title}</strong>
                  <span className="uc-today-alert-body">{a.body}</span>
                  <span className="uc-today-alert-actions">
                    {target && <Link to={target.to}>{target.label}</Link>}
                    <Button type="link" size="small" data-mark-read={a.id} onClick={() => read(a)} aria-label={`Mark read: ${a.title}`}>
                      Mark read
                    </Button>
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </>
  );
};
