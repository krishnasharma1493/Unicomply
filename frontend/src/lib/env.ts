import { z } from 'zod';

const flag = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true');

export const envSchema = z.object({
  VITE_API_URL: z.string().url({ message: 'VITE_API_URL must be a valid URL (e.g. http://localhost:8000)' }),
  VITE_USE_MOCKS: flag,
  VITE_AUTH_DISABLED: flag,
  VITE_DEMO_MODE: flag,
  VITE_DEMO_EMAIL: z.string().optional(),
  VITE_DEMO_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(rawEnv: Record<string, unknown> = import.meta.env): Env {
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const errorMessages = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`❌ Invalid VITE_* environment variables:\n${errorMessages}`);
    throw new Error(`Invalid frontend environment variables:\n${errorMessages}`);
  }
  return parsed.data;
}

const overrides: Record<string, unknown> = {};

export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string | symbol) {
    if (typeof prop === 'string') {
      if (prop in overrides) {
        return overrides[prop];
      }
      return validateEnv()[prop as keyof Env];
    }
    return undefined;
  },
  set(_target, prop: string | symbol, value: unknown) {
    if (typeof prop === 'string') {
      overrides[prop] = value;
      return true;
    }
    return false;
  },
  has(_target, prop: string | symbol) {
    return typeof prop === 'string' && (prop in overrides || prop in validateEnv());
  },
  ownKeys(_target) {
    return Array.from(new Set([...Reflect.ownKeys(overrides), ...Reflect.ownKeys(validateEnv())]));
  },
  getOwnPropertyDescriptor(_target, prop: string | symbol) {
    return {
      configurable: true,
      enumerable: true,
      value:
        typeof prop === 'string'
          ? prop in overrides
            ? overrides[prop]
            : validateEnv()[prop as keyof Env]
          : undefined,
      writable: true,
    };
  },
});
