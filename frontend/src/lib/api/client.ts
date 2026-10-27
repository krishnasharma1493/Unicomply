import axios, { type AxiosError, type AxiosInstance } from 'axios';
import { env } from '../env';
import { tokenStore } from '../../auth/tokenStore';
import type { ApiError } from './types';

export const client: AxiosInstance = axios.create({
  baseURL: `${env.VITE_API_URL.replace(/\/$/, '')}/api/v1`,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach the access token to every request
client.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// No refresh flow: any 401 (except a failed login) -> clear token and redirect to /login
client.interceptors.response.use(
  (res) => res,
  (error: AxiosError<ApiError>) => {
    const isLoginCall = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginCall) {
      tokenStore.clear();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

/**
 * Hook point for Issue #10: Mock API layer (VITE_USE_MOCKS).
 * Issue #10 can import `client` directly or call `registerMockAdapter`
 * to attach an axios-mock-adapter when VITE_USE_MOCKS is enabled.
 */
export type MockAdapterAttacher = (axiosInstance: AxiosInstance) => void;
let mockAdapterAttacher: MockAdapterAttacher | null = null;

export function registerMockAdapter(attacher: MockAdapterAttacher) {
  mockAdapterAttacher = attacher;
  if (env.VITE_USE_MOCKS) {
    attacher(client);
  }
}

export function getMockAdapterAttacher(): MockAdapterAttacher | null {
  return mockAdapterAttacher;
}
