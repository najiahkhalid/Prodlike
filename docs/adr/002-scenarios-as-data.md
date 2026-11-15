# ADR-002: Scenarios are data, validated by one schema

- **Status:** accepted · 2026-11-15

## Context

The MVP needs at least four scenarios, and instructors should later create variants (FR-19). Hard-coding scenario logic into the engine would make every new scenario a code change.

## Decision

Each scenario is a folder `scenarios/<slug>/` containing:

- `scenario.yaml`: brief, architecture graph, terminal allowlist, pipeline stages, faults (trigger, effect, resolutions), rubric, hints, debrief rules, variants.
- `template/`: the codebase the learner receives.
- `hidden-tests/`: behavioural checks copied into the sandbox only at scoring time.
- `image/Dockerfile`: the sandbox image, with dependencies pre-installed.

The format is defined once as a zod schema in `packages/shared/src/scenario/schema.ts`. `pnpm scenarios:validate` checks every folder, and CI runs it. Cross-field rules include: rubric weights sum to 100, edges reference real nodes, a simulated deploy stage exists, and referenced files exist.

## Consequences

- Adding a scenario never needs platform code. The API syncs scenario folders into `Scenario` and `ScenarioVersion` rows on start-up (Phase 1).
- Rubric checks test **behaviour, not text** (hidden tests, regex on files, engine events, timing), so any valid solution scores full marks (FR-14).
