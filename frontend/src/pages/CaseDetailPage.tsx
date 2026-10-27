import React from 'react';
import { PlaceholderPage } from './PlaceholderPage';

export const CaseDetailPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Case Detail"
      description="Case header, status chip, SLA countdown badge, tracking fields, overlap banner with linked cases, action timeline, and workflow action dialogs."
      allowedRoles="Scoped (bureau / region / senior)"
      psFeature="2, 3, 5 — Case Detail & Workflow State Machine"
    />
  );
};
