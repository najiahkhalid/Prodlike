> Approved build plan (15 Nov 2026). Phase checkboxes live in CLAUDE.md; this file is the detailed reference.

# Prodlike — Build Plan (MVP v1.0, 8 weeks)

## Context

Assignments 1 and 2 are done: the proposal and SRS (20 functional requirements, FR-01…FR-20, and 14 non-functional ones, NFR-01…NFR-14) are written, and a high-fidelity clickable prototype exists at `Assignment 2 - Prodlike Design/prototype/`. The next phase is building the real product: a Next.js + NestJS + PostgreSQL web app where learners fix real code in isolated Docker sandboxes, ship it through a simulated CI/CD pipeline, handle injected incidents on a live 3D map, and get auto-scored debriefs. Instructors run cohorts.

**Current state:**

- Remote repo `github.com/najiahkhalid/Prodlike` exists but is **empty**: created 2026-10-05, no commits, public, default branch `main`.
- No local clone exists.
- The `gh` CLI is not installed, but GitHub Desktop is.

**Decisions made:**

- About 8 weeks, ending at semester end.
- **Local or laptop demo only** (Docker Compose, with an optional ngrok tunnel; ngrok is already installed).
- **Monorepo.**
- Team ownership follows A1:
  - **Najiah:** backend, sandbox runner, engine, scoring.
  - **Zeeshan:** frontend, 3D map.
  - **Bilal:** database, scenarios, tests, DevOps.

---

## 1. Requirements → phase map

| Phase                               | Functional                                      | Non-functional                                            |
| ----------------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| P0 Foundation                       | —                                               | NFR-12 (HTTPS locally), CI baseline                       |
| P1 Accounts, catalogue, shell       | FR-01, 02, 03, 04, 20 (partial)                 | NFR-06 (onboarding), 07, 08, 09, 11, 12, 13 (rate limits) |
| P2 Sandbox and workspace            | FR-05, 06, 07                                   | NFR-02, 04, 10, 14                                        |
| P3 Engine, pipeline, incidents, map | FR-08, 09, 10, 11, 12                           | NFR-03, 05                                                |
| P4 Assessment, debrief, progress    | FR-13, 14, 15, 16 (+ hints, guest demo from A2) | NFR-14                                                    |
| P5 Instructor and admin             | FR-17, 18, 19, 20                               | NFR-13                                                    |
| P6 Content, hardening, pilot        | 4 scenarios end-to-end                          | NFR-01, 04, 05, 07 audits; success metrics                |

**A2 refinements are in scope:**

- Guest demo scenario (P4).
- 2D/3D toggle (P3).
- Hints with a −5 penalty (P4).
- Three-zone workspace (P2).

---

## 2. Architecture (fixed before any feature work)

### Monorepo layout (pnpm workspaces + Turborepo)

```
Prodlike/
  apps/web/            Next.js 15 (App Router, TS), Tailwind, Monaco, xterm.js, R3F
  apps/api/            NestJS (TS): REST + Socket.IO gateway, Prisma, dockerode
  packages/shared/     zod schemas + TS types: API DTOs, socket events, scenario schema
  packages/ui/         design tokens + shared React components (Button, Badge, StatusPill…)
  scenarios/<slug>/    scenario.yaml, template/ (codebase), hidden-tests/, image/Dockerfile
  infra/               docker-compose.yml, Caddyfile, sandbox base image, seed scripts
  docs/                ADRs, API contract, scenario authoring guide
  .github/workflows/   ci.yml (lint, typecheck, unit, integration, e2e)
```

### Key design decisions

1. **Hybrid simulation** (SRS §1.2):
   - **Real:** the learner's code runs in a sandbox, and so do the build, lint and test steps.
   - **Simulated:** "deploy", production traffic, metrics and incidents come from a server-side **scenario engine**.
2. **Scenarios are data.** Each scenario is a folder of files, so new content needs no platform code changes. `scenario.yaml` declares:
   - **Brief:** ticket, company, teammate message, objectives, constraints.
   - **Architecture graph:** nodes and edges for the map.
   - **Terminal:** the command allowlist.
   - **Pipeline:** stages and their real commands.
   - **Faults:** trigger (e.g. `after: deploy, delay: 4s`), effect (node states, metric profile, log lines) and resolution conditions (rollback, or `file:deploy/payments.env matches PAYMENT_TIMEOUT_MS>=1000` followed by a redeploy).
   - **Rubric:** weighted checks of four types:
     - `hidden-tests` (run in the sandbox)
     - `file-matches`
     - `event-occurred` (e.g. tests run before deploy, canary used)
     - `timing` (time to recover against thresholds)
   - **Hints:** context-keyed.
   - **Debrief rules:** condition → senior-engineer tip.
   - Validated by a zod schema in `packages/shared`.
   - **Randomised variants** (A1 anti-copying): `variants:` lists alternative fault parameters, picked per attempt with a seed.
