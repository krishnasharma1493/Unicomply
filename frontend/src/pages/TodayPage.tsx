import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../components/layout/PageHeader';
import { useCaseList } from '../features/cases/useCaseList';
import { useMeta } from '../features/meta/useMeta';
import { usePendingReviews } from '../features/reviews/useReviews';
import { Queue } from '../features/today/Queue';
import { AlertRows, CaseRows, OverlapRows, ReviewRows } from '../features/today/rows';
import { QUEUE_SIZE, QUEUES, seeAll, todayPlan, useOpenOverlaps, useUnreadAlerts } from '../features/today/useToday';
import { REGION_LABELS } from '../lib/api/enums';
import type { Meta, UserMe } from '../lib/api/types';
import { formatDate } from '../lib/format';
import '../styles/today.css';

const Decisions: React.FC<{ today?: string }> = ({ today }) => {
  const q = useOpenOverlaps();
  return (
    <Queue
      title="Needs your decision"
      count={q.total}
      seeAll={{ to: '/overlaps', label: 'See all open overlaps' }}
      isLoading={q.isLoading}
      isError={q.isError}
      error={q.error}
      onRetry={q.refetch}
      isEmpty={q.groups.length === 0}
      emptyText="No overlap is waiting for a decision."
      loadingLabel="Loading open overlaps"
    >
      <OverlapRows groups={q.groups.slice(0, QUEUE_SIZE)} today={today} />
    </Queue>
  );
};

const PastSla: React.FC = () => {
  const q = useCaseList(QUEUES.pastSla);
  const from = seeAll(QUEUES.pastSla);
  return (
    <Queue
      title="Past SLA"
      count={q.data?.pagination.total}
      seeAll={{ to: from, label: 'See all cases past SLA' }}
      isLoading={q.isLoading}
      isError={q.isError}
      error={q.error}
      onRetry={() => void q.refetch()}
      isEmpty={(q.data?.data.length ?? 0) === 0}
      emptyText="Nothing past SLA in your scope."
      loadingLabel="Loading cases past SLA"
      className="uc-queue--breach"
    >
      <CaseRows cases={q.data?.data ?? []} from={from} />
    </Queue>
  );
};

const DueSoon: React.FC = () => {
  const q = useCaseList(QUEUES.dueSoon);
  const from = seeAll(QUEUES.dueSoon);
  const total = q.data?.pagination.total ?? 0;
  return (
    <Queue
      title="Due soon"
      count={total}
      countNote="open within SLA"
      seeAll={{ to: from, label: 'See all open cases within SLA, soonest due first' }}
      isLoading={q.isLoading}
      isError={q.isError}
      error={q.error}
      onRetry={() => void q.refetch()}
      isEmpty={(q.data?.data.length ?? 0) === 0}
      emptyText="No open case is waiting within SLA."
      loadingLabel="Loading cases due soon"
    >
      <CaseRows cases={q.data?.data ?? []} from={from} />
    </Queue>
  );
};

/** Open cases with no officer, read from the 50 due soonest (the API has no "unassigned" filter). */
const Unassigned: React.FC = () => {
  const q = useCaseList(QUEUES.open);
  const from = seeAll(QUEUES.open);
  const page = q.data;
  const rows = (page?.data ?? []).filter((c) => c.assigned_officer_id === null);
  const partial = page !== undefined && page.pagination.total > page.data.length;
  return (
    <Queue
      title="Unassigned"
      count={rows.length}
      countNote={partial ? `in the ${page.data.length} due soonest` : undefined}
      seeAll={{ to: from, label: 'See all open cases, soonest due first' }}
      isLoading={q.isLoading}
      isError={q.isError}
      error={q.error}
      onRetry={() => void q.refetch()}
      isEmpty={rows.length === 0}
      emptyText={partial ? 'Every one of the open cases due soonest has an officer.' : 'Every open case in your region has an officer.'}
      loadingLabel="Loading unassigned cases"
    >
      <CaseRows cases={rows.slice(0, QUEUE_SIZE)} from={from} />
    </Queue>
  );
};

