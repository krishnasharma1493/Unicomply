import React from 'react';
import { PlaceholderPage } from './PlaceholderPage';

export const MatchReviewPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Match Review Queue"
      description="Queue of uncertain institution matches: raw complainant text, state/district, candidate list with reasons, and alias resolution."
      allowedRoles="intake, admin"
      psFeature="3 — Resolution Review Queue"
    />
  );
};
