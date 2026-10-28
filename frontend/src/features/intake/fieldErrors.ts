import type { AxiosError } from 'axios';
import type { ApiError } from '../../lib/api/types';
import type { IntakeFormValues } from './schema';

const FIELDS: ReadonlyArray<keyof IntakeFormValues> = [
  'source_channel', 'external_ref', 'received_at', 'complainant_type', 'complainant_name', 'raw_institution_text',
  'raw_state', 'raw_district', 'permanent_id', 'category_id', 'subject', 'description', 'route_to_bureau_id',
];

/** Backend 400 `fields` -> per-field messages on the form; anything it cannot place is returned as `rest`. */
export function splitApiFieldErrors(error: unknown): {
  fields: Partial<Record<keyof IntakeFormValues, string>>;
  rest: string[];
} {
  const apiError = (error as AxiosError<ApiError>).response?.data?.error;
  const fields: Partial<Record<keyof IntakeFormValues, string>> = {};
  const rest: string[] = [];
  for (const [name, messages] of Object.entries(apiError?.fields ?? {})) {
    const known = FIELDS.find((f) => f === name);
    if (known) fields[known] = messages.join(' ');
    else rest.push(`${name}: ${messages.join(' ')}`);
  }
  return { fields, rest };
}