const Reviews: React.FC = () => {
  const q = usePendingReviews();
  const items = q.data?.data ?? [];
  return (
    <Queue
      title="Match reviews"
      count={q.data?.pagination.total}
      seeAll={{ to: '/reviews', label: 'Open the match review queue' }}
      isLoading={q.isLoading}
      isError={q.isError}
      error={q.error}
      onRetry={() => void q.refetch()}
      isEmpty={items.length === 0}
      emptyText="No complaint is waiting to be matched to the registry."
      loadingLabel="Loading pending match reviews"
    >
      <ReviewRows reviews={items.slice(0, 5)} />
    </Queue>
  );
};

const RecentCases: React.FC = () => {
  const q = useCaseList({ ...QUEUES.recent, limit: 6 });
  return (
    <Queue
      title="Your recent cases"
      seeAll={{ to: '/cases', label: 'See all the cases you registered' }}
      isLoading={q.isLoading}
      isError={q.isError}
      error={q.error}
      onRetry={() => void q.refetch()}
      isEmpty={(q.data?.data.length ?? 0) === 0}
      emptyText="You have not registered a case yet."
      loadingLabel="Loading your recent cases"
    >
      <CaseRows cases={q.data?.data ?? []} from="/cases" />
    </Queue>
  );
};

const Alerts: React.FC = () => {
  const q = useUnreadAlerts();
  return (
    <Queue
      title="Unread alerts"
      count={q.data?.pagination.total}
      seeAll={{ to: '/alerts', label: 'See all alerts' }}
      isLoading={q.isLoading}
      isError={q.isError}
      error={q.error}
      onRetry={() => void q.refetch()}
      isEmpty={(q.data?.data.length ?? 0) === 0}
      emptyText="No unread alerts."
      loadingLabel="Loading unread alerts"
    >
      <AlertRows alerts={q.data?.data ?? []} />
    </Queue>
  );
};

const scopeLine = (user: UserMe, meta?: Meta) => {
  const bureau = meta?.bureaus.find((b) => b.id === user.bureau_id);
  switch (user.role) {
    case 'senior_mgmt':
      return 'Every bureau and regional office, most urgent first.';
    case 'bureau_head':
      return bureau ? `${bureau.code} · ${bureau.name}, most urgent first.` : 'Your bureau, most urgent first.';
    case 'ro_officer':
      return user.region ? `${REGION_LABELS[user.region]} region, most urgent first.` : 'Your region, most urgent first.';
    case 'intake_operator':
      return 'Register complaints and match them to the registry.';
  }
};

/**
 * Today: the work waiting for this officer, from the endpoints the app already has. Decisions and the
 * SLA queue on the left, what to read and match on the right. Each part loads and fails on its own.
 */
export const TodayPage: React.FC = () => {
  const { user } = useAuth();
  const meta = useMeta();
  const navigate = useNavigate();
  if (!user) return null;
  const plan = todayPlan(user.role);
  const today = meta.data?.today;

  const left: React.ReactNode[] = [];
  const right: React.ReactNode[] = [];
  if (plan.decisions) left.push(<Decisions key="decisions" today={today} />);
  if (plan.sla) left.push(<PastSla key="past" />, <DueSoon key="due" />);
  if (plan.unassigned) left.push(<Unassigned key="unassigned" />);
  if (plan.reviews) (plan.recent ? left : right).push(<Reviews key="reviews" />);
  if (plan.recent) left.push(<RecentCases key="recent" />);
  right.push(<Alerts key="alerts" />);

  return (
    <div className="uc-page uc-today">
      <PageHeader
        title="Today"
        titleExtra={today ? <time className="uc-today-date" dateTime={today}>{formatDate(today)}</time> : undefined}
        subtitle={scopeLine(user, meta.data)}
        actions={
          plan.register ? (
            <Button type="primary" size="large" icon={<PlusOutlined aria-hidden="true" />} onClick={() => navigate('/cases/new')}>
              Register a case
            </Button>
          ) : undefined
        }
      />
      <div className="uc-today-grid">
        <div className="uc-today-col">{left}</div>
        <div className="uc-today-col">{right}</div>
      </div>
    </div>
  );
};

export default TodayPage;
