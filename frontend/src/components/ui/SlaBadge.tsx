import React from 'react';
import { Tag } from 'antd';
import type { CaseStatus } from '../../lib/api/enums';
import { diffCalendarDays } from '../../lib/format';

export interface SlaBadgeProps {
  /** Elapsed days from API `case.age_days` */
  ageDays?: number;
  /** Boolean from API `case.beyond_sla` */
  beyondSla?: boolean;
  /** ISO date string or Date when case was received */
  receivedAt?: string | Date;
  /** ISO date string or Date when SLA is due */
  slaDueOn?: string | Date;
  /** Total SLA days fallback (defaults to 21 if receivedAt & slaDueOn are absent) */
  totalSlaDays?: number;
  /** Case status. If 'disposed', displays 'Closed'. */
  status?: CaseStatus;
  /** Optional fallback reference date. NEVER defaults to new Date(). */
  today?: string | Date;
  className?: string;
  style?: React.CSSProperties;
  /** Draw the SLA as a track of days beside the words (default). Off where space is tight. */
  track?: boolean;
}

/**
 * The SLA clock: one tick per day of the SLA, elapsed days filled. It reads as proportion at a glance;
 * the words beside it carry the meaning, so colour is never alone.
 */
const SlaTrack: React.FC<{ age: number; total: number; tone: 'normal' | 'warning' | 'error' }> = ({ age, total, tone }) => {
  const n = Math.min(Math.max(total, 1), 30);
  const filled = Math.min(age, total) * (n / Math.max(total, 1));
  const w = 64;
  const gap = n > 15 ? 1 : 2;
  const seg = (w - gap * (n - 1)) / n;
  return (
    <svg className={`uc-sla-track uc-sla-track--${tone}`} width={w} height="8" viewBox={`0 0 ${w} 8`} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={i * (seg + gap)} y="1" width={seg} height="6" rx="0.75" className={i < Math.round(filled) ? 'on' : 'off'} />
      ))}
    </svg>
  );
};

export const SlaBadge: React.FC<SlaBadgeProps> = ({
  ageDays,
  beyondSla,
  receivedAt,
  slaDueOn,
  totalSlaDays,
  status,
  today,
  className,
  style,
  track = true,
}) => {
  // Disposed cases are closed; SLA clock is stopped
  if (status === 'disposed') {
    return (
      <Tag
        color="default"
        className={className}
        style={{ fontWeight: 500, ...style }}
      >
        Closed
      </Tag>
    );
  }

  // Calculate total SLA days: derived from slaDueOn - receivedAt, or totalSlaDays fallback, or default 21
  let totalDays = 21;
  if (receivedAt && slaDueOn) {
    const diff = diffCalendarDays(receivedAt, slaDueOn);
    if (diff > 0) totalDays = diff;
    else if (totalSlaDays && totalSlaDays > 0) totalDays = totalSlaDays;
  } else if (totalSlaDays && totalSlaDays > 0) {
    totalDays = totalSlaDays;
  }

  // Calculate ageDays: use API prop if provided, else fallback to today - receivedAt if today was explicitly passed
  let age = 0;
  if (typeof ageDays === 'number') {
    age = ageDays;
  } else if (receivedAt && today) {
    age = Math.max(0, diffCalendarDays(receivedAt, today));
  }

  // Warning day threshold: for 21 days it's 17; generally totalDays - 4
  const warnThreshold = Math.max(1, totalDays - 4);

  // Check if case is beyond SLA: API beyondSla flag takes precedence; otherwise age > totalDays
  const isOverdue = beyondSla === true || (beyondSla === undefined && age > totalDays);

  if (isOverdue) {
    const overdueDays = Math.max(1, age - totalDays);
    return (
      <span className="uc-sla">
        {track && <SlaTrack age={age} total={totalDays} tone="error" />}
        <Tag color="error" className={className} style={{ fontWeight: 600, ...style }}>
          Beyond SLA +{overdueDays}
        </Tag>
      </span>
    );
  }

  // Warning threshold (day 17 to totalDays e.g. day 21) is amber
  if (age >= warnThreshold) {
    return (
      <span className="uc-sla">
        {track && <SlaTrack age={age} total={totalDays} tone="warning" />}
        <Tag color="warning" className={className} style={{ fontWeight: 600, ...style }}>
          Day {age} of {totalDays}
        </Tag>
      </span>
    );
  }

  // Normal within SLA (< warnThreshold) is neutral
  return (
    <span className="uc-sla">
      {track && <SlaTrack age={age} total={totalDays} tone="normal" />}
      <Tag color="default" className={['uc-sla-plain', className].filter(Boolean).join(' ')} style={{ fontWeight: 500, ...style }}>
        Day {age} of {totalDays}
      </Tag>
    </span>
  );
};

export default SlaBadge;
