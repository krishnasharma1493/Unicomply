import React from 'react';
import { PlaceholderPage } from './PlaceholderPage';

export const OverlapCenterPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Overlap Center"
      description="Overview of cross-bureau and cross-cell overlapping complaint groups: Probable, Possible, and Decided tabs with group cards and severity tiers."
      allowedRoles="heads, senior, admin"
      psFeature="3 — Cross-Bureau Overlap Detection"
    />
  );
};
