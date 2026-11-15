import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
