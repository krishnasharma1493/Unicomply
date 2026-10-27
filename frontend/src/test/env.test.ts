import { describe, it, expect, vi } from 'vitest';
import { validateEnv } from '../lib/env';

describe('Environment validation (src/lib/env.ts)', () => {
  it('validates a correct environment configuration', () => {
    const validRaw = {
      VITE_API_URL: 'http://localhost:8000',
      VITE_USE_MOCKS: 'false',
      VITE_AUTH_DISABLED: 'false',
      VITE_DEMO_MODE: 'true',
      VITE_DEMO_EMAIL: 'senior@aicte.example',
      VITE_DEMO_PASSWORD: 'password123',
    };

    const parsed = validateEnv(validRaw);
    expect(parsed.VITE_API_URL).toBe('http://localhost:8000');
    expect(parsed.VITE_USE_MOCKS).toBe(false);
    expect(parsed.VITE_DEMO_MODE).toBe(true);
    expect(parsed.VITE_DEMO_EMAIL).toBe('senior@aicte.example');
  });

  it('throws a clear startup error when VITE_API_URL is missing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      validateEnv({});
    }).toThrowError(/Invalid frontend environment variables/);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('❌ Invalid VITE_* environment variables'),
    );

    spy.mockRestore();
  });

  it('throws a clear startup error when VITE_API_URL is not a valid URL', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      validateEnv({ VITE_API_URL: 'not-a-valid-url' });
    }).toThrowError(/VITE_API_URL must be a valid URL/);

    spy.mockRestore();
  });
});
