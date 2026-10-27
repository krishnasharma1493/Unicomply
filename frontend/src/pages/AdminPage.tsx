import React, { useState } from 'react';
import { Card, Typography, Button, Space, Result, Modal, message, Tag, Alert, Row, Col } from 'antd';
import {
  ExclamationCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
  SafetyCertificateOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { client } from '../lib/api/client';
import type { DemoResetResult, Envelope } from '../lib/api/types';

const { Title, Paragraph, Text } = Typography;

export const AdminPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [resetting, setResetting] = useState(false);

  // Non-admin guard: restricted access
  if (!user?.is_admin) {
    return (
      <div style={{ maxWidth: '640px', margin: '40px auto' }}>
        <Card style={{ borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
          <Result
            status="403"
            title="Access Restricted"
            subTitle="System Administration controls and demo operations are restricted to administrators (Senior Management)."
            extra={
              <Tag color="volcano" style={{ padding: '4px 10px', fontSize: '13px' }}>
                Current Role: {user?.role ?? 'Unauthenticated'} (Non-Admin)
              </Tag>
            }
          />
        </Card>
      </div>
    );
  }

  const handleResetConfirm = () => {
    Modal.confirm({
      title: 'Reset demo environment to baseline fixtures?',
      icon: <ExclamationCircleOutlined style={{ color: '#dc2626' }} />,
      content:
        'This operation will erase all case changes, review actions, and overlap resolutions performed in this session and restore the initial seed fixtures. Are you sure you wish to proceed?',
      okText: 'Yes, Reset Everything',
      okType: 'danger',
      cancelText: 'Cancel',
      focusable: { autoFocusButton: 'cancel' },
      onOk: async () => {
        setResetting(true);
        try {
          const res = await client.post<Envelope<DemoResetResult>>('/demo/reset');
          if (res.data.data.status === 'reset') {
            await queryClient.invalidateQueries();
            message.success('Demo environment reset to baseline fixtures successfully');
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Reset failed';
          message.error(`Failed to reset demo environment: ${msg}`);
        } finally {
          setResetting(false);
        }
      },
    });
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <div>
          <Title level={2} style={{ margin: '0 0 4px 0', color: '#0f172a' }}>
            System Administration
          </Title>
          <Text type="secondary" style={{ fontSize: '13px' }}>
            Portal parameters, audit controls, and demo environment reset operations
          </Text>
        </div>

        <Space orientation="horizontal" size={8}>
          <Tag color="gold" icon={<SafetyCertificateOutlined />}>
            Administrator Access Active
          </Tag>
          <Tag color="blue">{user.email}</Tag>
        </Space>
      </div>

      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        {/* Reset Demo Database Card (Deliberate Warning Style) */}
        <Card
          style={{
            borderRadius: '8px',
            border: '1px solid #fcd34d',
            backgroundColor: '#fffdf5',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          }}
          styles={{ body: { padding: '24px' } }}
        >
          <Row gutter={[20, 20]} align="middle">
            <Col xs={24} md={18}>
              <Space orientation="horizontal" size={14} align="start">
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    backgroundColor: '#fef3c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    border: '1px solid #fde68a',
                  }}
                >
                  <ExclamationCircleOutlined style={{ fontSize: '24px', color: '#d97706' }} />
                </div>

                <div>
                  <Title level={4} style={{ margin: '0 0 6px 0', color: '#92400e' }}>
                    Demo Database Reset (POST /demo/reset)
                  </Title>
                  <Paragraph
                    style={{
                      margin: '0 0 8px 0',
                      fontSize: '13px',
                      color: '#78350f',
                      lineHeight: '1.5',
                    }}
                  >
                    Restore all cases, institutions, match review items, and overlap groups back to
                    the baseline seed fixtures. Any intake records created or workflows modified
                    during this demonstration will be reverted.
                  </Paragraph>
                  <Text type="secondary" style={{ fontSize: '12px', color: '#a16207' }}>
                    Recommended before starting a new demonstration run or after completing end-to-end testing.
                  </Text>
                </div>
              </Space>
            </Col>

            <Col xs={24} md={6} style={{ textAlign: 'right' }}>
              <Button
                type="primary"
                danger
                icon={<ReloadOutlined />}
                size="large"
                loading={resetting}
                onClick={handleResetConfirm}
                style={{
                  fontWeight: 600,
                  boxShadow: '0 2px 4px rgba(220, 38, 38, 0.25)',
                }}
              >
                Reset Demo Database
              </Button>
            </Col>
          </Row>
        </Card>

        {/* System Information & Operational Parameters */}
        <Card
          title={
            <Space orientation="horizontal" size={8}>
              <SettingOutlined style={{ color: '#1e3a8a' }} />
              <span>Operational Environment Parameters</span>
            </Space>
          }
          style={{
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
        >
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={8}>
              <div
                style={{
                  padding: '14px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  Default Grievance SLA
                </Text>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', marginTop: '4px' }}>
                  21 Calendar Days
                </div>
                <Text type="secondary" style={{ fontSize: '11px' }}>
                  Warning triggered at Day 17
                </Text>
              </div>
            </Col>
          </Row>

          <Alert
            title="Read-Only Configuration"
            description="System configuration thresholds are managed via backend environment variables and PRD specifications. Only administrators can initiate database resets."
            type="info"
            showIcon
            icon={<InfoCircleOutlined />}
            style={{ marginTop: '20px', borderRadius: '6px' }}
          />
        </Card>
      </Space>
    </div>
  );
};

export default AdminPage;
