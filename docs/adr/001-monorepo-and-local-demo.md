# ADR-001: Monorepo, TypeScript end to end, local demo

- **Status:** accepted · 2026-11-15

## Context

Three developers, about 8 weeks, one web product with a frontend, an API, shared contracts and scenario content. The final demo runs on a team laptop; there is no cloud budget.

## Decision

- One **pnpm + Turborepo monorepo**: `apps/web` (Next.js 15), `apps/api` (NestJS 10), `packages/shared` (zod schemas and types), `packages/ui` (design tokens and components), `scenarios/`, `infra/`.
- **TypeScript everywhere**, so API contracts and the scenario format are typed once in `packages/shared`.
- **Local deployment with Docker Compose**: Postgres, API, web and Caddy. Caddy serves `https://localhost` with a locally issued certificate (NFR-12). An optional `ngrok http 443` tunnel gives a shareable link.

## Consequences

- One pull request can change the API and the UI together; types cannot drift.
- Windows developers need Docker Desktop with WSL2. Next.js `standalone` output is only enabled inside Docker, because it needs symlinks that Windows blocks without admin rights.
