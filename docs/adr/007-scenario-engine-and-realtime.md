# ADR-007: Scenario engine and real-time updates

- **Status:** accepted · 2026-11-15

## Context

Phase 3 delivers FR-08 to FR-12: a CI/CD pipeline, deploy strategies, injected incidents, recovery and a live system map. Production must feel real, and the browser must see changes within 1 s (NFR-03).

## Decisions

### Engine (`apps/api/src/engine/engine.service.ts`)

- **One state machine per attempt**, held in memory and persisted to `Attempt.snapshot.engine` after every transition, so an API restart resumes it:
  `READY → PIPELINE_RUNNING → FAILED_PIPELINE | DEPLOYED → INCIDENT_ACTIVE → RECOVERING → RECOVERED → COMPLETED`.
- **The pipeline is real where it matters.** The learner's work is committed (`git commit` inside the sandbox), then the scenario's build, lint and test stages run in the sandbox. A failing stage blocks the deploy (FR-08).
- **Deploy and production are simulated:** the deploy stage rolls services to "deploying", runs a health check and promotes the release (v1.4.2, then v1.4.3, …). Strategies are direct or canary (FR-09).
- **Faults come from the scenario file (FR-10).** After a deploy, each fault whose cause is still in the release is scheduled (`trigger.delaySeconds`). A fault counts as "fixed" when the workspace matches one of its `file-matches-and-redeploy` resolutions, so fixing the config before shipping prevents the incident (`fault.prevented` event). A canary uses the fault's softer `canary` effect, and the impact shows as 10% of traffic.
- **Recovery (FR-11):** `rollback` restores the previous release; a hotfix deploy resolves the incident if the fix is in the workspace. Time to recover is measured from the alert to the restored state.
- **Finish rule:** production must be healthy and watched for the same window after every deploy, so the Finish button never hints whether an incident is coming.
- Every step writes an `AttemptEvent` (pipeline, deploy, incident, recovery, logs viewed). Phase 4 scores and debriefs from this timeline.
- `ENGINE_TIME_SCALE` speeds the clock up for tests (0.25 = 4× faster).

### Real-time channel (`engine.gateway.ts`, web `useEngine.ts`)

- **Socket.IO namespace `/attempts`.** The browser sends `attempt.join` and receives `engine.snapshot` (the full state, after every change), `metrics.tick` (1 Hz) and `pipeline.log` (live stage output).
- **Auth:** the same httpOnly access cookie, verified on connect. Joining a room requires owning the attempt; otherwise the answer is the same `NOT_FOUND` as the REST API. Session cookies are `SameSite=Lax`, so another site cannot open a socket as the user.
- **Routing:** in Docker, Caddy serves it at `/api/socket.io` (same origin). With `pnpm dev`, the browser connects to the API port on the same host (`REALTIME_PORT`, default 4000), because the Next.js proxy route cannot carry WebSockets.
- **Graceful degradation:** if the socket cannot connect, the workspace polls `GET /attempts/:id` every 2 s.

### System map (`system/Map3D.tsx`, `system/Map2D.tsx`)

- 3D with React Three Fiber, loaded only in the browser when shown. Labels are DOM overlays (no font download), and every state shows colour + icon + label (NFR-07).
- 2D SVG view ported from the A2 prototype. It is a user toggle (A2 refinement 2), remembered per browser, and the automatic fallback when WebGL is unavailable (NFR-05).

## Consequences

- The engine is single-process: fine for the laptop demo (ADR-001). Several API instances would need a shared bus (e.g. Redis) and one engine owner per attempt.
- Scenarios can add faults, metrics and logs without code changes (ADR-002).
