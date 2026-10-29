import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import fs from 'node:fs';
import path from 'node:path';
import { AuthProvider } from '../auth/AuthProvider';
import { AppRoutes } from '../App';
import { LoginPage } from '../pages/LoginPage';
import { tokenStore } from '../auth/tokenStore';
import { client } from '../lib/api/client';
import { fixtures } from '../lib/api/mock/fixtures';
import { LoadingState, EmptyState, ErrorState, QueryBoundary } from '../components/states';
import { Button } from 'antd';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function renderRoute(route: string, queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[route]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

// ── 1. Source Code Guarantees (PRD §8 & Base §8) ─────────────────────────────

describe('Frontend Freeze Audit: §8 Source Code Guarantees', () => {
  const srcDir = path.resolve(__dirname, '..');

  function getSourceFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'test') {
          files.push(...getSourceFiles(fullPath));
        }
      } else if (/\.(tsx?|jsx?|html|css)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const allFiles = getSourceFiles(srcDir);

  it('contains zero instances of dangerouslySetInnerHTML in source files', () => {
    const offendingFiles: string[] = [];
    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('dangerouslySetInnerHTML')) {
        offendingFiles.push(path.relative(srcDir, file));
      }
    }
    expect(offendingFiles).toEqual([]);
  });

  it('contains zero instances of innerHTML or document.write in source files', () => {
    const offendingFiles: string[] = [];
    for (const file of allFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('.innerHTML') || content.includes('document.write')) {
        offendingFiles.push(path.relative(srcDir, file));
      }
    }
    expect(offendingFiles).toEqual([]);
  });

  it('contains zero console.log statements in frontend source code', () => {
    const offendingFiles: string[] = [];
    for (const file of allFiles) {
      // Exclude tests and mock handlers if applicable, but per §8 check whole src
      if (file.includes('/test/')) continue;
      const content = fs.readFileSync(file, 'utf-8');
      if (/\bconsole\.log\s*\(/.test(content)) {
        offendingFiles.push(path.relative(srcDir, file));
      }
    }
    expect(offendingFiles).toEqual([]);
  });

  it('contains zero localStorage usage in frontend source code (token in memory + sessionStorage only)', () => {
    const offendingFiles: string[] = [];
    for (const file of allFiles) {
      if (file.includes('/test/')) continue;
      const content = fs.readFileSync(file, 'utf-8');
      if (/\blocalStorage\b/.test(content)) {
        offendingFiles.push(path.relative(srcDir, file));
      }
    }
    expect(offendingFiles).toEqual([]);
  });
});

// ── 2. Demo Mode Gating (PRD §8 Additions) ───────────────────────────────────

describe('Frontend Freeze Audit: VITE_DEMO_MODE Gating', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    tokenStore.clear();
    queryClient = createQueryClient();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('when VITE_DEMO_MODE=false: persona cards & switcher are hidden, and form credentials are NOT pre-filled', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <LoginPage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    // 1. Persona cards section must not render
    expect(screen.queryByText(/Demo Persona One-Click Access/i)).toBeNull();

    // 2. Email and Password fields must be blank
    const emailInput = screen.getByPlaceholderText('officer@aicte.example');
    const passwordInput = screen.getByPlaceholderText('••••••••••••');
    expect(emailInput).toHaveValue('');
    expect(passwordInput).toHaveValue('');
  });

  it('when VITE_DEMO_MODE=true: persona cards and pre-filled credentials render as expected', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <LoginPage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    // 1. Persona cards section must render
    expect(screen.getByText(/Demo Persona One-Click Access/i)).toBeInTheDocument();

    // 2. Email and Password fields must be pre-filled
    const emailInput = screen.getByPlaceholderText('officer@aicte.example');
    const passwordInput = screen.getByPlaceholderText('••••••••••••');
    expect(emailInput).toHaveValue('senior@aicte.example');
    expect(passwordInput).not.toHaveValue('');
  });
});

// ── 3. Backend Stopped / Network Error / 500 Failures on Every Route ──────────

