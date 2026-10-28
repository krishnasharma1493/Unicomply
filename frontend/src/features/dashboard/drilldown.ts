import type { AgeingBucketKey } from '../../lib/api/enums';
import type { DashboardSummary } from '../../lib/api/types';

/** Each KPI opens `/cases` filtered to exactly the cases it counts (PRD §7: every KPI is clickable). */
export const KPI_QUERY: Record<keyof Omit<DashboardSummary, 'as_of'>, string> = {
  total: '',
  pending: 'pending=true',
  under_process: 'status=under_process,interim_reply', // PRD §4.1: under process includes interim reply
  disposed: 'status=disposed',
  transferred: 'status=transferred',
  escalated: 'status=escalated',
  beyond_sla: 'beyond_sla=true',
  open_overlaps: 'in_overlap=true',
};

export const casesUrl = (query: string) => (query ? `/cases?${query}` : '/cases');

export const workloadUrl = (bureauId: number) => casesUrl(`pending=true&bureau_id=${bureauId}`);

const addDays = (isoDate: string, days: number) =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Open cases aged `min..max` days were received between `today - max` and `today - min`. */
export function ageingUrl(bucket: { min_days: number; max_days: number | null }, today: string): string {
  const parts = ['pending=true'];
  if (bucket.max_days !== null) parts.push(`from=${addDays(today, -bucket.max_days)}`);
  parts.push(`to=${addDays(today, -bucket.min_days)}`);
  return casesUrl(parts.join('&'));
}

export type { AgeingBucketKey };
