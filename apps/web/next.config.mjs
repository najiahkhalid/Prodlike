import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Security headers (docs/security.md). Production only: `next dev` needs eval for fast refresh.
 * 'unsafe-inline' scripts remain because Next.js inlines its hydration data without nonces.
 * HSTS is added by Caddy, which terminates HTTPS.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    if (process.env.NODE_ENV !== 'production') return [];
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  // Standalone output (used by the Docker image) creates symlinks, which Windows blocks without
  // admin rights, so it is only enabled when the Dockerfile sets NEXT_OUTPUT=standalone.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // Trace from the monorepo root so the standalone server lands at apps/web/server.js.
  outputFileTracingRoot: join(here, '..', '..'),
  // packages/ui ships TypeScript source; Next compiles it.
  transpilePackages: ['@prodlike/ui'],
  // The browser talks to the API through same-origin /api: see src/app/api/[...path]/route.ts.
};

export default nextConfig;
