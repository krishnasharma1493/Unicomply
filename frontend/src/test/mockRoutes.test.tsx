import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthProvider';
import { AppRoutes } from '../App';
import { tokenStore } from '../auth/tokenStore';
import { client } from '../lib/api/client';
import { attachMockAdapter } from '../lib/api/mock';
import { fixtures } from '../lib/api/mock/fixtures';

// Every §7 route boots against the mock layer on the real Axios client: no backend involved.
describe('Routes with the mock API (VITE_USE_MOCKS)', () => {
  beforeAll(() => {
    attachMockAdapter(client, { latencyMs: [0, 0] });
  });

  beforeEach(() => {
    tokenStore.set(fixtures.login.senior.data.access_token);
  });

  it.each([
    ['/', 'Dashboard'],
    ['/cases', 'Cases'],
    ['/cases/new', 'Register a case'],
    ['/cases/101', 'Case Detail'],
    ['/reviews', 'Match Review'],
    ['/overlaps', 'Overlap Center'],
    ['/overlaps/1', 'Overlap'],
    ['/institutions', 'Institutions'],
    ['/institutions/1-4812730561', 'Institution'],
    ['/alerts', 'Alerts'],
    ['/reports', 'Reports'],
    ['/admin', 'Admin'],
  ])('restores the session from GET /users/me and renders %s', async (path, title) => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AuthProvider>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: new RegExp(title, 'i') })).toBeInTheDocument();
    });
    expect(tokenStore.get()).toBe(fixtures.login.senior.data.access_token);
  });
});
