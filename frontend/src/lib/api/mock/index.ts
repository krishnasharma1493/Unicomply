// Mock API layer (#10): serves the contract fixtures from memory when VITE_USE_MOCKS=true.
// main.tsx loads this module lazily and hands it to `registerMockAdapter`, so a real-API build
// never fetches it. Reload the page or POST /demo/reset to get the seeded world back.

import MockAdapter from 'axios-mock-adapter';
import type { AxiosInstance } from 'axios';
import { dispatch } from './handlers';

export type MockOptions = {
  /** Simulated latency range per request, in ms. */
  latencyMs?: [min: number, max: number];
};

export function attachMockAdapter(instance: AxiosInstance, { latencyMs = [200, 600] }: MockOptions = {}) {
  const mock = new MockAdapter(instance);
  mock.onAny().reply(async (config) => {
    const [min, max] = latencyMs;
    await new Promise((resolve) => setTimeout(resolve, min + Math.random() * (max - min)));
    return dispatch(config);
  });
  return mock;
}
