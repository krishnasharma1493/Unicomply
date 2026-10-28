import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Popover, Space, Tag, Typography } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { ALERT_SEVERITY_LABELS } from '../../lib/api/enums';
import { apiErrorMessage, formatDateTime } from '../../lib/format';
import { useBell, useMarkRead } from './useAlerts';
import { alertTarget, SEVERITY_COLOUR } from './AlertItem';

const { Text } = Typography;

/** The shell's bell (PRD §7): unread count, the latest five, a link to the page. Polls every 30 s. */
export const AlertBell: React.FC = () => {
  const [open, setOpen] = useState(false);
  const { latest, unreadCount } = useBell();
  const markRead = useMarkRead();
  const alerts = latest.data?.data ?? [];

  const content = (
    <div style={{ width: 340 }}>
      {latest.isError ? (
        <Text type="danger">{apiErrorMessage(latest.error)}</Text>
      ) : latest.isLoading ? (
        <Text type="secondary">Loading alerts…</Text>
      ) : alerts.length === 0 ? (
        <Text type="secondary">No alerts.</Text>
      ) : (
        <Space orientation="vertical" size={10} style={{ width: '100%' }}>
          {alerts.map((a) => (
            <div key={a.id} style={{ borderLeft: `3px solid ${a.is_read ? '#e2e8f0' : '#1e3a8a'}`, paddingLeft: 8 }}>
              <Space size={6} wrap>
                <Tag color={SEVERITY_COLOUR[a.severity]} style={{ margin: 0 }}>{ALERT_SEVERITY_LABELS[a.severity]}</Tag>
                <Text strong={!a.is_read}>{a.title}</Text>
              </Space>
              <div><Text type="secondary" style={{ fontSize: 12 }}>{a.institution_name ?? 'General'} · {formatDateTime(a.created_at)}</Text></div>
              <Space size={12}>
                {alertTarget(a) && <Link to={alertTarget(a)!.to} onClick={() => setOpen(false)}>{alertTarget(a)!.label}</Link>}
                {!a.is_read && <Button type="link" size="small" style={{ padding: 0 }} onClick={() => markRead.mutate(a.id)}>Mark read</Button>}
              </Space>
            </div>
          ))}
        </Space>
      )}
      <div style={{ marginTop: 12, textAlign: 'right' }}>
        <Link to="/alerts" onClick={() => setOpen(false)}>View all alerts</Link>
      </div>
    </div>
  );

  return (
    <Popover trigger="click" placement="bottomRight" open={open} onOpenChange={setOpen} content={content} title="Alerts">
      <Badge count={unreadCount} overflowCount={99} offset={[-2, 6]} size="small">
        <Button
          type="text"
          shape="circle"
          icon={<BellOutlined style={{ fontSize: 16, color: '#475569' }} />}
          aria-label={unreadCount > 0 ? `Alerts, ${unreadCount} unread` : 'Alerts, none unread'}
        />
      </Badge>
    </Popover>
  );
};
