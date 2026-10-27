import React from 'react';
import { PlaceholderPage } from './PlaceholderPage';

export const CasesPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Cases"
      description="Filter bar (institution, Permanent ID, case ref, bureau, region, category, status, date range, beyond SLA, in overlap) and paginated cases table."
      allowedRoles="All (scoped)"
      psFeature="2, 6 — Search & Filter Cases"
    />
  );
};
