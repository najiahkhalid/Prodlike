# Prodlike

**A practical software engineering training simulator.** Learners get a ticket and an unfamiliar codebase, fix it, test it in an isolated sandbox, ship it through a CI/CD pipeline, and then handle the production incident that follows. Every attempt is scored on a transparent rubric and ends with a debrief.

CS344 Web Engineering · NUST SEECS · Team Prodlike: Najiah Khalid (lead), Zeeshan Haider Awan, Bilal Ahmed.

> **Status: Phase 4 (Scoring + debrief).** Finishing an attempt runs hidden behavioural checks and scores the rubric; learners get a debrief (score, reasons, decision timeline, senior-engineer tips, badges), progress history and paid hints. Visitors can play a no-sign-up guest demo and keep the result by signing up. Next: Phase 5, instructor cohorts, assignments and reports.

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
pnpm db:generate                          # Prisma client
cp .env.example .env                      # root env, used by docker compose
cp apps/api/.env.example apps/api/.env    # API on the host
cp apps/web/.env.example apps/web/.env.local
```

**Option A — everything in Docker (closest to the demo):**

```bash
docker compose -f infra/docker-compose.yml --env-file .env up --build
# open https://localhost  (accept the local certificate once)
```

**Option B — apps on the host, database in Docker (fastest for development):**

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d postgres
pnpm db:migrate                           # apply migrations
pnpm --filter @prodlike/api db:seed       # admin account + badges
pnpm scenarios:build                      # sandbox images (needed to start attempts)
pnpm dev                                  # web on :3000, API on :4000
```

Sign up as a learner or instructor at `/signup`. The seeded admin is `ADMIN_EMAIL` / `ADMIN_PASSWORD` from the env file (default `admin@prodlike.local` / `change-me-please`). Admins land on `/admin`, where scenarios can be published or unpublished.

The landing page shows a **Platform status** card that calls the API's `/health` endpoint, so you can see at a glance that web → API → database is wired up.

## How the pieces talk to each other

- The browser only ever calls **same-origin `/api/*`**. In Docker, Caddy routes `/api` to the API. On the host, the Next.js route `src/app/api/[...path]` proxies it. Auth cookies are therefore first-party.
- **Auth** (ADR-004): a 15-minute access JWT (`pl_at`) and a rotating refresh token (`pl_rt`), both httpOnly cookies. The API enforces roles on every endpoint. `src/middleware.ts` in the web app only decides which pages a role may open, and silently renews expired sessions through `/auth/refresh`.
- **Sandboxes** (ADR-005, ADR-006): starting an attempt claims a warm container from a pool: no network, non-root, read-only system files, 512 MB / 1 CPU / 128 processes. The terminal never runs a shell; commands are checked against the scenario's allowlist. Saved files are also kept in the database, so a lost container is rebuilt without losing work. Attempts idle for 60 minutes are cleaned up.
- **Scenario engine** (ADR-007): one state machine per attempt. The pipeline's build, lint and test stages run for real in the sandbox; the deploy, production metrics, logs and incidents are simulated from the scenario file. Live updates reach the browser over Socket.IO (`/api/socket.io` behind Caddy, the API port with `pnpm dev`), with polling as a fallback.
- **Scoring** (ADR-008): at finish the hidden tests are copied into the sandbox and run, regex checks read the workspace, and the event timeline supplies deployment and recovery facts. Any valid solution passing the hidden checks scores full correctness. The debrief is stored with the attempt.
- **Scenarios** are read from `scenarios/` when the API starts and stored as immutable `ScenarioVersion` rows. The public catalogue and brief never include faults, hidden tests or hints.

## Tests

| Command                           | What it runs                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                       | Unit tests; API integration tests when `DATABASE_URL_TEST` points at a migrated database; real-Docker sandbox tests when `SANDBOX_TESTS=1` (after `pnpm scenarios:build`) |
| `pnpm --filter @prodlike/e2e e2e` | Playwright browser tests against the built apps (run `pnpm build` first)                                                                                                  |

Local setup for the database-backed tests (Postgres from Docker running):

```bash
docker exec prodlike-postgres-1 createdb -U prodlike prodlike_test
docker exec prodlike-postgres-1 createdb -U prodlike prodlike_e2e
cd apps/api
DATABASE_URL=postgresql://prodlike:prodlike@localhost:5432/prodlike_test pnpm prisma:deploy
DATABASE_URL=postgresql://prodlike:prodlike@localhost:5432/prodlike_e2e pnpm prisma:deploy
DATABASE_URL=postgresql://prodlike:prodlike@localhost:5432/prodlike_e2e \
  ADMIN_EMAIL=admin@e2e.test ADMIN_PASSWORD=admin-password-123 pnpm db:seed
cd ../..
pnpm scenarios:build
SANDBOX_TESTS=1 DATABASE_URL_TEST=postgresql://prodlike:prodlike@localhost:5432/prodlike_test pnpm test
pnpm build && SANDBOX_TESTS=1 PW_CHANNEL=chrome pnpm --filter @prodlike/e2e e2e   # uses your installed Chrome
```

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
