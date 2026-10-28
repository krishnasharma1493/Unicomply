import React from 'react';
import { Card, Typography, Tag, Space } from 'antd';
import { useParams, useLocation } from 'react-router-dom';

const { Title, Paragraph, Text } = Typography;

export interface PlaceholderPageProps {
  title: string;
  description: string;
  allowedRoles?: string;
  psFeature?: string;
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({
  title,
  description,
  allowedRoles,
  psFeature,
}) => {
  const params = useParams();
  const location = useLocation();

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Card style={{ borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Title level={2} style={{ marginBottom: '8px' }}>
              {title}
            </Title>
            <Space wrap>
              <Tag color="blue">{location.pathname}</Tag>
              {allowedRoles && <Tag color="geekblue">Roles: {allowedRoles}</Tag>}
              {psFeature && <Tag color="purple">PS Feature: {psFeature}</Tag>}
            </Space>
          </div>

          <Paragraph type="secondary" style={{ fontSize: '15px' }}>
            {description}
          </Paragraph>

          {Object.keys(params).length > 0 && (
            <div style={{ background: 'var(--uc-fill)', padding: '12px 16px', borderRadius: '6px' }}>
              <Text strong>Route Parameters: </Text>
              <Text code>{JSON.stringify(params)}</Text>
            </div>
          )}

          <div
            style={{
              padding: '16px',
              border: '1px dashed #cbd5e1',
              borderRadius: '6px',
              backgroundColor: 'var(--uc-canvas)',
            }}
          >
            <Text type="secondary">
              ⚡ Scaffold Placeholder — feature implementation will be integrated in milestone issues.
            </Text>
          </div>
        </Space>
      </Card>
    </div>
  );
};
