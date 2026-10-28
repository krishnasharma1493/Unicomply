import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Col, List, Row, Space, Table, Typography } from 'antd';
import { BureauChip, KpiCard, TierChip } from '../../components/ui';
import { QueryBoundary } from '../../components/states';
import { apiErrorMessage } from '../../lib/format';
import { ErrorState } from '../../components/states';
import { CASE_STATUS_LABELS, OPEN_CASE_STATUSES } from '../../lib/api/enums';
import type { DashboardSummary, InstitutionStatusRow } from '../../lib/api/types';
import { ageingUrl, casesUrl, KPI_QUERY, workloadUrl } from './drilldown';
import { useAgeing, useLatestProbable, useSummary, useTopInstitutions, useWorkload } from './useDashboard';

const { Text } = Typography;

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
    <Row gutter={[16, 16]}>
      {KPIS.map(({ key, label }) => (
        <Col key={key} xs={12} md={8} xl={6}>
          <KpiCard
            label={label}
            loading={summary.isLoading}
            value={summary.data?.[key] ?? 0}
            onClick={() => navigate(casesUrl(KPI_QUERY[key]))}
          />
        </Col>
      ))}
    </Row>
  );
};

/** A bar chart, plus the same bars as real links so the drill-down also works from the keyboard. */
const ClickableBars: React.FC<{
  title: string;
  data: { key: string; label: string; value: number; url: string }[];
  unit: string;
  colour: string;
}> = ({ title, data, unit, colour }) => {
  const navigate = useNavigate();
  return (
    <>
      <div style={{ width: '100%', height: 220 }} aria-hidden="true">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} />
            <Tooltip formatter={(v) => [`${v} ${unit}`, title]} />
            <Bar dataKey="value" cursor="pointer" onClick={(d) => navigate((d as unknown as { url: string }).url)}>
              {data.map((d) => <Cell key={d.key} fill={colour} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Space wrap size={[8, 4]} role="group" aria-label={`${title} by category`}>
        {data.map((d) => (
          <Link key={d.key} to={d.url}>{d.label}: {d.value}</Link>
        ))}
      </Space>
    </>
  );
};

export const WorkloadChart: React.FC = () => {
  const workload = useWorkload();
  return (
    <Card title="Open cases by bureau" size="small">
      <QueryBoundary query={workload} loadingTip="Loading workload" emptyDescription="No open cases.">
        {(rows) => (
          <ClickableBars
            title="Open cases"
            unit="open"
            colour="#1e3a8a"
            data={rows.map((r) => ({ key: String(r.bureau_id), label: r.bureau_code, value: r.open, url: workloadUrl(r.bureau_id) }))}
          />
        )}
      </QueryBoundary>
    </Card>
  );
};

export const AgeingChart: React.FC<{ today?: string }> = ({ today }) => {
  const ageing = useAgeing();
  return (
    <Card title="Age of open cases" size="small">
      <QueryBoundary query={ageing} loadingTip="Loading ageing" emptyDescription="No open cases." isEmpty={(b) => b.every((x) => x.count === 0)}>
        {(buckets) => (
          <ClickableBars
            title="Open cases"
            unit="open"
            colour="#d97706"
            data={buckets.map((b) => ({ key: b.bucket, label: b.label, value: b.count, url: today ? ageingUrl(b, today) : '/cases?pending=true' }))}
          />
        )}
      </QueryBoundary>
    </Card>
  );
};

export const TopInstitutions: React.FC = () => {
  const rows = useTopInstitutions();
  return (
    <Card title="Institutions needing attention" size="small">
      <QueryBoundary query={rows} loadingTip="Loading institutions" emptyDescription="No institutions with cases yet.">
        {(data) => (
          <Table<InstitutionStatusRow>
            size="small"
            rowKey="permanent_id"
            pagination={false}
            dataSource={data}
            columns={[
              { title: 'Institution', dataIndex: 'name', render: (name: string, r) => <Link to={`/institutions/${r.permanent_id}`}>{name}</Link> },
              { title: 'Open', dataIndex: 'open', width: 70 },
              { title: 'Beyond SLA', dataIndex: 'beyond_sla', width: 110 },
              { title: 'Overlaps', dataIndex: 'open_overlap_groups', width: 90 },
              {
                title: 'By status',
                key: 'status',
                render: (_: unknown, r) =>
                  OPEN_CASE_STATUSES.filter((s) => r.by_status[s] > 0)
                    .map((s) => `${r.by_status[s]} ${CASE_STATUS_LABELS[s].toLowerCase()}`)
                    .join(', ') || '—',
              },
            ]}
          />
        )}
      </QueryBoundary>
    </Card>
  );
};

export const LatestOverlaps: React.FC = () => {
  const latest = useLatestProbable();
  return (
    <Card title="Latest probable overlaps" size="small" extra={<Link to="/overlaps">All overlaps</Link>}>
      <QueryBoundary query={latest} loadingTip="Loading overlaps" emptyDescription="No probable overlaps are waiting for a decision." isEmpty={(p) => p.data.length === 0}>
        {(page) => (
          <List
            dataSource={page.data}
            renderItem={(g) => (
              <List.Item>
                <Space orientation="vertical" size={2} style={{ width: '100%' }}>
                  <Space wrap>
                    <TierChip tier={g.tier} />
                    <Link to={`/overlaps/${g.id}`}>{g.anchor_name}</Link>
                  </Space>
                  <Space wrap size={[4, 4]}>
                    {g.bureau_codes.map((c) => <BureauChip key={c} code={c} />)}
                    <Text type="secondary">{g.case_count} cases</Text>
                  </Space>
                </Space>
              </List.Item>
            )}
          />
        )}
      </QueryBoundary>
    </Card>
  );
};

