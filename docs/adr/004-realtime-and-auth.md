# ADR-004: Real-time events and authentication

- **Status:** accepted · 2026-11-15

## Real-time

- Socket.IO namespace `/attempts`, one room per attempt (`attempt:<id>`). The JWT is checked on connect, and only the attempt owner may join (an instructor may join read-only for their own cohorts).
- Event names and payload types live in `packages/shared/src/events.ts`: `engine.state`, `node.state`, `metrics.tick` (1 Hz), `pipeline.stage`, `pipeline.log`, `alert.raised`, `alert.resolved`, `terminal.output`, `tests.result`.
- Target: engine event to map update within 1 s (NFR-03).

## Authentication and authorisation

- Email and password; passwords hashed with bcrypt (NFR-11).
- A short-lived access JWT (15 min) and a rotating refresh token (stored hashed in `RefreshToken`), both in `httpOnly`, `Secure`, `SameSite=Lax` cookies.
- Roles: `GUEST`, `LEARNER`, `INSTRUCTOR`, `ADMIN`. NestJS guards plus a `@Roles()` decorator on every endpoint; Next.js middleware protects routes (FR-02).
- Instructors only ever query their own cohorts (NFR-13). Login, sign-up and attempt start are rate-limited.