3. **Engine** is a per-attempt state machine in the API:
   - States: `PROVISIONING → READY → PIPELINE_RUNNING → DEPLOYED → INCIDENT_ACTIVE → RECOVERING → RECOVERED → COMPLETED`, plus `FAILED_PIPELINE` and `ABANDONED`.
   - Every transition writes an `AttemptEvent` (this is FR-13's timeline) and emits a socket event.
   - Snapshots are persisted every 30 s and on each transition, so attempts survive a refresh (NFR-14).
4. **Sandbox runner** (dockerode, NFR-10). One container per attempt:
   - Created from the scenario image (Node 20 slim with dependencies pre-installed).
   - Isolation flags: `User: node`, `NetworkMode: none`, `Memory: 512m`, `NanoCpus: 1e9`, `PidsLimit: 128`, `CapDrop: [ALL]`, `SecurityOpt: no-new-privileges`, read-only root filesystem with a writable `/workspace` and `/tmp` tmpfs.
   - The terminal is **not a raw shell**: the API parses each command against the allowlist and runs it with `docker exec`, streaming output.
   - Files are read and written through the API (tar via `putArchive` / `getArchive`).
   - A **warm pool** of 2–3 pre-created containers per scenario meets the "ready in under 10 s" target (NFR-02).
   - A **reaper job** destroys containers that are idle for 60 minutes, finished, or orphaned at API start.
   - **Concurrency cap** is configurable: 20 per the SRS; set to about 8 on a laptop.
5. **Realtime:** Socket.IO namespace `/attempts`, room `attempt:{id}`, JWT checked on connect.
   - Events are typed in `packages/shared`: `engine.state`, `node.state`, `metrics.tick` (1 Hz), `pipeline.stage`, `pipeline.log`, `alert.raised`, `alert.resolved`, `terminal.output`, `tests.result`.
6. **Auth:**
   - Email and password hashed with bcrypt.
   - Short-lived access JWT plus a refresh token, both in httpOnly, Secure, SameSite cookies.
   - NestJS guards plus a `@Roles()` decorator; Next.js middleware protects routes (FR-02).
   - Rate limiting with `@nestjs/throttler` on login, register and attempt start (NFR-13).
   - Every query is scoped to the instructor's own cohorts.
7. **Data model (Prisma):**
   - `User(role)`, `Cohort`, `CohortMember`, `Scenario`, `ScenarioVersion(yaml hash, published)`, `Assignment(due)`, `Attempt(state, seed, snapshot json, startedAt, endedAt)`, `AttemptEvent(type, payload, at)`, `RubricResult(check, score, max, reason)`, `HintUsage`, `Badge`, `UserBadge`, `PasswordResetToken`, `Feedback`.
   - Guests are a `User` with role `GUEST`, cleaned up after 24 h. Their attempt can be claimed when they sign up.
8. **Design system:** port the prototype's tokens.
   - `prototype/assets/styles.css` `:root` variables (indigo #4F46E5, navy #0F172A, cyan #06B6D4, status colours, three font families) become `packages/ui/tailwind-preset.ts`.
   - Prototype pages become the reference layouts.
9. **Local deployment:**
   - `infra/docker-compose.yml` runs web, api, postgres and caddy (`tls internal` gives local HTTPS for NFR-12).
   - The API reaches the Docker daemon through the mounted socket. Windows uses Docker Desktop with WSL2.
   - Sandbox images are built by `pnpm scenarios:build`.
   - Optional `ngrok http 443` for a shareable demo link.

---

## 3. Phases

### Phase 0: Foundation (Week 1, first half)

**Goal:** anyone on the team can clone the repo, run one command and see the skeleton running; CI guards every pull request.

**Work:**

- **Najiah:**
  - Initialise the monorepo in the empty `Prodlike` repo (pnpm, Turborepo, TS strict, ESLint + Prettier, Husky + lint-staged, commitlint).
  - Scaffold `apps/api` (NestJS: config module, health endpoint, Prisma module).
  - Write ADRs 001–005 covering the decisions above.
- **Zeeshan:**
  - Scaffold `apps/web` (Next.js App Router, Tailwind using the ported token preset, next/font for Space Grotesk, Inter and JetBrains Mono).
  - Build `packages/ui` primitives from the prototype: Button, Badge, Chip, Card, Modal, Toast, StatusPill (icon plus label).
  - Build the app shell (public nav plus role sidebar), mirroring `prototype/assets/app.js` `renderSidebar`.
- **Bilal:**
  - Write `infra/docker-compose.yml` (Postgres 16, Caddy) and the first Prisma schema and migration.
  - Set up GitHub Actions CI: install, lint, typecheck, unit tests, and Prisma migrate against a service Postgres.
  - Set up GitHub Projects board, issue templates, branch protection on `main` (one approving review from a _different_ member, per A1), and a PR template.
  - Write the `scenarios/` schema in `packages/shared` and the first scenario codebase: port the prototype's **Rs 1,000 Discount Bug** (`prototype/assets/workspace.js` `FILES`, hints, logs, debrief tips) into `scenarios/discount-bug/`.

**Exit criteria:**

- `pnpm i && pnpm dev` (or `docker compose up`) serves `https://localhost`, and the web app calls API `/health`.
- CI is green on a test pull request.
- The schema validates `discount-bug/scenario.yaml`.

### Phase 1: Accounts, App Shell and Catalogue (Week 1, second half – Week 2)

**Goal:** a user can register, log in as Learner or Instructor, see the role-appropriate shell, browse scenarios and open a brief.

**Work:**

- **API:**
  - Auth module: register, login, logout, refresh, forgot and reset password. In dev, reset emails go to a console or Mailpit container.
  - Roles guard and throttling.
  - `GET /scenarios` with difficulty and skill filters.
  - `GET /scenarios/:slug` (brief and rubric preview, with no hidden data).
  - The scenario loader syncs `scenarios/*/scenario.yaml` into `Scenario` and `ScenarioVersion` on boot (admin publish flag, FR-20 partial).
  - Global validation pipe (zod) and a consistent error shape `{code, message, action}` (NFR-09).
- **Web pages:**
  - Landing (from `prototype/index.html`)
  - Login and Sign-up with the role toggle (`login.html`)
  - Learner Dashboard skeleton (`dashboard.html`)
  - Catalogue with filters and search in URL query params (`catalogue.html`)
  - Brief (`brief.html`)
  - Route protection in middleware.
- **Onboarding:** a 3-step tooltip tour on first login (NFR-06).
- **Accessibility from day one:** focus rings, labels and keyboard navigation (NFR-07). Responsive down to 768 px (NFR-08).

**Exit criteria:** a Playwright end-to-end test covers register → dashboard → catalogue filter → open brief → logout. A learner cannot reach `/instructor` (server returns 403, client redirects).

### Phase 2: Sandbox Runner and Workspace (Weeks 3–4)

**Goal:** "Start attempt" gives the learner a private, isolated sandbox with a real editor, a restricted terminal and real test runs.

**Work:**

- **Najiah, `SandboxModule`:**
  - Build the image per scenario.
  - Create, start, exec and destroy with the isolation flags from §2.4.
  - Warm pool, reaper, concurrency cap with a friendly "all sandboxes busy, retry in 30 s" response.
  - `POST /attempts` (creates the Attempt and claims a container).
  - File API: `GET` and `PUT /attempts/:id/files/*path`.
  - Command router (allowlist, streamed through the socket).
  - `POST /attempts/:id/tests` (runs `npm test -- --json` and parses the results).
- **Zeeshan, the workspace page** (dark theme, three zones from WF-04):
  - Monaco editor with a file tree, "M" modified markers, and debounced autosave via the file API.
  - xterm.js terminal wired to the command router.
  - Tabs for test results.
  - Lifecycle stepper and timer.
  - A "System" zone placeholder for P3.
- **Bilal:**
  - Sandbox integration tests in CI (GitHub runners have Docker): isolation checks, including no network (`curl` fails), memory-limit kill and the non-root user.
  - Write scenario #2's codebase (Friday Deploy Gone Wrong).
  - Snapshot save every 30 s and resume on refresh (NFR-14).

**Exit criteria:**

- On the reference laptop, the sandbox is ready in under 10 s at p95 with the warm pool.
- A test run finishes in under 30 s (NFR-02).
- Commands outside the allowlist are rejected.
- Refreshing the page resumes the same attempt.
- The isolation tests pass.

### Phase 3: Scenario Engine — Pipeline, Deployment, Incidents, Live Map (Weeks 4–5)

**Goal:** the full story runs live. Commit → pipeline with real build, lint and test stages → simulated deploy (direct or canary) → injected fault → investigate → recover by rollback, hotfix or config change.

**Work:**

- **Najiah, `EngineModule`:**
  - State machine (xstate or a hand-rolled reducer with exhaustive types).
  - Pipeline runner: real commands per stage inside the sandbox; a failing stage blocks deploy (FR-08).
  - Deploy strategies and a health check (FR-09).
  - Fault scheduler driven by the scenario yaml and the attempt seed (FR-10).
  - Metrics generator (1 Hz profiles: baseline, spike, decay).
  - Log generator.
  - Resolution evaluators, e.g. rollback and file-match + redeploy (FR-11).
  - Every step emits socket events and writes an `AttemptEvent`.
- **Zeeshan:**
  - Pipeline tab (stage cards and streamed logs).
  - Incidents tab (alert card with SEV, impact and action buttons).
  - Metric tiles with sparklines.
  - **3D System Map** in React Three Fiber:
    - Nodes and edges from the scenario graph.
    - States: healthy, deploying, degraded, down. Colour **plus icon plus label**, with pulsing animation.
    - Lazy-loaded, aiming for 30+ FPS (NFR-05). Edge animation shows traffic.
  - **2D map** from the prototype's SVG renderer (`renderMap` in `prototype/assets/workspace.js`, 2D branch), used both as the WebGL fallback and as the user toggle (A2 refinement 2).
  - Deploy modal (commit message, strategy).
- **Bilal:**
  - Engine unit tests covering every transition and fault/resolution pair.
  - A latency test: event emitted → map updated in under 1 s (NFR-03).
  - Scenario #3's codebase (The Missing Env Variable).

**Exit criteria:** the prototype's walkthrough (README steps 1–7) works on the real system for `discount-bug`, with real tests and simulated production. A Playwright golden-path test passes. The map shows each state within 1 s.

### Phase 4: Assessment, Debrief, Progress, Hints, Guest Demo (Week 6)

**Goal:** every attempt ends in a fair, explained score, and learners can see themselves improving.

**Work:**

- **Najiah, `ScoringModule`:**
  - On finish:
    - copy `hidden-tests/` into the sandbox and run them;
    - evaluate the `file-matches`, `event-occurred` and `timing` checks;
    - subtract hint penalties;
    - persist `RubricResult` rows.
  - Accept any solution that passes the checks (FR-14).
  - Generalise the prototype's scoring formula (`finish()` in `workspace.js`) into rubric weights.
  - Debrief generator: score breakdown, key timeline moments (decisions marked good, warning or bad from event rules), senior-engineer tips from `debriefRules` (ported from the tip logic in `debrief.html`), and next-scenario recommendations based on the weakest skill (FR-15).
  - Badges (Clean Rollback, Edge-Case Hunter, Canary Keeper).
  - Hints endpoint, context-aware by engine state, logging `HintUsage`.
- **Zeeshan:** Debrief page (score ring, rubric bars, timeline, tips, recommended next); Progress History page with score trend and per-skill bars (FR-16); dashboard filled with real data.
- **Bilal:**
  - **Guest demo:** a `GUEST` session from the landing CTA running the shortened `discount-bug` variant; on sign-up, the attempt moves to the new account; guests are cleaned up after 24 h. Rate-limited.
  - Scoring unit tests: a table of solutions, including **alternative valid fixes** that must still earn full marks.

**Exit criteria:** two different valid fixes both score 30/30 on correctness. The debrief matches the recorded timeline. A guest can finish the demo and claim the result after signing up.

### Phase 5: Instructor and Admin (Week 7)

**Goal:** an instructor can run a real lab with no manual grading.

**Work:**

- **API:**
  - Cohorts CRUD with join codes (FR-17).
  - Enrolment by join code at sign-up or from the dashboard.
  - Assignments with deadlines, and randomised fault variants switched on per assignment.
  - Results endpoints for per-learner and cohort aggregates (average, completion, median time to recover, distribution, most common mistake from event analytics) (FR-18).
  - CSV export (streamed).
  - Cohort-ownership guard on every instructor query (NFR-13).
  - **Admin:** users and roles, publish or unpublish scenarios, sandbox health view showing the pool, active containers and failures (FR-20).
- **Web:**
  - Instructor Dashboard (from `prototype/instructor.html`).
  - Cohort Management, Assign modal, Learner Reports with drill-down to any learner's debrief.
  - Admin pages.
- **FR-19 Scenario Builder (Could have; build last):** a form editor for a scenario variant (brief text, which faults to inject, rubric weights) that writes a new `ScenarioVersion` validated by the shared zod schema. It is cut first if time runs short.

**Exit criteria:** an instructor creates a cohort, a learner joins by code, a scenario is assigned, results appear, and the CSV export opens correctly in Excel. A second instructor cannot see the first one's cohort (API test).

### Phase 6: Content, Hardening and Pilot (Week 8)

**Goal:** a reliable demo with four complete scenarios, verified against the SRS and the A1 success criteria.

**Work:**

- **Content:** finish all four scenarios (bug fix, feature change, failed deploy with rollback, config incident), each with hidden tests, a variant, hints and debrief rules. Peer-play each one.
- **Quality gates:**
  - **NFR-01:** Lighthouse CI, LCP under 2.5 s.
  - **NFR-04:** k6 load test with 20 concurrent attempts (or the laptop cap).
  - **NFR-07:** axe accessibility scan with no serious violations, plus a keyboard-only walkthrough.
  - **NFR-02:** sandbox start success above 95%.
  - **Security:** dependency audit, container-escape checklist and auth tests.
- **Pilot** with 15+ classmates on the laptop demo, measuring the A1 success metrics:
  - completion rate ≥ 70%
  - 3rd-attempt score ≥ 25% above the 1st
  - SUS ≥ 70
  - sandbox success ≥ 95%
  - one instructor or TA creates a cohort
- **Demo runbook** (`docs/DEMO.md`): `docker compose up`, seed data, pre-warm the pool, optional ngrok link, and fallback steps.
- Write the final report and presentation.

**Exit criteria:** all Must requirements pass the acceptance checklist (`docs/acceptance.md`, one row per FR/NFR with evidence); pilot metrics are recorded; a tagged release `v1.0.0`.

---

## 4. Parallel tracks (all phases)

- **Content** (Bilal leads, everyone writes): one scenario every 2 weeks, using the authoring guide in `docs/`.
- **Design QA** (Zeeshan): each page is compared against the A2 wireframes and prototype before merge.
- **Integration** (Najiah): Friday internal demo at the end of each sprint (A1 process), with slipped tasks re-planned openly.

## 5. Ways of working

- One GitHub Issue per requirement slice, labelled with its FR/NFR ID; one owner and a due date.
- Branches `feat/FR-xx-short-name`; PR template links the FR/NFR; approval from another member is required; CI must be green.
- **Definition of Done:** tests written, accessibility checked, error states handled, docs updated, demoed.

## 6. Top risks and mitigations

| Risk                                       | Mitigation                                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Docker on Windows laptops is slow or flaky | WSL2 backend, pre-built images, warm pool, and a reference demo laptop chosen in week 1                                       |
| Learner code escaping the sandbox          | No network, non-root user, cap-drop, read-only root filesystem, resource limits, allowlisted exec only; isolation tests in CI |
| 3D map performance                         | Low-poly instanced meshes, lazy loading, automatic 2D fallback                                                                |
| Scope creep in week 7                      | Scenario Builder (FR-19) is explicitly cuttable; Must requirements are frozen after week 2                                    |
| Scoring feels unfair                       | Hidden tests check behaviour, not text; table-driven tests of alternative fixes; pilot feedback loop                          |

## 7. Verification (end to end)

1. `git clone`, `pnpm i`, `pnpm scenarios:build`, `docker compose up` → `https://localhost` loads.
2. The Playwright suite (`pnpm e2e`) covers four flows:
   - guest demo
   - learner golden path (fix → tests → deploy → incident → rollback → debrief)
   - instructor flow (cohort → assign → results → CSV)
   - RBAC denial
3. API integration tests against a real Postgres, plus sandbox isolation tests (Docker required).
4. Non-functional checks: Lighthouse CI (LCP), axe accessibility, k6 concurrency, and timing logs for sandbox start and event latency.
5. Fill in `docs/acceptance.md`: every FR and NFR marked pass or fail with evidence (test name, screenshot or metric).

## 8. Immediate next steps once this plan is approved

1. Clone `najiahkhalid/Prodlike` locally and scaffold the Phase 0 monorepo (first commit on a `feat/bootstrap` branch, then a PR).
2. Port the design tokens from `prototype/assets/styles.css` and the `discount-bug` scenario content from `prototype/assets/workspace.js`.
3. Create GitHub Issues for P0–P1 and a Projects board.
