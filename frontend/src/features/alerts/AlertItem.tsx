import type { Alert } from '../../lib/api/types';
import type { AlertSeverity } from '../../lib/api/enums';

export const SEVERITY_COLOUR: Record<AlertSeverity, string> = { critical: 'red', warning: 'gold', info: 'blue' };

/** Where an alert points: the overlap group for an overlap, else the case. */
export function alertTarget(a: Pick<Alert, 'group_id' | 'case_id' | 'case_ref' | 'type'>): { to: string; label: string } | null {
  if (a.type === 'overlap' && a.group_id !== null) return { to: `/overlaps/${a.group_id}`, label: 'Open overlap' };
  if (a.case_id !== null) return { to: `/cases/${a.case_id}`, label: a.case_ref ? `Open ${a.case_ref}` : 'Open case' };
  if (a.group_id !== null) return { to: `/overlaps/${a.group_id}`, label: 'Open overlap' };
  return null;
}
