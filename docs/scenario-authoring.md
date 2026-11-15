# Writing a scenario

A scenario is a folder in `scenarios/` named after its `slug`. Use `scenarios/discount-bug` as the reference example. The full format, with comments, is `packages/shared/src/scenario/schema.ts`.

```
scenarios/<slug>/
  scenario.yaml          brief, architecture, pipeline, faults, rubric, hints, debrief rules
  template/              the codebase the learner gets (with package.json scripts: build, lint, test)
  hidden-tests/          behavioural checks run only at scoring time
  image/Dockerfile       FROM prodlike/sandbox-base:node20, installs deps, seeds git history
```

## Checklist

1. **Story first.** Write the ticket as a real issue tracker would, add a teammate message that foreshadows the incident, and give 3–4 objectives.
2. **Template.** Keep it under about 2,000 lines (SRS assumption). The visible tests must **pass** on the buggy code; the bug should hide at an edge.
3. **Hidden tests** check behaviour, not exact text, so any valid fix passes. They are copied to `/workspace/.hidden-tests/`, so import from `../src/...`. Try at least two different valid fixes.
4. **Faults.** Each fault has a trigger (`after: deploy`, `delaySeconds`), an alert, an effect (node states, metrics, logs; optionally a softer `canary` effect) and at least one resolution.
5. **Rubric.** Weights must sum to **100**. Cover correctness, testing, deployment safety and recovery. Write both `explainPass` and `explainFail`: they appear in the debrief.
6. **Hints** escalate from a nudge to the answer; each costs `hintPenalty` points.
7. **Validate:** `pnpm scenarios:validate`. **Build the image:** `pnpm scenarios:build <slug>`.
8. Get another team member to **peer-play** it before it is published.
