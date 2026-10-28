import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Table } from 'antd';
import { BureauChip, KpiCard, TierChip } from '../../components/ui';
import { QueryBoundary } from '../../components/states';
import { Section } from '../../components/layout/PageHeader';
import { palette } from '../../theme';
import { apiErrorMessage } from '../../lib/format';
import { ErrorState } from '../../components/states';
import { CASE_STATUS_LABELS, OPEN_CASE_STATUSES } from '../../lib/api/enums';
import type { DashboardSummary, InstitutionStatusRow } from '../../lib/api/types';
import { ageingUrl, casesUrl, KPI_QUERY, workloadUrl } from './drilldown';
import { useAgeing, useLatestProbable, useSummary, useTopInstitutions, useWorkload } from './useDashboard';

const KPIS: { key: keyof Omit<DashboardSummary, 'as_of'>; label: string }[] = [
  { key: 'total', label: 'Total cases' },
  { key: 'pending', label: 'Pending' },
  { key: 'under_process', label: 'Under process' },
  { key: 'disposed', label: 'Disposed' },
  { key: 'transferred', label: 'Transferred' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'beyond_sla', label: 'Beyond SLA' },
  { key: 'open_overlaps', label: 'Open overlaps' },
];

export const KpiRow: React.FC = () => {
  const navigate = useNavigate();
  const summary = useSummary();
  if (summary.isError) return <ErrorState card message={apiErrorMessage(summary.error)} onRetry={() => void summary.refetch()} />;
  return (
    <div className="uc-kpis" role="group" aria-label="Key figures">
      {KPIS.map(({ key, label }) => (
        <KpiCard
          key={key}
          label={label}
          loading={summary.isLoading}
          value={summary.data?.[key] ?? 0}
          className={(key === 'beyond_sla' || key === 'open_overlaps') && (summary.data?.[key] ?? 0) > 0 ? 'uc-kpi--alert' : undefined}
          onClick={() => navigate(casesUrl(KPI_QUERY[key]))}
        />
      ))}
    </div>
  );
};

/** A bar chart, plus the same bars as real links so the drill-down also works from the keyboard. */
const ClickableBars: React.FC<{
  title: string;
  data: { key: string; label: string; value: number; url: string; colour?: string }[];
  unit: string;
  colour: string;
}> = ({ title, data, unit, colour }) => {
  const navigate = useNavigate();
  return (
    <>
      <div style={{ width: '100%', height: 220 }} aria-hidden="true">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid vertical={false} stroke="rgba(0, 0, 0, 0.07)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: palette.textSecondary }} tickLine={false} axisLine={{ stroke: 'rgba(0, 0, 0, 0.15)' }} interval={0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: palette.textSecondary }} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }}
              formatter={(v) => [`${v} ${unit}`, title]}
              contentStyle={{ borderRadius: 10, border: 0, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', fontSize: 13 }}
            />
            <Bar dataKey="value" cursor="pointer" radius={[4, 4, 0, 0]} maxBarSize={36} onClick={(d) => navigate((d as unknown as { url: string }).url)}>
              {data.map((d) => <Cell key={d.key} fill={d.colour ?? colour} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="uc-chart-links" role="group" aria-label={`${title} by category`}>
        {data.map((d) => (
          <Link key={d.key} to={d.url}>{d.label}: {d.value}</Link>
        ))}
      </div>
    </>
  );
};

export const WorkloadChart: React.FC = () => {
  const workload = useWorkload();
  return (
    <Section title="Open cases by bureau">
      <QueryBoundary query={workload} loadingTip="Loading workload" emptyDescription="No open cases.">
        {(rows) => (
          <ClickableBars
            title="Open cases"
            unit="open"
            colour={palette.accent}
            data={rows.map((r) => ({ key: String(r.bureau_id), label: r.bureau_code, value: r.open, url: workloadUrl(r.bureau_id) }))}
          />
        )}
      </QueryBoundary>
    </Section>
  );
};

export const AgeingChart: React.FC<{ today?: string }> = ({ today }) => {
  const ageing = useAgeing();
  return (
    <Section title="Age of open cases">
      <QueryBoundary query={ageing} loadingTip="Loading ageing" emptyDescription="No open cases." isEmpty={(b) => b.every((x) => x.count === 0)}>
        {(buckets) => (
          <>
            <p className="uc-chart-note">
              <span className="uc-swatch" style={{ background: palette.chartNeutral }} />Within the 21-day SLA
              <span className="uc-swatch" style={{ background: palette.red, marginLeft: 14 }} />Older than 21 days
            </p>
            <ClickableBars
              title="Open cases"
              unit="open"
              colour={palette.chartNeutral}
              data={buckets.map((b) => ({
                key: b.bucket,
                label: b.label,
                value: b.count,
                url: today ? ageingUrl(b, today) : '/cases?pending=true',
                colour: b.min_days > 21 ? palette.red : undefined,
              }))}
            />
          </>
        )}
      </QueryBoundary>
    </Section>
  );
};

export const TopInstitutions: React.FC = () => {
  const rows = useTopInstitutions();
  return (
    <Section title="Institutions needing attention" flush>
      <QueryBoundary query={rows} loadingTip="Loading institutions" emptyDescription="No institutions with cases yet.">
        {(data) => (
          <Table<InstitutionStatusRow>
            size="small"
            rowKey="permanent_id"
            pagination={false}
            dataSource={data}
            columns={[
              { title: 'Institution', dataIndex: 'name', width: '34%', render: (name: string, r) => <Link to={`/institutions/${r.permanent_id}`}>{name}</Link> },
              { title: 'Open', dataIndex: 'open', width: 70 },
              { title: 'Beyond SLA', dataIndex: 'beyond_sla', width: 110 },
              { title: 'Overlaps', dataIndex: 'open_overlap_groups', width: 90 },
              {
                title: 'By status',
                key: 'status',
                className: 'uc-meta',
                render: (_: unknown, r) =>
                  OPEN_CASE_STATUSES.filter((s) => r.by_status[s] > 0)
                    .map((s) => `${r.by_status[s]} ${CASE_STATUS_LABELS[s].toLowerCase()}`)
                    .join(', ') || '—',
              },
            ]}
          />
        )}
      </QueryBoundary>
    </Section>
  );
};

export const LatestOverlaps: React.FC = () => {
  const latest = useLatestProbable();
  return (
    <Section title="Latest probable overlaps" extra={<Link to="/overlaps">All overlaps</Link>}>
      <QueryBoundary query={latest} loadingTip="Loading overlaps" emptyDescription="No probable overlaps are waiting for a decision." isEmpty={(p) => p.data.length === 0}>
        {(page) => (
          <ul className="uc-rows">
            {page.data.map((g) => (
              <li key={g.id}>
                <div className="uc-title-line" style={{ gap: 8 }}>
                  <TierChip tier={g.tier} />
                  <Link to={`/overlaps/${g.id}`} style={{ fontWeight: 500 }}>{g.anchor_name}</Link>
                </div>
                <div className="uc-title-line" style={{ gap: 6, marginTop: 6 }}>
                  {g.bureau_codes.map((c) => <BureauChip key={c} code={c} />)}
                  <span className="uc-meta">{g.case_count} cases</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
    </Section>
  );
};

