import React from 'react';
import { Card, Typography, Space, Tag } from 'antd';
import { env } from '../lib/env';

const { Title, Paragraph, Text } = Typography;

export const LoginPage: React.FC = () => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#f1f5f9',
        padding: '24px',
      }}
    >
      <Card style={{ width: '100%', maxWidth: '480px', borderRadius: '8px' }}>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Title level={3} style={{ marginBottom: '4px' }}>
              Unicomply Portal
            </Title>
            <Paragraph type="secondary">
              AICTE Integrated Complaint Monitoring Dashboard
            </Paragraph>
          </div>

          <div
            style={{
              padding: '16px',
              backgroundColor: '#e6f4ff',
              border: '1px solid #91caff',
              borderRadius: '6px',
            }}
          >
            <Text strong>Login Page Placeholder (/login)</Text>
            <Paragraph style={{ margin: '8px 0 0 0', fontSize: '13px' }} type="secondary">
              5-persona one-click cards (Senior officer, PGRC head, RB head, Central RO, Intake)
              and demo login fallback will be implemented in Issue #11.
            </Paragraph>
          </div>

          {env.VITE_DEMO_MODE && (
            <Space wrap>
              <Tag color="cyan">Demo Mode Active</Tag>
              {env.VITE_DEMO_EMAIL && <Tag color="blue">Default: {env.VITE_DEMO_EMAIL}</Tag>}
            </Space>
          )}
        </Space>
      </Card>
    </div>
  );
};
