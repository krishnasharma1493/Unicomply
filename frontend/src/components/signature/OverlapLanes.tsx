import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { formatDate } from '../../lib/format';
import { useMotionPrefs } from '../../lib/motion';

export interface LaneCase {
  case_id: number;
  case_ref: string;
  bureau_code: string;
  received_at: string;
  /** Whether the viewer may open the full case; otherwise the dot is not a link. */
  in_scope: boolean;
  /** The case this view is about (the one just registered, or the one open on screen). */
  current?: boolean;
}

const DAY = 86_400_000;
/** The lane already names the bureau, so the dot carries only the serial: PGRC/2026/00412 → 00412. */
const shortRef = (ref: string) => ref.split('/').pop() ?? ref;
const t = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

/**
 * The overlap, drawn: one lane per bureau on a shared date axis, each case a dot where it was received.
 * It shows at a glance what the reasons say in words: the same matter is open in several units at once.
 * Screen readers get the same facts as one sentence; the linked-case list beside it carries the detail.
 */
export const OverlapLanes: React.FC<{ cases: LaneCase[]; caption?: string }> = ({ cases, caption = 'Cases on a shared timeline' }) => {
  const motionPrefs = useMotionPrefs();
  if (cases.length === 0) return null;
  const times = cases.map((c) => t(c.received_at));
  const span = Math.max(Math.max(...times) - Math.min(...times), 4 * DAY);
  const start = Math.min(...times) - span * 0.08;
  const end = Math.max(...times) + span * 0.08;
  const pos = (iso: string) => ((t(iso) - start) / (end - start)) * 100;
  const lanes = Array.from(new Set(cases.map((c) => c.bureau_code)));
  // The case this view is about lands first (it is the cause); the others follow in date order.
  const currentId = cases.find((c) => c.current)?.case_id;
  const order = [...cases].sort((a, b) => t(a.received_at) - t(b.received_at)).map((c) => c.case_id);
  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();

  return (
    <figure
      className="uc-lanes"
      role="img"
      aria-label={`${caption}: ${[...cases]
        .sort((a, b) => t(a.received_at) - t(b.received_at))
        .map((c) => `${c.case_ref} at ${c.bureau_code}, received ${formatDate(c.received_at)}${c.current ? ' (this case)' : ''}`)
        .join('; ')}.`}
    >
      <div aria-hidden="true">
        {lanes.map((code) => (
          <div key={code} className="uc-lane">
            <span className="uc-lane-code">{code}</span>
            <div className="uc-lane-track">
              {cases
                .filter((c) => c.bureau_code === code)
                .map((c) => {
                  const left = pos(c.received_at);
                  const flip = left > 72;
                  const dot = (
                    <>
                      <span className="uc-lane-dot" />
                      <span className="uc-lane-label uc-ref">{shortRef(c.case_ref)}</span>
                    </>
                  );
                  return (
                    <motion.span
                      key={c.case_id}
                      className={['uc-lane-case', c.current ? 'is-current' : '', flip ? 'is-flipped' : ''].join(' ')}
                      style={{ left: `${left}%` }}
                      initial={motionPrefs.reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ ...motionPrefs.quick, delay: motionPrefs.reduce || c.current ? 0 : (order.filter((id) => id !== currentId).indexOf(c.case_id) + (currentId === undefined ? 0 : 1)) * 0.07 }}
                    >
                      {c.in_scope ? (
                        <Link to={`/cases/${c.case_id}`} tabIndex={-1} title={c.case_ref}>
                          {dot}
                        </Link>
                      ) : (
                        dot
                      )}
                    </motion.span>
                  );
                })}
            </div>
          </div>
        ))}
        <div className="uc-lane-axis">
          <span>{formatDate(startIso)}</span>
          <span>{formatDate(endIso)}</span>
        </div>
      </div>
    </figure>
  );
};

export default OverlapLanes;
