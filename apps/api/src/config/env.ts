import { resolve } from 'node:path';
import { z } from 'zod';

/** All API configuration, validated once at startup so a bad .env fails fast with a clear message. */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  /** Public URL of the web app, used in password-reset links. */
  APP_URL: z.string().default('http://localhost:3000'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),
  /** Secure cookies need HTTPS; true behind Caddy, false for plain http://localhost dev. */
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  /** Requests per minute per IP on login / register / forgot-password (NFR-13). */
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(10),

  SCENARIOS_DIR: z.string().default(resolve(process.cwd(), '..', '..', 'scenarios')),
  /** Publish newly discovered scenarios automatically (handy in development). */
  SCENARIOS_AUTO_PUBLISH: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid API configuration:\n${lines}\nSee apps/api/.env.example`);
  }
  return parsed.data;
}
