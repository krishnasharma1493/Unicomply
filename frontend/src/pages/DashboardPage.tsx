import React from 'react';
import { useAuth } from '../auth/AuthProvider';
import { PageHeader } from '../components/layout/PageHeader';
import { AgeingChart, KpiRow, LatestOverlaps, TopInstitutions, WorkloadChart } from '../features/dashboard/widgets';
import { useMeta } from '../features/meta/useMeta';
import { formatDate } from '../lib/format';

/** Figures first (each opens its list), then what needs a decision, then the shape of the workload. */
export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const meta = useMeta();
  return (
    <div className="uc-page">
      <PageHeader
        title="Dashboard"
        subtitle={`${user ? user.name : ''}${meta.data ? ` · as of ${formatDate(meta.data.today)}` : ''}. Every number opens the cases behind it.`}
      />
      <div className="uc-stack">
        <KpiRow />
        <div className="uc-grid-split">
          <TopInstitutions />
          <LatestOverlaps />
        </div>
        <div className="uc-grid-2">
          <WorkloadChart />
          <AgeingChart today={meta.data?.today} />
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
