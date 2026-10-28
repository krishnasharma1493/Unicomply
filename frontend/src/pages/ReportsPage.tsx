import React, { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert, Button, Card, DatePicker, Descriptions, Segmented, Select, Space, Table, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { QueryBoundary } from '../components/states';
import { chartSpec, formatCell } from '../features/reports/chartSpec';
import { useCsvDownload, useReport, type Grouping, type ReportRequest } from '../features/reports/useReport';
import { useMeta } from '../features/meta/useMeta';
import { REPORT_KINDS, REPORT_KIND_LABELS, type ReportKind } from '../lib/api/enums';
import type { AnyReport, Meta } from '../lib/api/types';
import { apiErrorMessage, formatDate, formatDateTime } from '../lib/format';

const { Title, Text } = Typography;

const ReportView: React.FC<{ report: AnyReport }> = ({ report }) => {
  const spec = chartSpec(report);
  const rows = report.rows as unknown as Record<string, unknown>[];
  const totals = report.totals as unknown as Record<string, unknown>;
  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Text type="secondary">
        {REPORT_KIND_LABELS[report.kind]}, cases received {formatDate(report.from)} to {formatDate(report.to)}. Generated {formatDateTime(report.generated_at)}.
      </Text>
      <Card size="small" title="Chart">
        <div style={{ width: '100%', height: 280 }} aria-hidden="true">
          <ResponsiveContainer>
            <BarChart data={spec.data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey={spec.categoryKey} tick={{ fontSize: 12 }} interval={0} />
              <YAxis allowDecimals={false} tickFormatter={(v: number) => (spec.percent ? `${Math.round(v * 100)}%` : String(v))} domain={spec.percent ? [0, 1] : undefined} />
              <Tooltip formatter={(v) => (spec.percent && typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : String(v))} />
              <Legend />
              {spec.series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.colour} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>The table below holds the same numbers.</Text>
      </Card>
      <Card size="small" title="Data">
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
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Title level={2} style={{ marginBottom: 0 }}>Reports</Title>
      <Descriptions size="small" style={{ marginBottom: 8 }}>
        <Descriptions.Item><Text type="secondary">Statutory and analytical reports for the cases in your scope. The CSV is generated by the server.</Text></Descriptions.Item>
      </Descriptions>
      <QueryBoundary query={meta} loadingTip="Loading">{(m) => <Reports meta={m} />}</QueryBoundary>
    </div>
  );
};

export default ReportsPage;
