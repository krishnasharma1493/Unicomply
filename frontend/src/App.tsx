import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './components/RequireAuth';
import { ErrorBoundary } from './components/ErrorBoundary';

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

      {/* Protected PRD §7 Routes */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/cases"
        element={
          <RequireAuth>
            <CasesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/cases/new"
        element={
          <RequireAuth>
            <CaseIntakePage />
          </RequireAuth>
        }
      />
      <Route
        path="/cases/:id"
        element={
          <RequireAuth>
            <CaseDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/reviews"
        element={
          <RequireAuth>
            <MatchReviewPage />
          </RequireAuth>
        }
      />
      <Route
        path="/overlaps"
        element={
          <RequireAuth>
            <OverlapCenterPage />
          </RequireAuth>
        }
      />
      <Route
        path="/overlaps/:id"
        element={
          <RequireAuth>
            <OverlapDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/institutions"
        element={
          <RequireAuth>
            <InstitutionsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/institutions/:pid"
        element={
          <RequireAuth>
            <InstitutionDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/alerts"
        element={
          <RequireAuth>
            <AlertsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/reports"
        element={
          <RequireAuth>
            <ReportsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminPage />
          </RequireAuth>
        }
      />

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
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