describe('Frontend Freeze Audit: Backend Stopped / Network Error & 500 Failure Tests', () => {
  let mock: MockAdapter;
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    mock = new MockAdapter(client);
    queryClient = createQueryClient();
    tokenStore.set(fixtures.login.senior.data.access_token);
  });

  afterEach(() => {
    mock.restore();
    tokenStore.clear();
    vi.unstubAllEnvs();
  });

  const routesWithData: Array<{ path: string; name: string }> = [
    { path: '/', name: 'Today' },
    { path: '/cases', name: 'Cases' },
    { path: '/cases/new', name: 'Case Intake' },
    { path: '/cases/101', name: 'Case Detail' },
    { path: '/reviews', name: 'Match Review' },
    { path: '/overlaps', name: 'Overlap Center' },
    { path: '/overlaps/1', name: 'Overlap Detail' },
    { path: '/institutions', name: 'Institutions Search' },
    { path: '/institutions/1-43655981521', name: 'Institution 360' },
    { path: '/alerts', name: 'Alerts' },
    { path: '/reports', name: 'Reports' },
  ];

  it.each(routesWithData)(
    'displays ErrorState with retry control and never blank on $name ($path) when backend experiences network error',
    async ({ path }) => {
      // Allow session bootstrap so the route renders under AppShell
      mock.onGet('/users/me').reply(200, fixtures.usersMe.senior);

      // All resource queries fail with network error (backend stopped)
      mock.onAny().networkError();

      renderRoute(path, queryClient);

      // Wait for error state to render
      await waitFor(() => {
        const errorAlerts = screen.getAllByRole('alert');
        expect(errorAlerts.length).toBeGreaterThanOrEqual(1);
      });

      // Assert that a retry button ("Try Again") is rendered
      const retryButtons = screen.getAllByRole('button', { name: /try again/i });
      expect(retryButtons.length).toBeGreaterThanOrEqual(1);

      // Assert DOM is not blank
      expect(document.body.innerHTML.trim().length).toBeGreaterThan(200);
    },
  );

  it.each(routesWithData)(
    'displays ErrorState with retry control and never blank on $name ($path) when backend returns 500 Internal Error',
    async ({ path }) => {
      mock.onGet('/users/me').reply(200, fixtures.usersMe.senior);

      // All resource queries fail with 500 error
      mock.onAny().reply(500, {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Backend database connection refused',
        },
      });

      renderRoute(path, queryClient);

      await waitFor(() => {
        const errorAlerts = screen.getAllByRole('alert');
        expect(errorAlerts.length).toBeGreaterThanOrEqual(1);
      });

      const retryButtons = screen.getAllByRole('button', { name: /try again/i });
      expect(retryButtons.length).toBeGreaterThanOrEqual(1);
      expect(document.body.innerHTML.trim().length).toBeGreaterThan(200);
    },
  );

  it('shows an error state on /login when backend is stopped during sign-in attempt', async () => {
    tokenStore.clear();
    mock.onPost('/auth/login').networkError();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <LoginPage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    const personaCard = screen.getByRole('button', { name: /sign in as Dr. Meera Raghavan/i });
    await userEvent.click(personaCard);

    await waitFor(() => {
      expect(screen.getByText(/Sign-in Error/i)).toBeInTheDocument();
      expect(screen.getByText(/Failed to sign in as Dr. Meera Raghavan/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(document.body.innerHTML.trim().length).toBeGreaterThan(200);
  });
});

// ── 4. Loading, Empty, and Error State Unit Assertions ─────────────────────────

describe('Frontend Freeze Audit: Shared State Primitives & QueryBoundary', () => {
  it('LoadingState renders role="status" and tip text', () => {
    const { rerender } = render(<LoadingState tip="Loading cases..." />);
    expect(screen.getByRole('status', { name: 'Loading cases...' })).toBeInTheDocument();
    expect(screen.getByText('Loading cases...')).toBeInTheDocument();

    rerender(<LoadingState card tip="Card loading" />);
    expect(screen.getByRole('status', { name: 'Card loading' })).toBeInTheDocument();
  });

  it('EmptyState renders title, description, and optional action', () => {
    render(
      <EmptyState
        title="No complaints filed"
        description="Try searching with a different term."
        action={<Button>Create one</Button>}
        card
      />,
    );

    expect(screen.getByText('No complaints filed')).toBeInTheDocument();
    expect(screen.getByText('Try searching with a different term.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create one' })).toBeInTheDocument();
  });

  it('ErrorState renders role="alert", message, and invokes onRetry', async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Could not connect to AICTE portal" onRetry={onRetry} card />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Could not connect to AICTE portal')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /try again/i });
    await userEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('QueryBoundary correctly transitions through Loading, Error, Empty, and Success states', () => {
    // 1. Loading
    const loadingQuery = { isLoading: true, isError: false, data: undefined };
    const { rerender } = render(
      <QueryBoundary query={loadingQuery} loadingTip="Fetching items...">
        {() => <div>Data Content</div>}
      </QueryBoundary>,
    );
    expect(screen.getByRole('status', { name: 'Fetching items...' })).toBeInTheDocument();

    // 2. Error with retry
    const onRetry = vi.fn();
    const errorQuery = {
      isLoading: false,
      isError: true,
      error: new Error('Network failure'),
      refetch: onRetry,
    };
    rerender(
      <QueryBoundary query={errorQuery}>
        {() => <div>Data Content</div>}
      </QueryBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();

    // 3. Empty list
    const emptyQuery = { isLoading: false, isError: false, data: [] };
    rerender(
      <QueryBoundary
        query={emptyQuery}
        emptyTitle="Nothing here"
        emptyDescription="The list is empty"
      >
        {() => <div>Data Content</div>}
      </QueryBoundary>,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('The list is empty')).toBeInTheDocument();

    // 4. Custom isEmpty predicate
    const customEmptyQuery = { isLoading: false, isError: false, data: { items: [] } };
    rerender(
      <QueryBoundary
        query={customEmptyQuery}
        isEmpty={(d) => (d as { items: unknown[] }).items.length === 0}
        emptyTitle="Custom Empty"
      >
        {() => <div>Data Content</div>}
      </QueryBoundary>,
    );
    expect(screen.getByText('Custom Empty')).toBeInTheDocument();

    // 5. Success
    const successQuery = { isLoading: false, isError: false, data: ['Case 1', 'Case 2'] };
    rerender(
      <QueryBoundary query={successQuery}>
        {(items) => <div>Loaded {items.length} items</div>}
      </QueryBoundary>,
    );
    expect(screen.getByText('Loaded 2 items')).toBeInTheDocument();
  });
});
