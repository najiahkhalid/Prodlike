# ADR-009: Classes, assignments, reports, admin and the Scenario Builder

- **Status:** accepted · 2026-11-16

## Context

Phase 5 delivers FR-17 to FR-20: an instructor runs a real lab with no manual grading, an admin manages users and watches the sandboxes, and (as a "could have") instructors make their own scenario variants. NFR-13 requires that instructors only ever see their own learners.

## Decisions

### Classes and join codes (FR-17)

- A `Cohort` has a unique join code like `ABCD-1234` (no `I`/`O`, so it reads aloud cleanly). Codes are case-insensitive on entry.
- Learners join from the dashboard, or at sign-up with an optional code. A bad code at sign-up never loses the new account: it lands on the dashboard with an explanation.
- Archiving a class (soft delete) stops joins and hides it. Attempts and results are kept.

### Assignments and deadlines

- An assignment links a scenario (published, or the instructor's own variant) to a class, with an optional deadline. The same scenario cannot be assigned twice to one class.
- A learner's new attempt is linked to their earliest-due open assignment for that scenario (`Attempt.assignmentId`). Results do not depend on that link: they use each member's **best completed attempt since the assignment was created**, so practice attempts still count.
- **Late:** completed after the deadline, or not completed once the deadline has passed.

### Results (FR-18)

- Per learner: best score, number of attempts, time to recover, deploy strategy, late flag, and a link to that attempt's debrief.
- Per class: average, completion, median time to recover, a 10-band score distribution, and the rubric items most often missed (from `RubricResult` rows where the score is below the maximum).
- **CSV export** is UTF-8 with a BOM (Excel opens names correctly). Cells that start with `= + - @` are prefixed with `'`, so a learner's name cannot become a spreadsheet formula (CSV injection).

### Ownership (NFR-13)

- Every instructor endpoint loads the cohort or assignment through an ownership check that returns **404, not 403**, for someone else's data, so IDs cannot be probed. Admins pass every check.
- The learner-debrief drill-down is allowed only when the learner is a member of one of the caller's active classes.

### Admin (FR-20)

- **Users and roles:** search by name or email; change a role. Changing a role revokes that user's refresh tokens, so the new role applies at their next sign-in. Admins cannot change their own role (avoids locking out the last admin).
- **Sandbox health:** Docker reachability, scenario images built, warm-pool sizes, active vs maximum sandboxes, attempts by engine state, and provisioning times over 24 h (from `sandbox.ready` events).

### Scenario Builder (FR-19)

- A **variant** is a scenario definition stored in the database (`Scenario.basedOn`, `authorId`, `ScenarioVersion.definition`) and derived from a folder scenario. The instructor edits the ticket title and body, switches the incident on or off, re-weights the rubric (must total 100; 0 drops an item) and sets the hint penalty.
- Turning the incident off also removes incident-only hints and recovery debrief rules, so the variant stays coherent. The result is validated with the same zod `ScenarioSchema` as folder scenarios.
- A variant **reuses its base's codebase, sandbox image, warm pool and hidden tests** (`sourceSlug()`), so no Docker build is needed and any correct fix still earns full marks.
- Variants are private (unpublished): visible to their author, to admins, and to members of a class they are assigned to. They are loaded into the registry at boot and registered immediately on creation.

## Consequences

- An instructor can create a class, share a code, assign, and read results and the CSV without any manual grading. This is checked by the Phase 5 Playwright test and the API integration tests, including the "second instructor sees nothing" case.
- A variant cannot change code or hidden tests: new behaviour still needs a scenario folder (by design, since those must be reviewed).
