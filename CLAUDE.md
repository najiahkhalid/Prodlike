# Prodlike — notes for AI coding sessions

Prodlike is a CS344 Web Engineering (NUST SEECS) group project by Team Prodlike: Najiah Khalid (lead, does most of the build), Zeeshan Haider Awan and Bilal Ahmed. Learners fix a ticket in a real codebase inside an isolated Docker sandbox, ship it through a simulated CI/CD pipeline, handle an injected production incident, and get a rubric-scored debrief. Instructors run cohorts.

## Where things are

- **Requirements:** `docs/project/proposal-and-srs.md` is the full Assignment 1 proposal + SRS: FR-01..FR-20 and NFR-01..NFR-14 word for word, audience, success metrics, sitemap. Read it before building a feature.
- **Build plan:** `docs/project/build-plan.md`: 7 phases over about 8 weeks (ending at semester end), with goals, owners, exit criteria, risks. The demo runs on a laptop with Docker Compose; there is no cloud.
- **Design:** `docs/design/`: the A2 clickable prototype (`prototype/*.html`), annotated wireframes and navigation flow. Every page must match it; see `docs/design/README.md`.
- Architecture decisions: `docs/adr/001..005`. Scenario format: `packages/shared/src/scenario/schema.ts` and `docs/scenario-authoring.md`.

## Phase status

- [x] P0 Foundation (monorepo, CI, design tokens, data model, discount-bug scenario)
- [x] P1 Accounts, roles, password reset, onboarding tour, catalogue, brief, admin publish (FR-01..04, FR-20 part)
- [x] P2 Sandbox runner + workspace (FR-05..07): dockerode warm pool, allowlisted exec, CodeMirror editor, HTTP terminal, snapshot resume (ADR-006)
- [ ] P3 Engine: pipeline, deploy, incidents, 3D/2D map, metrics (FR-08..12)
- [ ] P4 Scoring, debrief, progress, hints, guest demo (FR-13..16)
- [ ] P5 Instructor cohorts/assignments/reports/CSV, admin, scenario builder (FR-17..20)
- [ ] P6 Scenarios 2–4, Lighthouse/axe/k6 checks, pilot

## Conventions

- **Commits and PRs: never add `Co-Authored-By: Claude` or "Generated with Claude Code" lines.** The owner asked for this explicitly.
- Work on a branch `feat/phase-N-...`, open a PR, merge after CI is green. Conventional commit messages.
- Shared contracts (zod schemas, API types, socket events) live in `packages/shared`. Validate input with `ZodPipe`.
- Every API error is `{ code, message, action }` (NFR-09). Throw `ApiException` / `Errors.*`.
- Endpoints are protected by default; mark public ones with `@Public()`, restrict with `@Roles(...)`.
- The browser calls same-origin `/api/*` only (Next proxy route on the host, Caddy in Docker). Never call the API port directly from client code.
- Status shown in the UI always has an icon and a label, never colour alone (NFR-07).

## Commands

- `pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm format` · `pnpm scenarios:validate`
- API integration tests: `DATABASE_URL_TEST=... pnpm test` (add `SANDBOX_TESTS=1` for the real-Docker sandbox tests, after `pnpm scenarios:build`). Browser tests: `pnpm build && PW_CHANNEL=chrome pnpm --filter @prodlike/e2e e2e`. Database setup is in the README.
- Windows quirks: Next standalone output is only enabled inside Docker (symlinks). VS Code forwards 127.0.0.1:3000, so the e2e tests use ports 3100/4100.
