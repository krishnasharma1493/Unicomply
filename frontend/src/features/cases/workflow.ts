import type { ActionType, CaseStatus } from '../../lib/api/enums';
import type { CaseRead, UserMe } from '../../lib/api/types';

/** PRD §4.3: the statuses each action may start from. The backend enforces this; the UI only hides what cannot work. */
const OPEN: CaseStatus[] = ['received', 'under_process', 'interim_reply', 'transferred', 'escalated', 'reopened'];
export const ALLOWED_FROM: Record<ActionType, CaseStatus[]> = {
  assign: ['received', 'transferred', 'escalated', 'reopened'],
  transfer: OPEN,
  escalate: OPEN,
  interim_reply: ['under_process', 'escalated', 'reopened'],
  remark: [...OPEN, 'disposed'],
  dispose: OPEN,
  reopen: ['disposed'],
};

/** Actions that need written remarks (§4.3 "Mandatory remarks"). */
export const REMARKS_REQUIRED: ActionType[] = ['transfer', 'escalate', 'dispose', 'reopen'];

export const ACTION_ORDER: ActionType[] = ['assign', 'interim_reply', 'remark', 'transfer', 'escalate', 'dispose', 'reopen'];

/**
 * §4.2 "Can do": a bureau head or RO officer may take every action on cases at their own bureau / RO; the senior
 * officer may escalate or remark on any case (and decides overlaps); intake never acts on a case.
 */
export function canAct(user: UserMe, c: Pick<CaseRead, 'current_bureau_id'>, action: ActionType): boolean {
  if (user.role === 'senior_mgmt') return action === 'escalate' || action === 'remark';
  if (user.role === 'bureau_head' || user.role === 'ro_officer') {
    return user.bureau_id !== null && user.bureau_id === c.current_bureau_id;
  }
  return false;
}

export function allowedActions(user: UserMe, c: Pick<CaseRead, 'current_bureau_id' | 'status'>): ActionType[] {
  return ACTION_ORDER.filter((action) => ALLOWED_FROM[action].includes(c.status) && canAct(user, c, action));
}
