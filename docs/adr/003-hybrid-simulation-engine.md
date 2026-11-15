# ADR-003: Hybrid simulation with a per-attempt state machine

- **Status:** accepted · 2026-11-15

## Context

Real cloud deployments per learner are out of scope (SRS §1.2), but the experience must feel authentic.

## Decision

- **Real:** the learner's code changes, `npm run build`, lint and tests all run inside their sandbox.
- **Simulated:** deployment, production traffic, metrics, logs and incidents, produced by a server-side scenario engine from the scenario file.
- The engine is a state machine per attempt:
  `PROVISIONING → READY → PIPELINE_RUNNING → DEPLOYED → INCIDENT_ACTIVE → RECOVERING → RECOVERED → COMPLETED`, plus `FAILED_PIPELINE` and `ABANDONED` (`packages/shared/src/events.ts`, Prisma enum `AttemptState`).
- Every transition and significant learner action is written as an `AttemptEvent` (the FR-13 timeline) and emitted to the browser.
- The attempt snapshot is saved every 30 s and on each transition, so a refresh resumes the attempt (NFR-14).

## Consequences

Scoring and debriefs work from the event timeline, so the same data powers the debrief, instructor analytics and the "most common mistake" report.
