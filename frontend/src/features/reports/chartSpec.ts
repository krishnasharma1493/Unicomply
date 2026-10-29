import type { ReportKind } from '../../lib/api/enums';
import type { AnyReport } from '../../lib/api/types';

export interface ChartSpec {
  categoryKey: string;
  series: { key: string; label: string; colour: string }[];
  /** Values are 0..1 rates, shown as percentages. */
  percent?: boolean;
  data: Record<string, string | number | null>[];
}

const BLUE = '#0b5e6b';
const GREEN = '#1d7a34';
const RED = '#b42318';
const AMBER = '#c26a00';
const PURPLE = '#8a918d';

/** One bar chart per report kind, shaped from the rows the API already returned (nothing is recomputed). */
export function chartSpec(report: AnyReport): ChartSpec {
  const rows = report.rows as unknown as Record<string, string | number | null>[];
  const kind: ReportKind = report.kind;
  switch (kind) {
    case 'bureau':
      return { categoryKey: 'bureau_code', data: rows, series: [{ key: 'open', label: 'Open', colour: BLUE }, { key: 'disposed', label: 'Disposed', colour: GREEN }, { key: 'beyond_sla', label: 'Beyond SLA', colour: RED }] };
    case 'region':
      return { categoryKey: 'region_name', data: rows, series: [{ key: 'open', label: 'Open', colour: BLUE }, { key: 'disposed', label: 'Disposed', colour: GREEN }, { key: 'beyond_sla', label: 'Beyond SLA', colour: RED }] };
    case 'institution':
      return {
        categoryKey: 'name',
        data: [...rows].sort((a, b) => Number(b.total) - Number(a.total)).slice(0, 10),
        series: [{ key: 'open', label: 'Open', colour: BLUE }, { key: 'disposed', label: 'Disposed', colour: GREEN }],
      };
    case 'status':
      return { categoryKey: 'status_name', data: rows, series: [{ key: 'count', label: 'Cases', colour: BLUE }] };
    case 'ageing':
      return { categoryKey: 'label', data: rows, series: [{ key: 'open', label: 'Open', colour: BLUE }, { key: 'beyond_sla', label: 'Beyond SLA', colour: RED }] };
    case 'disposal_rate':
      return { categoryKey: 'bureau_code', percent: true, data: rows, series: [{ key: 'disposal_rate', label: 'Disposal rate', colour: GREEN }] };
    case 'reopen_rate':
      return { categoryKey: 'bureau_code', percent: true, data: rows, series: [{ key: 'reopen_rate', label: 'Reopen rate', colour: AMBER }] };
    case 'overlaps':
      return {
        categoryKey: 'group',
        data: rows.map((r) => ({ ...r, group: `${r.level} · ${r.tier} · ${r.status}` })),
        series: [{ key: 'groups', label: 'Groups', colour: RED }, { key: 'cases', label: 'Cases', colour: PURPLE }],
      };
    case 'periodic':
      return { categoryKey: 'period', data: rows, series: [{ key: 'received', label: 'Received', colour: BLUE }, { key: 'disposed', label: 'Disposed', colour: GREEN }, { key: 'reopened', label: 'Reopened', colour: AMBER }] };
  }
}

/** A cell as the table shows it: rates as percentages, empty as a dash. */
export function formatCell(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number' && key.endsWith('_rate')) return `${(value * 100).toFixed(1)}%`;
  return String(value);
}
