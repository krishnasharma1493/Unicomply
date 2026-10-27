import React from 'react';
import { PlaceholderPage } from './PlaceholderPage';

export const OverlapDetailPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Overlap Group Detail"
      description="Side-by-side comparison of clustered complaint cases, why-flagged reasons, and decision actions (Confirm coordinator, Dismiss, or Resolve)."
      allowedRoles="heads, senior, admin"
      psFeature="3 — Overlap Group Cluster Analysis"
    />
  );
};
