import React, { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert, Button, Card, DatePicker, Segmented, Select, Space, Table, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PageHeader } from '../components/layout/PageHeader';
import { QueryBoundary } from '../components/states';
import { chartSpec, formatCell } from '../features/reports/chartSpec';
import { useCsvDownload, useReport, type Grouping, type ReportRequest } from '../features/reports/useReport';
import { useMeta } from '../features/meta/useMeta';
import { REPORT_KINDS, REPORT_KIND_LABELS, type ReportKind } from '../lib/api/enums';
import type { AnyReport, Meta } from '../lib/api/types';
import { apiErrorMessage, formatDate, formatDateTime } from '../lib/format';

const { Text } = Typography;

/** Phone width: the chart turns on its side rather than disappearing. */
function useNarrow(query = '(max-width: 600px)'): boolean {
  const [narrow, setNarrow] = React.useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const on = () => setNarrow(mql.matches);
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, [query]);
  return narrow;
}

const ReportView: React.FC<{ report: AnyReport }> = ({ report }) => {
  const spec = chartSpec(report);
  const rows = report.rows as unknown as Record<string, unknown>[];
  const narrow = useNarrow();
  const totals = report.totals as unknown as Record<string, unknown>;
  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Text type="secondary">
        {REPORT_KIND_LABELS[report.kind]}, cases received {formatDate(report.from)} to {formatDate(report.to)}. Generated {formatDateTime(report.generated_at)}.
      </Text>
      <Card size="small" title="Chart" className="uc-report-chart">
        <div style={{ width: '100%', height: narrow ? Math.max(260, spec.data.length * spec.series.length * 12 + 80) : 280 }} aria-hidden="true" inert>
          <ResponsiveContainer>
            {narrow ? (
              // On a phone the categories run down the side, so thirteen bureau codes stay legible.
              <BarChart data={spec.data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid horizontal={false} stroke="rgba(0, 0, 0, 0.07)" />
                <YAxis type="category" dataKey={spec.categoryKey} width={70} tick={{ fontSize: 11, fill: '#5b625e' }} tickLine={false} axisLine={{ stroke: 'rgba(0, 0, 0, 0.15)' }} interval={0} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#5b625e' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => (spec.percent ? `${Math.round(v * 100)}%` : String(v))} domain={spec.percent ? [0, 1] : undefined} />
                <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 13 }} formatter={(value: string) => <span style={{ color: 'var(--uc-text)' }}>{value}</span>} />
                {spec.series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.colour} radius={[0, 3, 3, 0]} maxBarSize={10} animationDuration={700} animationEasing="ease-out" />)}
              </BarChart>
            ) : (
            <BarChart data={spec.data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid vertical={false} stroke="rgba(0, 0, 0, 0.07)" />
              <XAxis dataKey={spec.categoryKey} tick={{ fontSize: 11, fill: '#5b625e' }} tickLine={false} axisLine={{ stroke: 'rgba(0, 0, 0, 0.15)' }} interval={0} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#5b625e' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => (spec.percent ? `${Math.round(v * 100)}%` : String(v))} domain={spec.percent ? [0, 1] : undefined} />
              <Tooltip
                cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }}
                contentStyle={{ borderRadius: 10, border: 0, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', fontSize: 13 }}
                formatter={(v) => (spec.percent && typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : String(v))}
              />
              <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 13 }} formatter={(value: string) => <span style={{ color: 'var(--uc-text)' }}>{value}</span>} />
              {spec.series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.colour} radius={[3, 3, 0, 0]} maxBarSize={28} animationDuration={700} animationEasing="ease-out" />)}
            </BarChart>
            )}
          </ResponsiveContainer>
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>The table below holds the same numbers.</Text>
      </Card>
      <Card size="small" title="Data">
        <div className="uc-grid-scroll">
        <Table
          size="small"
          pagination={rows.length > 15 ? { pageSize: 15, showSizeChanger: false } : false}
          rowKey={(row) => JSON.stringify(row)}
          dataSource={rows}
          columns={report.columns.map((c) => ({ title: c.label, dataIndex: c.key, key: c.key, render: (v: unknown) => formatCell(c.key, v) }))}
          locale={{ emptyText: 'No cases in this period.' }}
          summary={() =>
            rows.length === 0 ? null : (
              <Table.Summary.Row>
                {report.columns.map((c, i) => (
                  <Table.Summary.Cell key={c.key} index={i}>
                    <Text strong>{i === 0 ? 'Total' : c.key in totals ? formatCell(c.key, totals[c.key]) : ''}</Text>
                  </Table.Summary.Cell>
                ))}
              </Table.Summary.Row>
            )
          }
        />
        </div>
      </Card>
    </Space>
  );
};

const Reports: React.FC<{ meta: Meta }> = ({ meta }) => {
  const [kind, setKind] = useState<ReportKind>('bureau');
  const [range, setRange] = useState<[string, string]>([dayjs(meta.today).subtract(90, 'day').format('YYYY-MM-DD'), meta.today]);
  const [grouping, setGrouping] = useState<Grouping>('month');
  const request: ReportRequest = { kind, from: range[0], to: range[1], grouping };
  const report = useReport(request);
  const csv = useCsvDownload();

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Space wrap align="end">
          <label>
            <div><Text type="secondary">Report</Text></div>
            <Select aria-label="Report" style={{ minWidth: 220 }} value={kind} onChange={setKind} options={REPORT_KINDS.map((k) => ({ value: k, label: REPORT_KIND_LABELS[k] }))} />
          </label>
          <div>
            <div><Text type="secondary">Cases received between</Text></div>
            <DatePicker.RangePicker
              allowClear={false}
              format="DD MMM YYYY"
              value={[dayjs(range[0]), dayjs(range[1])]}
              onChange={(v) => v?.[0] && v?.[1] && setRange([v[0].format('YYYY-MM-DD'), v[1].format('YYYY-MM-DD')])}
            />
          </div>
          {kind === 'periodic' && (
            <div>
              <div><Text type="secondary">Group by</Text></div>
              <Segmented<Grouping> value={grouping} onChange={setGrouping} options={[{ value: 'month', label: 'Monthly' }, { value: 'quarter', label: 'Quarterly' }]} />
            </div>
          )}
          <Button icon={<DownloadOutlined />} loading={csv.isPending} onClick={() => csv.mutate(request)}>Download CSV</Button>
        </Space>
        {csv.isError && <Alert type="error" showIcon style={{ marginTop: 12 }} title={`The CSV could not be downloaded: ${apiErrorMessage(csv.error)}`} />}
      </Card>
      <QueryBoundary query={report} loadingTip="Building the report" emptyDescription="No data for this report." isEmpty={() => false}>
        {(data) => <ReportView report={data} />}
      </QueryBoundary>
    </Space>
  );
};

export const ReportsPage: React.FC = () => {
  const meta = useMeta();
  return (
    <div className="uc-page">
      <PageHeader title="Reports" subtitle="Statutory and analytical reports for the cases in your scope. The CSV is generated by the server." />
      <QueryBoundary query={meta} loadingTip="Loading">{(m) => <Reports meta={m} />}</QueryBoundary>
    </div>
  );
};

export default ReportsPage;
