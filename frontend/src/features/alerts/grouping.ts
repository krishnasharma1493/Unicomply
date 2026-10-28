import type { AlertSeverity } from '../../lib/api/enums';
import type { Alert } from '../../lib/api/types';

export const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 3, warning: 2, info: 1 };

export interface AlertGroup {
  key: string;
  permanentId: string | null;
  institutionName: string | null;
  /** YYYY-MM-DD (UTC), the day the alerts were raised. */
  day: string;
  severity: AlertSeverity;
  unread: number;
  latest: string;
  alerts: Alert[];
}

const bySeverityThenNewest = (a: Alert, b: Alert) =>
  SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.created_at.localeCompare(a.created_at) || b.id - a.id;

/**
 * Alerts about one institution on one day become one card (PRD §4.6: the two best-supported fixes for alert fatigue are
 * grouping and sorting by severity). Cards run critical first, then newest; so do the alerts inside a card.
 */
export function groupAlerts(alerts: Alert[]): AlertGroup[] {
  const groups = new Map<string, AlertGroup>();
  for (const a of alerts) {
    const day = a.created_at.slice(0, 10);
    const key = `${a.permanent_id ?? 'none'}|${day}`;
    const g = groups.get(key) ?? {
      key, permanentId: a.permanent_id, institutionName: a.institution_name, day, severity: a.severity, unread: 0, latest: a.created_at, alerts: [],
    };
    g.alerts.push(a);
    if (SEVERITY_RANK[a.severity] > SEVERITY_RANK[g.severity]) g.severity = a.severity;
    if (!a.is_read) g.unread += 1;
    if (a.created_at > g.latest) g.latest = a.created_at;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, alerts: [...g.alerts].sort(bySeverityThenNewest) }))
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.latest.localeCompare(a.latest) || a.key.localeCompare(b.key));
}
