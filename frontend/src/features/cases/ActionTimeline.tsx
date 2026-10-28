import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ACTION_TYPE_LABELS, DISPOSE_OUTCOME_LABELS } from '../../lib/api/enums';
import type { CaseAction, Meta } from '../../lib/api/types';
import { EmptyState } from '../../components/states';
import { formatDateTime } from '../../lib/format';
import { useMotionPrefs } from '../../lib/motion';

/** Actions that change who holds the case or how urgent it is get a filled marker; the words carry the meaning. */
const MARKED = new Set(['transfer', 'escalate', 'dispose', 'reopen']);

/**
 * The full history, newest first (PS feature 5). A new action enters at the top and the rest move
 * down with it; on load nothing animates. Transfers and escalations are written out, never colour alone.
 */
export const ActionTimeline: React.FC<{ actions: CaseAction[]; meta: Meta }> = ({ actions, meta }) => {
  const m = useMotionPrefs();
  if (actions.length === 0) return <EmptyState description="No action has been recorded on this case yet." minHeight={80} />;
  const code = (id: number | null) => meta.bureaus.find((b) => b.id === id)?.code ?? (id === null ? '' : `#${id}`);
  const officer = (id: number | null) => meta.officers.find((o) => o.id === id)?.name ?? (id === null ? '' : `#${id}`);
  const newestFirst = [...actions].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  return (
    <ol className="uc-timeline" aria-label="Case history, newest first">
      <AnimatePresence initial={false}>
        {newestFirst.map((a) => (
          <motion.li
            key={a.id}
            layout={m.reduce ? false : 'position'}
            initial={m.enter(-8)}
            animate={{ opacity: 1, y: 0 }}
            transition={m.spring}
            className={['uc-timeline-item', MARKED.has(a.action_type) ? 'is-marked' : '', a.action_type === 'escalate' ? 'is-escalated' : ''].join(' ')}
          >
            <div className="uc-timeline-head">
              <strong>{ACTION_TYPE_LABELS[a.action_type]}</strong>
              {a.action_type === 'transfer' && <span className="uc-label">{code(a.from_bureau_id)} → {code(a.to_bureau_id)}</span>}
              {a.action_type === 'escalate' && <span className="uc-label uc-label--escalated">Escalated</span>}
              {a.action_type === 'assign' && a.to_officer_id !== null && <span className="uc-meta">to {officer(a.to_officer_id)}</span>}
              {a.outcome && <span className="uc-label uc-label--outcome">{DISPOSE_OUTCOME_LABELS[a.outcome]}</span>}
            </div>
            <div className="uc-meta">
              {a.actor_name} · {code(a.bureau_id)} · <time dateTime={a.created_at}>{formatDateTime(a.created_at)}</time>
            </div>
            {a.remarks && <p className="uc-timeline-remark">{a.remarks}</p>}
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
};
