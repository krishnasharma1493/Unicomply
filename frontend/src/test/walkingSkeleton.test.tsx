import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthProvider';
import { AppRoutes } from '../App';
import { tokenStore } from '../auth/tokenStore';
import { client } from '../lib/api/client';
import { attachMockAdapter } from '../lib/api/mock';
import { fixtures } from '../lib/api/mock/fixtures';
import { env } from '../lib/env';
import { LoginPage } from '../pages/LoginPage';
import { CasesPage } from '../pages/CasesPage';
import { AdminPage } from '../pages/AdminPage';
import { AppSidebar } from '../components/layout/AppSidebar';
import { PersonaSwitcher } from '../components/layout/PersonaSwitcher';

describe('Issue #11 Walking Skeleton', () => {
  beforeAll(() => {
    attachMockAdapter(client, { latencyMs: [0, 0] });
  });

  beforeEach(() => {
    tokenStore.clear();
  });

  describe('LoginPage & Persona Cards (Demo Mode)', () => {
    beforeEach(() => {
      env.VITE_DEMO_MODE = true;
    });

    afterEach(() => {
      env.VITE_DEMO_MODE = false;
    });

    it('renders the 5 persona cards and the credentials form when VITE_DEMO_MODE=true', async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/login']}>
              <LoginPage />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      // Check header and branding
      expect(screen.getByText(/UNICOMPLY PORTAL/i)).toBeInTheDocument();
      expect(screen.getAllByText(/AICTE/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Demo Persona One-Click Access/i)).toBeInTheDocument();

      // Check all 5 seeded personas are displayed
      expect(screen.getByText('Dr. Meera Raghavan')).toBeInTheDocument();
      expect(screen.getByText('Anil Deshmukh')).toBeInTheDocument();
      expect(screen.getByText('Kavita Rao')).toBeInTheDocument();
      expect(screen.getByText('Rakesh Tiwari')).toBeInTheDocument();
      expect(screen.getByText('Neha Joshi')).toBeInTheDocument();

      // Check fallback credentials form
      expect(screen.getByText(/Officer Authentication/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('officer@aicte.example')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sign In to Portal/i })).toBeInTheDocument();
    });

    it('clicking a persona card authenticates the officer and stores the access token', async () => {
      const user = userEvent.setup();
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/login']}>
              <LoginPage />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      // Click the PGRC Head persona card (Anil Deshmukh)
      const pgrcCard = screen.getByRole('button', {
        name: /Sign in as Anil Deshmukh/i,
      });
      await user.click(pgrcCard);

      await waitFor(() => {
        expect(tokenStore.get()).toBe(fixtures.login.pgrc_head.data.access_token);
      });
    });
  });

  describe('LoginPage & PersonaSwitcher (Standard Mode, VITE_DEMO_MODE=false)', () => {
    beforeEach(() => {
      env.VITE_DEMO_MODE = false;
    });

    it('hides persona cards on LoginPage when VITE_DEMO_MODE=false', async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/login']}>
              <LoginPage />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      expect(screen.getByText(/UNICOMPLY PORTAL/i)).toBeInTheDocument();
      expect(screen.queryByText(/Demo Persona One-Click Access/i)).not.toBeInTheDocument();
      expect(screen.queryByText('Dr. Meera Raghavan')).not.toBeInTheDocument();

      // Official credentials form remains visible
      expect(screen.getByText(/Officer Authentication/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sign In to Portal/i })).toBeInTheDocument();
    });

    it('renders null for PersonaSwitcher when VITE_DEMO_MODE=false', async () => {
      tokenStore.set(fixtures.login.senior.data.access_token);
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <PersonaSwitcher />
          </AuthProvider>
        </QueryClientProvider>,
      );

      // Wait until AuthProvider completes loading
      await waitFor(() => {
        expect(screen.queryByText(/Loading Unicomply/i)).not.toBeInTheDocument();
      });

      // PersonaSwitcher must render nothing when demo mode is inactive
      expect(screen.queryByText(/Persona:/i)).not.toBeInTheDocument();
    });
  });

  describe('AppSidebar Role-Based Navigation Filtering (PRD §7)', () => {
    const setupSidebarWithUser = async (token: string) => {
      tokenStore.set(token);
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/']}>
              <AppSidebar />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      // Wait until AuthProvider loads user
      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
      });
    };

    it('senior_mgmt (admin) sees all 8 navigation items', async () => {
      await setupSidebarWithUser(fixtures.login.senior.data.access_token);

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Cases')).toBeInTheDocument();
      expect(screen.getByText('Case Intake')).toBeInTheDocument();
      expect(screen.getByText('Overlap Center')).toBeInTheDocument();
      expect(screen.getByText('Institutions')).toBeInTheDocument();
      expect(screen.getByText('Alerts')).toBeInTheDocument();
      expect(screen.getByText('Reports')).toBeInTheDocument();
      expect(screen.getByText('System Admin')).toBeInTheDocument();
      expect(screen.queryByText('Match Review')).not.toBeInTheDocument();
    });

    it('bureau_head sees 7 navigation items (no System Admin, no Match Review)', async () => {
      await setupSidebarWithUser(fixtures.login.pgrc_head.data.access_token);

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Cases')).toBeInTheDocument();
      expect(screen.getByText('Case Intake')).toBeInTheDocument();
      expect(screen.getByText('Overlap Center')).toBeInTheDocument();
      expect(screen.getByText('Institutions')).toBeInTheDocument();
      expect(screen.getByText('Alerts')).toBeInTheDocument();
      expect(screen.getByText('Reports')).toBeInTheDocument();
      expect(screen.queryByText('System Admin')).not.toBeInTheDocument();
      expect(screen.queryByText('Match Review')).not.toBeInTheDocument();
    });

    it('ro_officer sees 4 navigation items (Dashboard, Cases, Institutions, Alerts)', async () => {
      await setupSidebarWithUser(fixtures.login.ro_central.data.access_token);

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Cases')).toBeInTheDocument();
      expect(screen.getByText('Institutions')).toBeInTheDocument();
      expect(screen.getByText('Alerts')).toBeInTheDocument();
      expect(screen.queryByText('Case Intake')).not.toBeInTheDocument();
      expect(screen.queryByText('Overlap Center')).not.toBeInTheDocument();
      expect(screen.queryByText('Reports')).not.toBeInTheDocument();
      expect(screen.queryByText('System Admin')).not.toBeInTheDocument();
    });

    it('intake_operator sees Match Review and Case Intake', async () => {
      await setupSidebarWithUser(fixtures.login.intake.data.access_token);

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Cases')).toBeInTheDocument();
      expect(screen.getByText('Case Intake')).toBeInTheDocument();
      expect(screen.getByText('Match Review')).toBeInTheDocument();
      expect(screen.getByText('Institutions')).toBeInTheDocument();
      expect(screen.getByText('Alerts')).toBeInTheDocument();
      expect(screen.queryByText('Overlap Center')).not.toBeInTheDocument();
      expect(screen.queryByText('Reports')).not.toBeInTheDocument();
      expect(screen.queryByText('System Admin')).not.toBeInTheDocument();
    });
  });

  describe('CasesPage Minimal Table & Primitives Integration', () => {
    it('fetches cases from GET /cases and renders table with BureauChip, StatusChip, and SlaBadge', async () => {
      tokenStore.set(fixtures.login.senior.data.access_token);
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/cases']}>
              <CasesPage />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      // Wait for table to load
      await waitFor(() => {
        expect(screen.getByText(/Cases Repository/i)).toBeInTheDocument();
        expect(screen.getByText('PGRC/2026/00431')).toBeInTheDocument();
      });

      // Verify BureauChip rendered
      expect(screen.getAllByText('PGRC').length).toBeGreaterThan(0);

      // Verify StatusChip rendered
      expect(screen.getAllByText(/Received/i).length).toBeGreaterThan(0);

      // Verify SlaBadge rendered: Day 2 of 21 for case PGRC/2026/00431
      expect(screen.getByText('Day 2 of 21')).toBeInTheDocument();
    });
  });

  describe('AdminPage Access Control & Demo Reset', () => {
    it('denies access with a 403 Result card for non-admin officers', async () => {
      tokenStore.set(fixtures.login.pgrc_head.data.access_token);
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/admin']}>
              <AdminPage />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Access Restricted')).toBeInTheDocument();
        expect(
          screen.getByText(/System Administration controls and demo operations are restricted/i),
        ).toBeInTheDocument();
      });

      // Reset button must NOT be present
      expect(screen.queryByRole('button', { name: /Reset Demo Database/i })).not.toBeInTheDocument();
    });

    it('allows admin officer to trigger confirmation modal and reset demo database', async () => {
      tokenStore.set(fixtures.login.senior.data.access_token);
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/admin']}>
              <AdminPage />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/System Administration/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Reset Demo Database/i })).toBeInTheDocument();
      });

      // Click Reset Demo Database
      const resetBtn = screen.getByRole('button', { name: /Reset Demo Database/i });
      fireEvent.click(resetBtn);

      // Check confirmation modal appears
      await waitFor(() => {
        expect(screen.getAllByText(/Reset demo environment to baseline fixtures\?/i).length).toBeGreaterThan(0);
      });

      // Confirm reset
      const confirmBtn = screen.getByRole('button', { name: /Yes, Reset Everything/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Demo environment reset to baseline fixtures successfully/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe('AppShell Header & Persona Switching End-to-End', () => {
    beforeEach(() => {
      env.VITE_DEMO_MODE = true;
    });

    afterEach(() => {
      env.VITE_DEMO_MODE = false;
    });

    it('renders persona switcher and officer identity in AppShell', async () => {
      tokenStore.set(fixtures.login.senior.data.access_token);
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/cases']}>
              <AppRoutes />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/UNICOMPLY/i)).toBeInTheDocument();
        expect(screen.getAllByText('Dr. Meera Raghavan').length).toBeGreaterThanOrEqual(1);
      });

      // Verify PersonaSwitcher label and user role title
      expect(screen.getByText(/Persona:/i)).toBeInTheDocument();
      expect(screen.getByText('Senior Officer')).toBeInTheDocument();
    });
  });
});
