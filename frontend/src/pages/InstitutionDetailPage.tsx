import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, Col, Descriptions, Row, Space, Timeline, Typography } from 'antd';
import { BackLink, PageHeader, Section } from '../components/layout/PageHeader';
import { KpiCard } from '../components/ui';
import { LinkedCaseCard, OverlapBanner, WhyFlagged } from '../components/signature';
import { QueryBoundary } from '../components/states';
import { BureauChip, StatusChip } from '../components/ui';
import { useInstitution } from '../features/institutions/useInstitutions';
import { INST_TYPE_LABELS, REGION_LABELS } from '../lib/api/enums';
import type { Institution360, InstitutionLite, LinkedCaseCard as CardData } from '../lib/api/types';
import { formatDate } from '../lib/format';

const { Text } = Typography;

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

const View: React.FC<{ data: Institution360 }> = ({ data }) => {
  const { institution: inst, trust, parent, departments, trust_institutions: siblings, case_counts: counts } = data;
  const columns = data.cases_by_bureau.map((col) => ({ ...col, cards: col.cases }));
  const timeline: CardData[] = columns.flatMap((c) => c.cards).sort((a, b) => (a.received_at < b.received_at ? 1 : a.received_at > b.received_at ? -1 : b.case_id - a.case_id));

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <PageHeader
        title={inst.name}
        titleExtra={<span className="uc-label uc-num">{inst.permanent_id}</span>}
        subtitle={`${INST_TYPE_LABELS[inst.inst_type]} · ${inst.district}, ${inst.state} · ${REGION_LABELS[inst.region]} region`}
      />
      <div className="uc-kpis" role="group" aria-label="Case counts" style={{ marginTop: -8 }}>
        <KpiCard label="Cases" value={counts.total} />
        <KpiCard label="Open" value={counts.open} />
        <KpiCard label="Disposed" value={counts.disposed} />
        <KpiCard label="Beyond SLA" value={counts.beyond_sla} className={counts.beyond_sla > 0 ? 'uc-kpi--alert' : undefined} />
      </div>
      <Section title="Profile">
        <Descriptions className="uc-fields" layout="vertical" colon={false} size="small" column={{ xs: 1, md: 3 }}>
          <Descriptions.Item label="Type">{INST_TYPE_LABELS[inst.inst_type]}</Descriptions.Item>
          <Descriptions.Item label="Region">{REGION_LABELS[inst.region]}</Descriptions.Item>
          <Descriptions.Item label="Established">{inst.year_est ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Address">{inst.address}, {inst.district}, {inst.state} {inst.pin}</Descriptions.Item>
          <Descriptions.Item label="Trust">{trust ? trust.name : '—'}</Descriptions.Item>
          <Descriptions.Item label="Part of">{parent ? <Link to={`/institutions/${parent.permanent_id}`}>{parent.name}</Link> : '—'}</Descriptions.Item>
        </Descriptions>
      </Section>

      {data.overlap_groups.map((g) => (
        <Section key={g.group_id} aria-label="Overlap">
          <div className="uc-stack" style={{ gap: 14 }}>
            <OverlapBanner tier={g.tier} groupId={g.group_id} caseCount={g.cases.length} bureauCodes={Array.from(new Set(g.cases.map((c) => c.bureau_code)))} />
            <WhyFlagged reasons={g.reasons} />
          </div>
        </Section>
      ))}

      <Card title="Cases by bureau">
        {columns.length === 0 ? (
          <Text type="secondary">No case has been reported about this institution.</Text>
        ) : (
          <Row gutter={[32, 24]}>
            {columns.map((col) => (
              <Col key={col.bureau_id} xs={24} md={12} xl={8} role="group" aria-label={`Cases at ${col.bureau_code}`}>
                <div className="uc-bureau-col">
                  <div className="uc-title-line" style={{ gap: 8, marginBottom: 10 }}>
                    <BureauChip code={col.bureau_code} name={col.bureau_name} />
                    <span className="uc-meta">{col.bureau_name} · {col.cards.length} {col.cards.length === 1 ? 'case' : 'cases'}</span>
                  </div>
                  <ul className="uc-rows">
                    {col.cards.map((c) => <li key={c.case_id}><LinkedCaseCard card={c} /></li>)}
                  </ul>
                </div>
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
  return (
    <div className="uc-page">
      <BackLink to="/institutions" label="Institutions" />
      <div>
        <QueryBoundary query={detail} loadingTip="Loading institution">
          {(d) => <View data={d} />}
        </QueryBoundary>
      </div>
    </div>
  );
};

export default InstitutionDetailPage;
