import { z } from 'zod';
import { DISPOSE_OUTCOMES, type ActionType } from '../../lib/api/enums';
import type { CaseActionIn } from '../../lib/api/types';
import { REMARKS_REQUIRED } from './workflow';

export type ActionFormValues = {
  remarks: string;
  to_bureau_id: number | null;
  to_officer_id: number | null;
  expected_disposal_date: string;
  outcome: (typeof DISPOSE_OUTCOMES)[number] | null;
};

export const emptyActionForm: ActionFormValues = {
  remarks: '', to_bureau_id: null, to_officer_id: null, expected_disposal_date: '', outcome: null,
};

/**
 * One schema per action, mirroring the backend's §4.3 rules: remarks for transfer / escalate / dispose / reopen,
 * a destination for transfer, an officer for assign, a future date for an interim reply, an outcome for dispose.
 * A bare remark must contain text.
 */
export function actionSchema(type: ActionType, today: string, currentBureauId: number) {
  const remarksNeeded = REMARKS_REQUIRED.includes(type) || type === 'remark';
  return z
    .object({
      remarks: remarksNeeded
        ? z.string().trim().min(1, 'Remarks are required').max(2000, 'At most 2000 characters')
        : z.string().trim().max(2000, 'At most 2000 characters'),
      to_bureau_id: z.number().nullable(),
      to_officer_id: z.number().nullable(),
      expected_disposal_date: z.string(),
      outcome: z.enum(DISPOSE_OUTCOMES).nullable(),
    })
    .superRefine((v, ctx) => {
      const need = (path: keyof ActionFormValues, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
      if (type === 'transfer') {
        if (v.to_bureau_id === null) need('to_bureau_id', 'Choose the bureau to transfer to');
        else if (v.to_bureau_id === currentBureauId) need('to_bureau_id', 'Choose a different bureau');
      }
      if (type === 'assign' && v.to_officer_id === null) need('to_officer_id', 'Choose an officer');
      if (type === 'interim_reply') {
        if (!v.expected_disposal_date) need('expected_disposal_date', 'Enter the expected disposal date');
        else if (v.expected_disposal_date < today) need('expected_disposal_date', 'The date cannot be in the past');
      }
      if (type === 'dispose' && v.outcome === null) need('outcome', 'Choose the outcome');
    });
}

export function toActionBody(type: ActionType, v: ActionFormValues, confirmOpenOverlap = false): CaseActionIn {
  const body: CaseActionIn = { action_type: type, remarks: v.remarks.trim() || null };
  if (type === 'transfer') body.to_bureau_id = v.to_bureau_id;
  if (type === 'assign') body.to_officer_id = v.to_officer_id;
  if (type === 'interim_reply') body.expected_disposal_date = v.expected_disposal_date;
  if (type === 'dispose') {
    body.outcome = v.outcome;
    if (confirmOpenOverlap) body.confirm_open_overlap = true;
  }
  return body;
}
