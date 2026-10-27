import React from 'react';
import { PlaceholderPage } from './PlaceholderPage';

export const InstitutionsPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Institutions Registry"
      description="Registry search by name, Permanent ID, state, region, and institution type across all AICTE approved institutions."
      allowedRoles="All"
      psFeature="1 — Institution Registry"
    />
  );
};
