import React from 'react';
import { PlaceholderPage } from './PlaceholderPage';

export const CaseIntakePage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Case Intake"
      description="Intake form with live 300ms debounced institution resolution preview, candidate ranking, category suggestions, and immediate overlap detection banner."
      allowedRoles="intake, heads, admin"
      psFeature="2, 3 — New Case Registration & Match Preview"
    />
  );
};
