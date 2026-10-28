import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, Col, Descriptions, Row, Space, Statistic, Tag, Timeline, Typography } from 'antd';
import { LinkedCaseCard, OverlapBanner, WhyFlagged } from '../components/signature';
import { QueryBoundary } from '../components/states';
import { BureauChip, StatusChip } from '../components/ui';
import { useMeta } from '../features/meta/useMeta';
import { asCard } from '../features/overlaps/detail/normalise';
import { useInstitution } from '../features/institutions/useInstitutions';
import { INST_TYPE_LABELS, REGION_LABELS } from '../lib/api/enums';
import type { Institution360, InstitutionLite, LinkedCaseCard as CardData, Meta } from '../lib/api/types';
import { formatDate } from '../lib/format';

const { Title, Text } = Typography;

const Links: React.FC<{ rows: InstitutionLite[]; empty: string }> = ({ rows, empty }) =>
  rows.length === 0 ? (
    <Text type="secondary">{empty}</Text>
  ) : (
    <ul style={{ margin: 0, paddingLeft: 20 }}>
      {rows.map((r) => (
        <li key={r.permanent_id}>
          <Link to={`/institutions/${r.permanent_id}`}>{r.name}</Link> <Text type="secondary">({r.district})</Text>
        </li>
      ))}
    </ul>
  );

const View: React.FC<{ data: Institution360; meta: Meta }> = ({ data, meta }) => {
  const { institution: inst, trust, parent, departments, trust_institutions: siblings, case_counts: counts } = data;
  const columns = data.cases_by_bureau.map((col) => ({ ...col, cards: col.cases.map((c) => asCard(c, meta)) }));
  const timeline: CardData[] = columns.flatMap((c) => c.cards).sort((a, b) => (a.received_at < b.received_at ? 1 : a.received_at > b.received_at ? -1 : b.case_id - a.case_id));

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space orientation="vertical" size="small" style={{ width: '100%' }}>
          <Space wrap align="center">
            <Title level={2} style={{ margin: 0 }}>{inst.name}</Title>
            <Tag color="blue">{inst.permanent_id}</Tag>
          </Space>
          <Descriptions size="small" column={{ xs: 1, md: 2 }}>
            <Descriptions.Item label="Type">{INST_TYPE_LABELS[inst.inst_type]}</Descriptions.Item>
            <Descriptions.Item label="Region">{REGION_LABELS[inst.region]}</Descriptions.Item>
            <Descriptions.Item label="Address">{inst.address}, {inst.district}, {inst.state} {inst.pin}</Descriptions.Item>
            <Descriptions.Item label="Established">{inst.year_est ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Trust">{trust ? trust.name : '—'}</Descriptions.Item>
            <Descriptions.Item label="Part of">{parent ? <Link to={`/institutions/${parent.permanent_id}`}>{parent.name}</Link> : '—'}</Descriptions.Item>
          </Descriptions>
          <Row gutter={16}>
            <Col xs={12} md={6}><Statistic title="Cases" value={counts.total} /></Col>
            <Col xs={12} md={6}><Statistic title="Open" value={counts.open} /></Col>
            <Col xs={12} md={6}><Statistic title="Disposed" value={counts.disposed} /></Col>
            <Col xs={12} md={6}><Statistic title="Beyond SLA" value={counts.beyond_sla} /></Col>
          </Row>
        </Space>
      </Card>

      {data.overlap_groups.map((g) => (
        <Card key={g.group_id} size="small">
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <OverlapBanner tier={g.tier} groupId={g.group_id} caseCount={g.cases.length} bureauCodes={Array.from(new Set(g.cases.map((c) => c.bureau_code)))} />
            <WhyFlagged reasons={g.reasons} />
          </Space>
        </Card>
      ))}

      <Card title="Cases by bureau">
        {columns.length === 0 ? (
          <Text type="secondary">No case has been reported about this institution.</Text>
        ) : (
          <Row gutter={[16, 16]}>
            {columns.map((col) => (
              <Col key={col.bureau_id} xs={24} md={12} xl={8} role="group" aria-label={`Cases at ${col.bureau_code}`}>
                <Space orientation="vertical" style={{ width: '100%' }}>
                  <Space>
                    <BureauChip code={col.bureau_code} name={col.bureau_name} />
                    <Text type="secondary">{col.cards.length} {col.cards.length === 1 ? 'case' : 'cases'}</Text>
                  </Space>
                  {col.cards.map((c) => <LinkedCaseCard key={c.case_id} card={c} />)}
                </Space>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Complaint timeline" size="small">
            {timeline.length === 0 ? (
              <Text type="secondary">Nothing to show yet.</Text>
            ) : (
              <Timeline
                items={timeline.map((c) => ({
                  key: c.case_id,
                  content: (
                    <Space orientation="vertical" size={0}>
                      <Space wrap>
                        <Text type="secondary">{formatDate(c.received_at)}</Text>
                        {c.in_scope ? <Link to={`/cases/${c.case_id}`}>{c.case_ref}</Link> : <Text>{c.case_ref}</Text>}
                        <BureauChip code={c.bureau_code} />
                        <StatusChip status={c.status} />
                      </Space>
                      <Text>{c.subject}</Text>
                    </Space>
                  ),
                }))}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Card title={trust ? `Other institutions of ${trust.name}` : 'Trust'} size="small">
              <Links rows={siblings} empty={trust ? 'This trust runs no other institution.' : 'Not run by a trust.'} />
            </Card>
            <Card title="Departments" size="small">
              <Links rows={departments} empty="No departments." />
            </Card>
          </Space>
        </Col>
      </Row>
    </Space>
  );
};

export const InstitutionDetailPage: React.FC = () => {
  const { pid = '' } = useParams();
  const detail = useInstitution(pid);
  const meta = useMeta();
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Link to="/institutions">← Institutions</Link>
      <div style={{ marginTop: 12 }}>
        <QueryBoundary query={meta} loadingTip="Loading">
          {(m) => (
            <QueryBoundary query={detail} loadingTip="Loading institution">
              {(d) => <View data={d} meta={m} />}
            </QueryBoundary>
          )}
        </QueryBoundary>
      </div>
    </div>
  );
};

export default InstitutionDetailPage;
