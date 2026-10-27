import React, { useState } from 'react';
import { Card, Typography, Space, Row, Col, Button, message } from 'antd';
import {
  StatusChip,
  BureauChip,
  TierChip,
  SlaBadge,
  KpiCard,
} from '../../components/ui';
import {
  LoadingState,
  EmptyState,
  ErrorState,
} from '../../components/states';
import {
  formatDate,
  formatDateTime,
  ageingBucket,
} from '../../lib/format';
import { CASE_STATUSES } from '../../lib/api/enums';

const { Title, Text, Paragraph } = Typography;

export const PrimitivesDevPage: React.FC = () => {
  const [clickedCount, setClickedCount] = useState(0);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={2}>UI Primitives Gallery</Title>
          <Paragraph type="secondary">
            Dev-only catalog of small shared components and date helpers for Unicomply (PRD §7).
          </Paragraph>
        </div>

        {/* 1. StatusChips */}
        <Card title="StatusChip (All 7 Case Statuses)">
          <Space wrap size="middle">
            {CASE_STATUSES.map((status) => (
              <StatusChip key={status} status={status} />
            ))}
          </Space>
        </Card>

        {/* 2. BureauChips */}
        <Card title="BureauChip (Bureaus, Cells, and Regional Offices)">
          <Space orientation="vertical" size="middle">
            <div>
              <Text strong>Code Only: </Text>
              <Space wrap size="small" style={{ marginLeft: '8px' }}>
                <BureauChip code="PGRC" kind="bureau" />
                <BureauChip code="RB" kind="bureau" />
                <BureauChip code="AB" kind="bureau" />
                <BureauChip code="ACAD" kind="bureau" />
                <BureauChip code="RO-CRO" kind="regional_office" />
                <BureauChip code="RO-WRO" kind="regional_office" />
              </Space>
            </div>
            <div>
              <Text strong>With Kind Label: </Text>
              <Space wrap size="small" style={{ marginLeft: '8px' }}>
                <BureauChip code="PGRC" kind="bureau" showKind />
                <BureauChip code="RO-CRO" kind="regional_office" showKind />
              </Space>
            </div>
          </Space>
        </Card>

        {/* 3. TierChips */}
        <Card title="TierChip (Overlap Severity Tiers)">
          <Space wrap size="large">
            <div>
              <Text strong style={{ marginRight: '8px' }}>Probable (Red):</Text>
              <TierChip tier="probable" />
            </div>
            <div>
              <Text strong style={{ marginRight: '8px' }}>Possible (Amber):</Text>
              <TierChip tier="possible" />
            </div>
          </Space>
        </Card>

        {/* 4. SlaBadge */}
        <Card title="SlaBadge (Boundary Thresholds)">
          <Space orientation="vertical" size="middle">
            <div>
              <Text strong>21-day Standard SLA: </Text>
              <Space wrap size="small" style={{ marginLeft: '8px' }}>
                <span>Day 16 (Neutral): <SlaBadge ageDays={16} totalSlaDays={21} /></span>
                <span>Day 17 (Warning): <SlaBadge ageDays={17} totalSlaDays={21} /></span>
                <span>Day 21 (Due date): <SlaBadge ageDays={21} totalSlaDays={21} /></span>
                <span>Day 22 (Breached): <SlaBadge ageDays={22} totalSlaDays={21} /></span>
                <span>Day 24 (Breached): <SlaBadge ageDays={24} totalSlaDays={21} /></span>
                <span>Disposed (Closed): <SlaBadge status="disposed" /></span>
              </Space>
            </div>
            <div>
              <Text strong>Custom 15-day SLA: </Text>
              <Space wrap size="small" style={{ marginLeft: '8px' }}>
                <span>Day 10: <SlaBadge ageDays={10} totalSlaDays={15} /></span>
                <span>Day 11 (Warning): <SlaBadge ageDays={11} totalSlaDays={15} /></span>
                <span>Day 15 (Due date): <SlaBadge ageDays={15} totalSlaDays={15} /></span>
                <span>Day 16 (Breached): <SlaBadge ageDays={16} totalSlaDays={15} /></span>
              </Space>
            </div>
          </Space>
        </Card>

        {/* 5. KpiCards */}
        <Card title="KpiCard">
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <KpiCard
                label="Total Cases"
                value={142}
                delta={{ value: '12%', isPositive: true, label: 'vs last month' }}
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <KpiCard
                label="Beyond SLA"
                value={8}
                delta={{ value: '2', isPositive: false, label: 'new breaches' }}
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <KpiCard
                label="Clickable KPI"
                value={`Clicked ${clickedCount}`}
                onClick={() => {
                  setClickedCount((c) => c + 1);
                  message.info('Clicked KPI card!');
                }}
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <KpiCard label="Loading KPI" value={0} loading />
            </Col>
          </Row>
        </Card>

        {/* 6. Formatting Utilities */}
        <Card title="Date & Formatting Helpers (src/lib/format.ts)">
          <Space orientation="vertical" size="small">
            <Text>
              <Text strong>Calendar Date (YYYY-MM-DD): </Text>
              <code>formatDate('2026-11-20')</code> → <strong>{formatDate('2026-11-20')}</strong>
            </Text>
            <Text>
              <Text strong>UTC Timestamp to IST: </Text>
              <code>formatDateTime('2026-11-20T12:00:00Z')</code> →{' '}
              <strong>{formatDateTime('2026-11-20T12:00:00Z')}</strong>
            </Text>
            <Text>
              <Text strong>Ageing Bucket (day 5): </Text>
              <code>ageingBucket(5)</code> → <strong>{ageingBucket(5)}</strong>
            </Text>
            <Text>
              <Text strong>Ageing Bucket (day 18): </Text>
              <code>ageingBucket(18)</code> → <strong>{ageingBucket(18)}</strong>
            </Text>
            <Text>
              <Text strong>Ageing Bucket (day 50): </Text>
              <code>ageingBucket(50)</code> → <strong>{ageingBucket(50)}</strong>
            </Text>
          </Space>
        </Card>

        {/* 7. Page States */}
        <Card title="Page States (Loading, Empty, Error)">
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Card title="LoadingState" size="small">
                <LoadingState tip="Loading cases..." minHeight="120px" />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card title="EmptyState" size="small">
                <EmptyState
                  title="No cases"
                  description="No complaint cases match your filters."
                  action={<Button size="small">Reset filters</Button>}
                  minHeight="120px"
                />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card title="ErrorState" size="small">
                <ErrorState
                  message="Case not found or permission denied"
                  onRetry={() => message.info('Retrying...')}
                />
              </Card>
            </Col>
          </Row>
        </Card>
      </Space>
    </div>
  );
};

export default PrimitivesDevPage;
