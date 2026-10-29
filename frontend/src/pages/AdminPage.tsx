import React, { useState } from 'react';
import { Card, Button, Descriptions, Result, Modal, message } from 'antd';
import { ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { client } from '../lib/api/client';
import type { DemoResetResult, Envelope } from '../lib/api/types';
import { apiErrorMessage } from '../lib/format';
import { PageHeader, Section } from '../components/layout/PageHeader';

export const AdminPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [resetting, setResetting] = useState(false);

  // Non-admin guard: restricted access
  if (!user?.is_admin) {
    return (
      <div className="uc-page uc-page--narrow">
        <Card style={{ textAlign: 'center' }}>
          <Result
            status="403"
            title="Access Restricted"
            subTitle="System Administration controls and demo operations are restricted to administrators (Senior Management)."
            extra={
              <span className="uc-meta">
                Current role: {user?.role ?? 'Unauthenticated'} (not an administrator)
              </span>
            }
          />
        </Card>
      </div>
    );
  }

  const handleResetConfirm = () => {
    Modal.confirm({
      title: 'Reset demo environment to baseline fixtures?',
      icon: <ExclamationCircleOutlined style={{ color: 'var(--uc-red)' }} />,
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
          const msg = apiErrorMessage(err);
          message.error(`Failed to reset demo environment: ${msg}`);
        } finally {
          setResetting(false);
        }
      },
    });
  };

  return (
    <div className="uc-page uc-page--narrow">
      <PageHeader
        title="System Administration"
        subtitle={`Demo environment operations and the parameters this deployment runs with. Signed in as ${user.email}.`}
      />

      <div className="uc-stack">
        <Section title="Reset the demo database" aria-label="Demo database reset">
          <div className="uc-admin-row">
            <div style={{ maxWidth: '64ch' }}>
              <p style={{ margin: 0 }}>
                Restore all cases, institutions, match review items and overlap groups to the baseline seed. Any case
                registered or workflow changed during this demonstration is reverted.
              </p>
              <p className="uc-meta" style={{ margin: '6px 0 0' }}>
                Use before a new demonstration run or after end-to-end testing. Runs <code>POST /demo/reset</code>.
              </p>
            </div>
            <Button danger icon={<ReloadOutlined />} loading={resetting} onClick={handleResetConfirm}>
              Reset Demo Database
            </Button>
          </div>
        </Section>

        <Section title="Operational parameters">
          <Descriptions className="uc-fields" layout="vertical" colon={false} size="small" column={{ xs: 1, md: 3 }}>
            <Descriptions.Item label="Default grievance SLA">21 calendar days</Descriptions.Item>
            <Descriptions.Item label="SLA warning">From day 17</Descriptions.Item>
            <Descriptions.Item label="Configuration">Read-only: set by backend environment variables</Descriptions.Item>
          </Descriptions>
        </Section>
      </div>
    </div>
  );
};

export default AdminPage;
