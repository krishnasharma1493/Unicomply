import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Space, Tag, Typography } from 'antd';
import { PageHeader } from '../components/layout/PageHeader';
import { QueryBoundary } from '../components/states';
import { alertTarget, SeverityLabel } from '../features/alerts/AlertItem';
import { groupAlerts } from '../features/alerts/grouping';
import { useAlertList, useMarkAllRead, useMarkRead } from '../features/alerts/useAlerts';
import { ALERT_SEVERITY_LABELS, ALERT_TYPE_LABELS } from '../lib/api/enums';
import { apiErrorMessage, formatDate, formatDateTime } from '../lib/format';

const { Text } = Typography;

export const AlertsPage: React.FC = () => {
  const list = useAlertList();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const unread = list.data?.data.filter((a) => !a.is_read).length ?? 0;
  const hidden = list.data ? list.data.pagination.total - list.data.data.length : 0;

  return (
    <div className="uc-page uc-page--narrow">
      <PageHeader
        title="Alerts"
        subtitle={`Grouped by institution and day, most serious first.${unread > 0 ? ` ${unread} unread.` : ''}`}
        actions={<Button disabled={unread === 0} loading={markAll.isPending} onClick={() => markAll.mutate()}>Mark all as read</Button>}
      />
      {(markRead.isError || markAll.isError) && (
        <Text type="danger" style={{ display: 'block', marginTop: 8 }}>{apiErrorMessage(markRead.error ?? markAll.error)}</Text>
      )}
      {hidden > 0 && (
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          Showing the newest {list.data?.data.length} of {list.data?.pagination.total} alerts. Mark these as read to bring the older ones up.
        </Text>
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
                      <SeverityLabel severity={g.severity} label={ALERT_SEVERITY_LABELS[g.severity]} />
                      <span>{g.institutionName ?? 'General'}</span>
                    </Space>
                  }
                  extra={<Text type="secondary">{formatDate(g.day)}</Text>}
                >
                  <ul className="uc-rows">
                    {g.alerts.map((a) => {
                      const target = alertTarget(a);
                      return (
                        <li key={a.id} className={a.is_read ? 'uc-alert' : 'uc-alert uc-alert--unread'}>
                          <div className="uc-title-line" style={{ gap: 8 }}>
                            <SeverityLabel severity={a.severity} label={ALERT_SEVERITY_LABELS[a.severity]} />
                            <Text strong={!a.is_read}>{a.title}</Text>
                            {!a.is_read && <Tag color="blue" style={{ margin: 0 }}>Unread</Tag>}
                          </div>
                          <div style={{ maxWidth: '72ch' }}>{a.body}</div>
                          <Space size={12} wrap>
                            <Text type="secondary" style={{ fontSize: 12 }}>{ALERT_TYPE_LABELS[a.type]} · {formatDateTime(a.created_at)}</Text>
                            {target && <Link to={target.to}>{target.label}</Link>}
                            {!a.is_read && (
                              <Button type="link" size="small" style={{ padding: 0 }} loading={markRead.isPending && markRead.variables === a.id} onClick={() => markRead.mutate(a.id)}>
                                Mark as read
                              </Button>
                            )}
                          </Space>
                        </li>
                      );
                    })}
                  </ul>
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
