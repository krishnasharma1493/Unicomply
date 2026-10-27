import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthProvider';
import { AppRoutes } from '../App';
import { tokenStore } from '../auth/tokenStore';

describe('Route Protection & Navigation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    tokenStore.clear();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it('redirects an unauthenticated visit to a protected route (/) to /login', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/']}>
            <AppRoutes />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/UNICOMPLY PORTAL/i)).toBeInTheDocument();
    });
  });

  it('redirects an unauthenticated visit to protected /cases to /login', async () => {
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
      expect(screen.getByText(/UNICOMPLY PORTAL/i)).toBeInTheDocument();
    });
  });

  it('shows NotFound page on an unknown route', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/unknown-nonexistent-path']}>
            <AppRoutes />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('404')).toBeInTheDocument();
      expect(
        screen.getByText(/Sorry, the page you visited does not exist/i),
      ).toBeInTheDocument();
    });
  });
});
