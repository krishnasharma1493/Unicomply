import React from 'react';
import { Link } from 'react-router-dom';
import { OVERLAP_GROUP_STATUS_LABELS, OVERLAP_LEVEL_LABELS } from '../../../lib/api/enums';
import type { OverlapGroupListItem } from '../../../lib/api/types';
import { BureauChip, TierChip } from '../../../components/ui';
import { diffCalendarDays } from '../../../lib/format';

const isPermanentId = (anchor: string) => /^1-\d{6,11}$/.test(anchor);

export const OverlapGroupCard: React.FC<{ group: OverlapGroupListItem; today?: string }> = ({ group, today }) => {
  const days = today ? Math.max(0, diffCalendarDays(group.created_at, today)) : null;
  const decided = group.status !== 'open';
  return (
    <Link to={`/overlaps/${group.id}`} aria-label={`Overlap group: ${group.anchor_name}`} className={`uc-group-row uc-pressable ov-row ov-row--${group.tier}`}>
      <div className="uc-group-main">
        <div className="uc-title-line" style={{ gap: 8 }}>
          <TierChip tier={group.tier} />
          <span className="uc-group-name">{group.anchor_name}</span>
          {decided && <strong className="uc-meta">{OVERLAP_GROUP_STATUS_LABELS[group.status]}</strong>}
        </div>
        <div className="uc-meta" style={{ marginTop: 4 }}>
          {OVERLAP_LEVEL_LABELS[group.level]}
          {isPermanentId(group.anchor_key) && <> · <span className="uc-num">{group.anchor_key}</span></>}
          {group.coordinator_name ? <> · Coordinator: <span className="ov-row-coordinator">{group.coordinator_name}</span></> : ''}
        </div>
      </div>
      <div className="uc-group-bureaus">
        {group.bureau_codes.map((code) => <BureauChip key={code} code={code} />)}
      </div>
      <div className="uc-group-when uc-meta">
        <span className="uc-num" style={{ color: 'var(--uc-text)', fontWeight: 500 }}>
          {group.case_count} {group.case_count === 1 ? 'case' : 'cases'}
        </span>
        {days !== null && <span>{days === 0 ? 'flagged today' : `flagged ${days} ${days === 1 ? 'day' : 'days'} ago`}</span>}
      </div>
    </Link>
  );
};
