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

export const env = validateEnv();
