import React from 'react';
import { PlaceholderPage } from './PlaceholderPage';

export const DashboardPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Dashboard"
      description="Scoped KPI cards (total, pending, under process, disposed, transferred, escalated, beyond SLA, open overlaps), bureau workload chart, ageing buckets, and top institutions."
      allowedRoles="All (scoped)"
      psFeature="4 — Executive & Bureau Monitoring"
    />
  );
};
