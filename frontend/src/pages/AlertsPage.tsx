import React from 'react';
import { PlaceholderPage } from './PlaceholderPage';

export const AlertsPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Alerts Center"
      description="Notification center grouped by institution and day, sorted by severity: Overlap alerts, SLA-warning, SLA-breach, and inaction reminders."
      allowedRoles="All"
      psFeature="7 — Proactive Alert Notifications"
    />
  );
};
