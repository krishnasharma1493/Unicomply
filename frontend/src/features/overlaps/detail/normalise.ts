import type { LinkedCaseCard, Meta } from '../../../lib/api/types';

/**
 * `GET /overlaps/{id}` lists `cases` as cards. The backend currently sends the full case record for cases the viewer
 * may open and a card otherwise, so read either shape into one card (a full record is, by definition, in scope).
 */
export function asCard(raw: unknown, meta: Meta): LinkedCaseCard {
  const c = raw as Record<string, unknown>;
  if (typeof c.case_id === 'number' && typeof c.bureau_code === 'string') return raw as LinkedCaseCard;
  const bureauId = Number(c.current_bureau_id ?? c.bureau_id);
  const categoryId = Number(c.category_id);
  const officerId = (c.assigned_officer_id as number | null | undefined) ?? null;
  return {
    case_id: Number(c.case_id ?? c.id),
    case_ref: String(c.case_ref),
    permanent_id: (c.permanent_id as string | null) ?? null,
    institution_name: (c.institution_name as string | null) ?? null,
    bureau_id: bureauId,
    bureau_code: meta.bureaus.find((b) => b.id === bureauId)?.code ?? String(bureauId),
    status: c.status as LinkedCaseCard['status'],
    category_id: categoryId,
    category_code: (meta.categories.find((k) => k.id === categoryId)?.code ?? 'other') as LinkedCaseCard['category_code'],
    subject: String(c.subject ?? ''),
    assigned_officer_id: officerId,
    assigned_officer_name: meta.officers.find((o) => o.id === officerId)?.name ?? null,
    last_action_type: (c.last_action_type as LinkedCaseCard['last_action_type']) ?? null,
    last_action_at: (c.last_action_at as string | null) ?? null,
    received_at: String(c.received_at),
    in_scope: typeof c.in_scope === 'boolean' ? c.in_scope : true,
  };
}
