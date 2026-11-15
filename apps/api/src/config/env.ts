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

  /** Sandboxes (ADR-005). Image name = prefix + scenario slug + ":latest". */
  SANDBOX_IMAGE_PREFIX: z.string().default('prodlike/scenario-'),
  /** Warm containers kept ready per scenario (NFR-02: ready within 10 s). 0 disables the pool. */
  SANDBOX_POOL_SIZE: z.coerce.number().int().min(0).max(10).default(2),
  /** Maximum attempts with a running sandbox at once (NFR-04: 20 on a server, ~8 on a laptop). */
  SANDBOX_MAX_ACTIVE: z.coerce.number().int().positive().default(8),
  /** Attempts idle longer than this are abandoned and their sandbox removed (FR-05). */
  SANDBOX_IDLE_MINUTES: z.coerce.number().positive().default(60),

  /** Engine clock: 1 = real time; tests use e.g. 0.2 to run deploys and incidents 5x faster. */
  ENGINE_TIME_SCALE: z.coerce.number().positive().max(10).default(1),
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
