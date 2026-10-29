import { z } from 'zod';
import { COMPLAINANT_TYPES, SOURCE_CHANNELS } from '../../lib/api/enums';
import type { CaseCreate } from '../../lib/api/types';

/**
 * The intake form, with the same limits as the backend's `CaseCreate` (PRD §5), so Zod rejects what
 * the API would reject. Optional text fields are plain strings in the form ('' = not given).
 */
export const PERMANENT_ID_PATTERN = /^1-\d{6,11}$/;

const optionalText = (max: number) => z.string().max(max, `At most ${max} characters`);

export const intakeSchema = z.object({
  source_channel: z.enum(SOURCE_CHANNELS, { error: 'Choose how the complaint arrived' }),
  external_ref: optionalText(60),
  received_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date received'),
  complainant_type: z.enum(COMPLAINANT_TYPES, { error: 'Choose the complainant type' }),
  complainant_name: optionalText(120),
  raw_institution_text: z
    .string()
    .trim()
    .min(3, 'Enter at least 3 characters of the institution name')
    .max(300, 'At most 300 characters'),
  raw_state: optionalText(60),
  raw_district: optionalText(60),
  permanent_id: z.union([z.literal(''), z.string().regex(PERMANENT_ID_PATTERN, 'A Permanent ID looks like 1-43655981521')]),
  category_id: z.number({ error: 'Choose a category' }),
  subject: z.string().trim().min(3, 'Enter at least 3 characters').max(200, 'At most 200 characters'),
  description: z.string().trim().min(10, 'Describe the complaint in at least 10 characters').max(4000, 'At most 4000 characters'),
  route_to_bureau_id: z.number().nullable(),
});

export type IntakeFormValues = z.infer<typeof intakeSchema>;

const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/** Form values -> the `POST /cases` body (empty optional fields become null). */
export function toCaseCreate(values: IntakeFormValues): CaseCreate {
  return {
    source_channel: values.source_channel,
    external_ref: orNull(values.external_ref),
    received_at: values.received_at,
    complainant_type: values.complainant_type,
    complainant_name: orNull(values.complainant_name),
    raw_institution_text: values.raw_institution_text.trim(),
    raw_state: orNull(values.raw_state),
    raw_district: orNull(values.raw_district),
    permanent_id: orNull(values.permanent_id),
    category_id: values.category_id,
    subject: values.subject.trim(),
    description: values.description.trim(),
    route_to_bureau_id: values.route_to_bureau_id,
  };
}
