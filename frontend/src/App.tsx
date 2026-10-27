import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './components/RequireAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppShell } from './components/layout';
import { themeConfig } from './theme';

// Pages
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CasesPage } from './pages/CasesPage';
import { CaseIntakePage } from './pages/CaseIntakePage';
import { CaseDetailPage } from './pages/CaseDetailPage';
import { MatchReviewPage } from './pages/MatchReviewPage';
import { OverlapCenterPage } from './pages/OverlapCenterPage';
import { OverlapDetailPage } from './pages/OverlapDetailPage';
import { InstitutionsPage } from './pages/InstitutionsPage';
import { InstitutionDetailPage } from './pages/InstitutionDetailPage';
import { AlertsPage } from './pages/AlertsPage';
import { ReportsPage } from './pages/ReportsPage';
import { AdminPage } from './pages/AdminPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PrimitivesDevPage } from './pages/dev/PrimitivesDevPage';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Route */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected PRD §7 Routes in AppShell */}
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/cases" element={<CasesPage />} />
        <Route path="/cases/new" element={<CaseIntakePage />} />
        <Route path="/cases/:id" element={<CaseDetailPage />} />
        <Route path="/reviews" element={<MatchReviewPage />} />
        <Route path="/overlaps" element={<OverlapCenterPage />} />
        <Route path="/overlaps/:id" element={<OverlapDetailPage />} />
        <Route path="/institutions" element={<InstitutionsPage />} />
        <Route path="/institutions/:pid" element={<InstitutionDetailPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>

      {/* Dev-only route */}
      {import.meta.env.DEV && (
        <Route path="/dev/primitives" element={<PrimitivesDevPage />} />
      )}

      {/* Catch-all 404 Route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ConfigProvider theme={themeConfig}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </AuthProvider>
        </QueryClientProvider>
      </ConfigProvider>
    </ErrorBoundary>
  );
};

export default App;
