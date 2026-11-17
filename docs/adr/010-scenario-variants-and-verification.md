# ADR-010: Randomised scenario variants and scenario verification

- **Status:** accepted · 2026-11-17

## Context

Phase 6 grows the catalogue from one scenario to four. Two problems come with that:

1. **Copying (A1 risk).** In a lab, learners sit next to each other. If everyone's incident is identical, the
   answer ("set the timeout to 5000") travels faster than the lesson. Phase 5 already let instructors tick
   "Randomise injected faults per learner", but nothing used it.
2. **Trust in content.** A scenario is data (ADR-002), so a typo in a regex or a hidden test can make a
   scenario unwinnable or unfair, and only a full playthrough would notice.

## Decisions

### Variants

- `scenario.yaml` lists `variants: [{ id, params }]`. `{{KEY}}` placeholders may appear in template text files
  and in any string of the definition. `packages/shared/src/scenario/variants.ts` renders them
  (`renderScenario`, `renderText`) and picks one (`pickVariant`).
- **Who gets which variant:** an attempt linked to an assignment with `randomiseFaults = true` uses
  `variants[seed % n]` (the attempt's random seed, stored since Phase 2). Every other attempt (practice, guest
  demo, tests) uses the first variant, so behaviour stays predictable. The choice is stored in
  `Attempt.variantId`.
- **Where rendering happens:** `AttemptsService.defOf()` returns the rendered definition (cached per version
  and variant), so the engine, hints, scoring and debrief need no changes. When a sandbox is claimed or
  rebuilt, the API writes the rendered template files **before** restoring the learner's saved files, then
  amends the last seeded commit. Images seed the risky change as their last commit, so `git diff` is clean and
  `git show HEAD` shows the learner their own values.
- Variants change the **incident**, not the **task**: hidden tests are not rendered, and the brief (shown
  before a variant exists) renders with the first variant.
- The validator rejects any placeholder that a variant does not define.

### Verification

- Each scenario ships `solutions/*.yaml`: edits before shipping, actions before deploying, strategy, recovery
  steps, and the expected outcome (incident or prevented, resolved by, minimum score). At least two different
  valid fixes per scenario (FR-14).
- `infra/scripts/check-scenarios.mjs` (CI job `scenario-images`) checks every image: visible tests pass on the
  starting code in a locked-down sandbox; hidden tests **fail** on it; hidden tests **pass** after each
  solution's edits; non-root, no network; seeded history present.
- `apps/api/test/scenarios.int.spec.ts` plays every solution through the real API on Docker and asserts full
  correctness, the recovery path and the minimum score. It also checks that randomised assignments write the
  variant into the sandbox with a clean `git diff`.

### Small engine-adjacent change

- A green `npm test` in the terminal now records `tests.passed`, like the Tests tab, so "ran the tests before
  shipping" rubric checks treat both the same.

## Consequences

- Adding a scenario still needs no platform code, and a broken one fails CI before anyone plays it.
- The new scenarios teach things the first one could not: a feature change with a performance regression,
  an incident that **rollback cannot fix** (configuration outside the release), and a schema migration that a
  canary cannot contain.
- Variants are text substitution, so they can vary values and names, not program structure. That is enough
  to stop copy-paste answers, which was the goal.
