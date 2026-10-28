import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Popover, Typography } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { ALERT_SEVERITY_LABELS } from '../../lib/api/enums';
import { apiErrorMessage, formatDateTime } from '../../lib/format';
import { useBell, useMarkRead } from './useAlerts';
import { alertTarget, SeverityLabel } from './AlertItem';

const { Text } = Typography;

/** The shell's bell (PRD §7): unread count, the latest five, a link to the page. Polls every 30 s. */
export const AlertBell: React.FC = () => {
  const [open, setOpen] = useState(false);
  const { latest, unreadCount } = useBell();
  const markRead = useMarkRead();
  const alerts = latest.data?.data ?? [];

  const content = (
    <div className="uc-bell">
      {latest.isError ? (
        <Text type="danger">{apiErrorMessage(latest.error)}</Text>
      ) : latest.isLoading ? (
        <Text type="secondary">Loading alerts…</Text>
      ) : alerts.length === 0 ? (
        <Text type="secondary">No alerts.</Text>
      ) : (
        <ul className="uc-rows">
          {alerts.map((a) => {
            const target = alertTarget(a);
            return (
              <li key={a.id} className={a.is_read ? 'uc-bell-item' : 'uc-bell-item uc-bell-item--unread'}>
                <div className="uc-bell-title">
                  <SeverityLabel severity={a.severity} label={ALERT_SEVERITY_LABELS[a.severity]} />
                  <Text strong={!a.is_read}>{a.title}</Text>
                </div>
                <div className="uc-meta">{a.institution_name ?? 'General'} · {formatDateTime(a.created_at)}</div>
                <div className="uc-bell-actions">
                  {target && <Link to={target.to} onClick={() => setOpen(false)}>{target.label}</Link>}
                  {!a.is_read && (
                    <Button type="link" size="small" style={{ padding: 0 }} onClick={() => markRead.mutate(a.id)}>
                      Mark read
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="uc-bell-footer">
        <Link to="/alerts" onClick={() => setOpen(false)}>View all alerts</Link>
      </div>
    </div>
  );

  return (
    <Popover trigger="click" placement="bottomRight" open={open} onOpenChange={setOpen} content={content} title="Alerts">
      <Badge count={unreadCount} overflowCount={99} offset={[-4, 6]} size="small">
        <Button
          type="text"
          shape="circle"
          icon={<BellOutlined style={{ fontSize: 16, color: 'var(--uc-text-2)' }} />}
          aria-label={unreadCount > 0 ? `Alerts, ${unreadCount} unread` : 'Alerts, none unread'}
        />
      </Badge>
    </Popover>
  );
};
