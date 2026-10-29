import React from 'react';
import { Link } from 'react-router-dom';
import { ACTION_TYPE_LABELS } from '../../lib/api/enums';
import type { LinkedCaseCard as LinkedCaseCardData } from '../../lib/api/types';
import { formatDate } from '../../lib/format';
import { BureauChip, StatusChip } from '../ui';

export interface LinkedCaseCardProps {
  card: LinkedCaseCardData;
  /** Shown when the overlap group is confirmed. */
  coordinatorName?: string | null;
}

const words = (code: string) => code.replace(/_/g, ' ');

/**
 * The coordination summary of a case in an overlap group (PRD §4.2). It never carries the
 * description or complainant name; a case outside the viewer's scope is plain text, not a link.
 * It renders as a row: the list around it supplies the hairlines, never a box.
 */
export const LinkedCaseCard: React.FC<LinkedCaseCardProps> = ({ card, coordinatorName }) => (
  <article className="uc-linked" aria-label={`Linked case ${card.case_ref}`}>
    <div className="uc-linked-head">
      {card.in_scope ? (
        <Link to={`/cases/${card.case_id}`} className="uc-linked-ref uc-ref">
          {card.case_ref}
        </Link>
      ) : (
        <>
          <span className="uc-linked-ref uc-ref">{card.case_ref}</span>
          <span className="uc-label uc-label--outline">Summary only</span>
        </>
      )}
      <BureauChip code={card.bureau_code} />
      <StatusChip status={card.status} />
    </div>
    <div className="uc-linked-subject">{card.subject}</div>
    <div className="uc-meta">
      {words(card.category_code)} · Officer: {card.assigned_officer_name ?? 'Not assigned'}
    </div>
    <div className="uc-meta">
      {card.last_action_type && card.last_action_at
        ? `Last action: ${ACTION_TYPE_LABELS[card.last_action_type]}, ${formatDate(card.last_action_at)}`
        : `Received ${formatDate(card.received_at)}; no action yet`}
    </div>
    {coordinatorName && <div className="uc-meta">Coordinator: {coordinatorName}</div>}
  </article>
);

export default LinkedCaseCard;
