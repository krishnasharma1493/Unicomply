import React from 'react';
import { PlaceholderPage } from './PlaceholderPage';

export const ReportsPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Reports & Analytics"
      description="Report generator with date range and grouping, interactive visualizations, data tables, and server-side CSV export."
      allowedRoles="heads, senior, admin"
      psFeature="8 — Statutory & Analytical Reporting"
    />
  );
};
