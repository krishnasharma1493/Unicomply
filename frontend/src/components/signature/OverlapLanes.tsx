import React from 'react';
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
/** Cases closer than this share one marker, so labels never overprint each other. */
const CLUSTER_GAP = 7;
function clusters(lane: LaneCase[], pos: (iso: string) => number): { left: number; cases: LaneCase[] }[] {
  const sorted = [...lane].sort((a, b) => pos(a.received_at) - pos(b.received_at));
  const out: { left: number; cases: LaneCase[] }[] = [];
  for (const c of sorted) {
    const p = pos(c.received_at);
    const last = out[out.length - 1];
    if (last && p - last.left < CLUSTER_GAP) last.cases.push(c);
    else out.push({ left: p, cases: [c] });
  }
  return out;
}
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
  // Same order on every page: the bureau of the case in view first, then by each bureau's first case.
  const firstSeen = new Map<string, number>();
  for (const c of cases) firstSeen.set(c.bureau_code, Math.min(firstSeen.get(c.bureau_code) ?? Infinity, t(c.received_at)));
  const currentBureau = cases.find((c) => c.current)?.bureau_code;
  const lanes = Array.from(firstSeen.keys()).sort(
    (a, b) => Number(b === currentBureau) - Number(a === currentBureau) || firstSeen.get(a)! - firstSeen.get(b)! || a.localeCompare(b),
  );
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
              {clusters(cases.filter((c) => c.bureau_code === code), pos).map((group) => {
                const left = group.left;
                const flip = left > 62;
                const lead = group.cases.find((c) => c.current) ?? group.cases[0];
                const first = Math.min(...group.cases.map((c) => order.indexOf(c.case_id)));
                return (
                  <motion.span
                    key={group.cases.map((c) => c.case_id).join('-')}
                    className={['uc-lane-case', group.cases.some((c) => c.current) ? 'is-current' : '', flip ? 'is-flipped' : ''].join(' ')}
                    style={{ left: `${left}%` }}
                    initial={motionPrefs.reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      ...motionPrefs.quick,
                      delay: motionPrefs.reduce || lead.current ? 0 : (first + (currentId === undefined ? 0 : 1)) * 0.07,
                    }}
                  >
                    <span className="uc-lane-dot" />
                    <span className="uc-lane-label uc-ref">
                      {group.cases.map((c, i) => (
                        <React.Fragment key={c.case_id}>
                          {i > 0 && <span className="uc-lane-sep"> · </span>}
                          <span title={c.case_ref} className={c.current ? 'is-current' : undefined}>
                            {shortRef(c.case_ref)}
                          </span>
                        </React.Fragment>
                      ))}
                    </span>
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
