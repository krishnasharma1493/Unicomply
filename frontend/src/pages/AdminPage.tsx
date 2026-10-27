import React from 'react';
import { PlaceholderPage } from './PlaceholderPage';

export const AdminPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="System Administration"
      description="Administration controls, demo environment database reset (POST /demo/reset), and configurable operational parameters."
      allowedRoles="admin"
      psFeature="System Administration"
    />
  );
};
