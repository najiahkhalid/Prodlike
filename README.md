# Prodlike

**A practical software engineering training simulator.** Learners get a ticket and an unfamiliar codebase, fix it, test it in an isolated sandbox, ship it through a CI/CD pipeline, and then handle the production incident that follows. Every attempt is scored on a transparent rubric and ends with a debrief.

CS344 Web Engineering · NUST SEECS · Team Prodlike: Najiah Khalid (lead), Zeeshan Haider Awan, Bilal Ahmed.

> **Status: Phase 0 (Foundation).** The monorepo, CI, design system, data model and first scenario are in place. See the build plan for Phases 1–6.

## Repository layout

| Path               | What it is                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `apps/web`         | Next.js 15 frontend (App Router, Tailwind, design tokens from the A2 prototype)                     |
| `apps/api`         | NestJS API: REST (+ Socket.IO from Phase 2), Prisma ORM, Docker sandbox runner (Phase 2)            |
| `packages/shared`  | zod schemas and TypeScript types shared by web and API, including the **scenario file format**      |
| `packages/ui`      | Tailwind preset (design tokens) and shared React components                                         |
| `scenarios/<slug>` | One folder per scenario: `scenario.yaml`, `template/` codebase, `hidden-tests/`, `image/Dockerfile` |
| `infra`            | Docker Compose stack, Caddy (local HTTPS), sandbox base image, scripts                              |
| `docs`             | Architecture decisions (ADRs), scenario authoring guide                                             |

## Getting started

Prerequisites: **Node 20+**, **pnpm 9** (`corepack enable`), and **Docker Desktop** (WSL2 backend on Windows).

```bash
pnpm install
pnpm db:generate                 # Prisma client
cp .env.example .env             # root env, used by docker compose
cp apps/api/.env.example apps/api/.env
```

**Option A — everything in Docker (closest to the demo):**

```bash
docker compose -f infra/docker-compose.yml --env-file .env up --build
# open https://localhost  (accept the local certificate once)
```

**Option B — apps on the host, database in Docker (fastest for development):**

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d postgres
pnpm db:migrate                  # apply migrations
pnpm dev                         # web on :3000, API on :4000
```

The landing page shows a **Platform status** card that calls the API's `/health` endpoint, so you can see at a glance that web → API → database is wired up.

## Common scripts

| Command                                      | What it does                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                                   | Run web, API and package watchers                                      |
| `pnpm build` / `lint` / `typecheck` / `test` | Run across the whole monorepo (Turborepo)                              |
| `pnpm scenarios:validate`                    | Validate every `scenarios/*/scenario.yaml` and the files it references |
| `pnpm scenarios:build`                       | Build the sandbox base image and all scenario images (needs Docker)    |
| `pnpm db:migrate`                            | Create and apply a Prisma migration in development                     |
| `pnpm format`                                | Format with Prettier                                                   |

## How we work

See [CONTRIBUTING.md](CONTRIBUTING.md): one issue per requirement slice, `feat/FR-xx-name` branches, a pull request reviewed by another member, CI green before merge.

Key decisions are recorded in [docs/adr](docs/adr). Writing a new scenario: [docs/scenario-authoring.md](docs/scenario-authoring.md).
