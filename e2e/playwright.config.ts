import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run the BUILT apps (pnpm build first) against a dedicated database.
 * Ports 3100/4100 avoid clashing with `pnpm dev` (3000/4000).
 *   E2E_DATABASE_URL  migrated + seeded Postgres (default: local prodlike_e2e)
 *   PW_CHANNEL=chrome use the installed Google Chrome instead of downloading Chromium
 */
const DB =
  process.env.E2E_DATABASE_URL ?? 'postgresql://prodlike:prodlike@localhost:5432/prodlike_e2e?schema=public';
const SECRET = 'e2e-secret-0123456789abcdef';
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3100',
    channel: process.env.PW_CHANNEL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL } }],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: '../apps/api',
      url: 'http://localhost:4100/health',
      reuseExistingServer: !CI,
      env: {
        DATABASE_URL: DB,
        API_PORT: '4100',
        JWT_ACCESS_SECRET: SECRET,
        WEB_ORIGIN: 'http://localhost:3100',
        APP_URL: 'http://localhost:3100',
        COOKIE_SECURE: 'false',
        AUTH_RATE_LIMIT: '1000',
        SCENARIOS_AUTO_PUBLISH: 'true',
      },
    },
    {
      command: 'pnpm exec next start -p 3100',
      cwd: '../apps/web',
      url: 'http://localhost:3100',
      reuseExistingServer: !CI,
      env: { API_INTERNAL_URL: 'http://localhost:4100', JWT_ACCESS_SECRET: SECRET },
    },
  ],
});
