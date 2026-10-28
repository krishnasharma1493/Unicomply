import React from 'react';
import { Col, Row, Space, Typography } from 'antd';
import { useAuth } from '../auth/AuthProvider';
import { AgeingChart, KpiRow, LatestOverlaps, TopInstitutions, WorkloadChart } from '../features/dashboard/widgets';
import { useMeta } from '../features/meta/useMeta';
import { formatDate } from '../lib/format';

const { Title, Text } = Typography;

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const meta = useMeta();
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={2} style={{ marginBottom: 0 }}>Dashboard</Title>
          <Text type="secondary">
            {user ? `${user.name}` : ''}{meta.data ? ` · as of ${formatDate(meta.data.today)}` : ''}. Every number opens the cases behind it.
          </Text>
        </div>
        <KpiRow />
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={12}><WorkloadChart /></Col>
          <Col xs={24} xl={12}><AgeingChart today={meta.data?.today} /></Col>
        </Row>
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={14}><TopInstitutions /></Col>
          <Col xs={24} xl={10}><LatestOverlaps /></Col>
        </Row>
      </Space>
    </div>
  );
};

export default DashboardPage;
