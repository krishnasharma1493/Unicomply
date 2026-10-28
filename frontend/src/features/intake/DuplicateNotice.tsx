import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { WarningFilled } from '@ant-design/icons';
import { useWatch, type Control } from 'react-hook-form';
import type { Resolution } from '../../lib/api/types';
import { formatDate } from '../../lib/format';
import type { IntakeFormValues } from './schema';
import { resolvedPid, useDuplicateHit } from './useDuplicateCheck';

export interface DuplicateNoticeProps {
  control: Control<IntakeFormValues>;
  resolution: Resolution | undefined;
  armed: boolean;
  today: string;
  /** The operator has now seen a warning about this case; the next press of Register goes through. */
  onSeen: (caseId: number) => void;
}

/**
 * "Possible duplicate: …. Register anyway?" above the Register button. It watches only the fields it
 * needs, so typing elsewhere in the form does not re-render it, and typing here does not re-render the form.
 */
export const DuplicateNotice: React.FC<DuplicateNoticeProps> = ({ control, resolution, armed, today, onSeen }) => {
  const [permanentId, receivedAt, categoryId, subject] = useWatch({
    control,
    name: ['permanent_id', 'received_at', 'category_id', 'subject'],
  });
  const hit = useDuplicateHit(
    { permanentId: resolvedPid(permanentId, resolution), receivedAt, categoryId, subject },
    armed,
  );
  const hitId = hit?.case.id;
  useEffect(() => {
    if (hitId !== undefined) onSeen(hitId);
  }, [hitId, onSeen]);
  if (!hit) return null;
  return (
    <div className="uc-intake-duplicate" role="alert">
      <WarningFilled aria-hidden="true" />
      <div>
        <strong>Possible duplicate: </strong>
        <Link to={`/cases/${hit.case.id}`} className="uc-ref">{hit.case.case_ref}</Link>, registered{' '}
        {hit.case.received_at === today ? 'today' : `on ${formatDate(hit.case.received_at)}`} for the same institution and{' '}
        {hit.why === 'category' ? 'category' : 'a very similar subject'}. Register anyway?
      </div>
    </div>
  );
};
