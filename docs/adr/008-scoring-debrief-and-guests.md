# ADR-008: Scoring, debrief, hints and the guest demo

- **Status:** accepted · 2026-11-16

## Context

Phase 4 delivers FR-13 to FR-16 plus two A2 refinements: a no-sign-up guest demo and hints that cost points. Scoring must be fair: any valid solution earns full marks (FR-14).

## Decisions

### Scoring at finish (`apps/api/src/scoring`)

- Finishing requires a healthy, watched production (`canFinish`, ADR-007). Then:
  1. **Hidden tests** are copied into the sandbox only now (`.hidden-tests/`, never visible earlier) and run with Jest. Correctness is **all-or-nothing** on them: a boundary bug passing 4 of 5 checks is still a bug.
  2. **`file-matches`** checks read the workspace (e.g. a non-commented `total: 1000` test).
  3. **`event-occurred`** checks read the attempt timeline (e.g. `deploy.canary`), with partial credit via `otherwise`.
  4. **`timing`** uses the time to recover. Preventing the incident earns full credit.
  5. The **hint penalty** (5 per hint) is subtracted; the score is clamped to 0–100.
- The pure scoring function (`rubric.ts`) has no I/O and is unit-tested. The service gathers the facts.
- The **debrief** (score, rubric with reasons, skills, decision timeline, matching senior-engineer tips, badges, recommendations) is computed once and stored in `Attempt.snapshot.debrief`, together with `RubricResult` rows and `Attempt.score`. It never changes afterwards, even if the scenario is edited.
- **Badges:** Clean Rollback (recovered within 2 min), Edge-Case Hunter (full testing marks), Canary Keeper (canary deploy). Each is stored once per user; the debrief marks the ones that are new.

### Hints

- `POST /attempts/:id/hints` picks the first unused hint written for the learner's current step: before tests pass, before deploying, or during the incident. It never gives an incident hint before an incident. Each use is recorded (`HintUsage`, `hint.used` event) and costs `hintPenalty` points. Used hints stay readable for free.

### Guest demo

- `POST /auth/guest` creates a `GUEST` user (24 h) with normal session cookies. Guests may start only scenarios marked `guestDemo`, and the web middleware keeps them to their attempt and debrief.
- **Claim on sign-up:** registering while signed in as a guest converts that same user (email, password, role), so the attempt, debrief and badges are kept.
- The reaper deletes expired guests and their sandboxes.

### Progress (FR-16)

- `GET /me/progress`: completed attempts (newest first), per-skill share of rubric points, badges, average/best score, median time to recover, and the A1 "learning gain" metric (average of the latest 3 minus the first 3, from 4 attempts on).

## Consequences

- A scenario's hidden tests are read from disk at finish time. Changing them creates a new `ScenarioVersion`, but attempts already running would use the new hidden tests. This is acceptable for the MVP, where scenarios are edited between labs, not during them.
