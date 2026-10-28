import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Space, Tag, Typography } from 'antd';
import { QueryBoundary } from '../components/states';
import { alertTarget, SEVERITY_COLOUR } from '../features/alerts/AlertItem';
import { groupAlerts } from '../features/alerts/grouping';
import { useAlertList, useMarkAllRead, useMarkRead } from '../features/alerts/useAlerts';
import { ALERT_SEVERITY_LABELS, ALERT_TYPE_LABELS } from '../lib/api/enums';
import { apiErrorMessage, formatDate, formatDateTime } from '../lib/format';

const { Title, Text } = Typography;

export const AlertsPage: React.FC = () => {
  const list = useAlertList();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const unread = list.data?.data.filter((a) => !a.is_read).length ?? 0;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start" wrap>
        <div>
          <Title level={2} style={{ marginBottom: 0 }}>Alerts</Title>
          <Text type="secondary">Grouped by institution and day, most serious first.{unread > 0 ? ` ${unread} unread.` : ''}</Text>
        </div>
        <Button disabled={unread === 0} loading={markAll.isPending} onClick={() => markAll.mutate()}>Mark all as read</Button>
      </Space>
      {(markRead.isError || markAll.isError) && (
        <Text type="danger" style={{ display: 'block', marginTop: 8 }}>{apiErrorMessage(markRead.error ?? markAll.error)}</Text>
      )}
      <div style={{ marginTop: 16 }}>
        <QueryBoundary query={list} loadingTip="Loading alerts" isEmpty={(p) => p.data.length === 0} emptyTitle="No alerts" emptyDescription="Nothing needs your attention.">
          {(page) => (
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              {groupAlerts(page.data).map((g) => (
                <Card
                  key={g.key}
                  size="small"
                  aria-label={`Alerts for ${g.institutionName ?? 'general'} on ${g.day}`}
                  title={
                    <Space wrap>
                      <Tag color={SEVERITY_COLOUR[g.severity]} style={{ margin: 0 }}>{ALERT_SEVERITY_LABELS[g.severity]}</Tag>
                      <span>{g.institutionName ?? 'General'}</span>
                    </Space>
                  }
                  extra={<Text type="secondary">{formatDate(g.day)}</Text>}
                >
                  <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                    {g.alerts.map((a) => {
                      const target = alertTarget(a);
                      return (
                        <div key={a.id} style={{ borderLeft: `3px solid ${a.is_read ? '#e2e8f0' : '#1e3a8a'}`, paddingLeft: 10 }}>
                          <Space wrap size={8}>
                            <Tag color={SEVERITY_COLOUR[a.severity]} style={{ margin: 0 }}>{ALERT_SEVERITY_LABELS[a.severity]}</Tag>
                            <Text strong={!a.is_read}>{a.title}</Text>
                            {!a.is_read && <Tag color="blue" style={{ margin: 0 }}>Unread</Tag>}
                          </Space>
                          <div>{a.body}</div>
                          <Space size={12} wrap>
                            <Text type="secondary" style={{ fontSize: 12 }}>{ALERT_TYPE_LABELS[a.type]} · {formatDateTime(a.created_at)}</Text>
                            {target && <Link to={target.to}>{target.label}</Link>}
                            {!a.is_read && (
                              <Button type="link" size="small" style={{ padding: 0 }} loading={markRead.isPending && markRead.variables === a.id} onClick={() => markRead.mutate(a.id)}>
                                Mark as read
                              </Button>
                            )}
                          </Space>
                        </div>
                      );
                    })}
                  </Space>
                </Card>
              ))}
            </Space>
          )}
        </QueryBoundary>
      </div>
    </div>
  );
};

export default AlertsPage;
