# Writing a scenario

A scenario is a folder in `scenarios/` named after its `slug`. Use `scenarios/discount-bug` as the reference example. The full format, with comments, is `packages/shared/src/scenario/schema.ts`.

```
scenarios/<slug>/
  scenario.yaml          brief, architecture, pipeline, faults, rubric, hints, debrief rules
  template/              the codebase the learner gets (with package.json scripts: build, lint, test)
  hidden-tests/          behavioural checks run only at scoring time
  image/Dockerfile       FROM prodlike/sandbox-base:node20, installs deps, seeds git history
  solutions/*.yaml       reference playthroughs (never copied into the image)
```

## The four scenarios

| Slug              | Difficulty   | Story                                                             | Incident and recovery                                                   |
| ----------------- | ------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `discount-bug`    | beginner     | Off-by-one in a promo (`>` vs `>=`)                               | Payments timeout config in the release → rollback or fix config         |
| `free-delivery`   | intermediate | New pricing rule (free delivery from Rs 1,500, express surcharge) | Cache TTL set to ~0 → DB overload, latency → rollback or fix TTL        |
| `missing-env-var` | intermediate | Phone-number normalisation for OTP SMS                            | Ops bot dropped a required env var → **rollback does not help**; fix it |
| `friday-deploy`   | advanced     | Surge cap and minimum fare, on a Friday                           | Plain `CREATE INDEX` locks a busy table (SEV-1, no canary protection)   |

## Checklist

1. **Story first.** Write the ticket as a real issue tracker would, add a teammate message that foreshadows the incident, and give 3–4 objectives.
2. **Template.** Keep it under about 2,000 lines (SRS assumption). The visible tests must **pass** on the buggy code; the bug should hide at an edge.
3. **Hidden tests** check behaviour, not exact text, so any valid fix passes. They are copied to `/workspace/.hidden-tests/`, so import from `../src/...`. Try at least two different valid fixes.
4. **Faults.** Each fault has a trigger (`after: deploy`, `delaySeconds`), an alert, an effect (node states, metrics, logs; optionally a softer `canary` effect) and at least one resolution.
5. **Rubric.** Weights must sum to **100**. Cover correctness, testing, deployment safety and recovery. Write both `explainPass` and `explainFail`: they appear in the debrief.
6. **Hints** escalate from a nudge to the answer; each costs `hintPenalty` points.
7. **Variants** (optional, recommended): see below.
8. **Reference solutions:** at least two different valid fixes, and at least one per recovery path. See below.
9. **Validate:** `pnpm scenarios:validate`. **Build the image:** `pnpm scenarios:build <slug>`. **Check it:** `node infra/scripts/check-scenarios.mjs <slug>`.
10. **Play the solutions** through the real API: `SANDBOX_TESTS=1 DATABASE_URL_TEST=… pnpm --filter @prodlike/api exec jest test/scenarios.int.spec.ts`.
11. Get another team member to **peer-play** it before it is published.

## Randomised variants (ADR-010)

When an instructor assigns a scenario with "Randomise injected faults per learner", each attempt runs one
variant, picked by the attempt's seed. Practice attempts (no assignment) always run the first variant.

```yaml
variants:
  - id: gateway-url
    params: { MISSING_VAR: SMS_GATEWAY_URL, PRESENT_LINE: 'SMS_API_KEY=pk_live_7f3a91c2e4' }
  - id: api-key
    params: { MISSING_VAR: SMS_API_KEY, PRESENT_LINE: 'SMS_GATEWAY_URL=https://sms.paydost.internal/v2/send' }
```

- Write `{{KEY}}` in template text files and in any `scenario.yaml` string (fault logs and alert, resolution
  patterns, hints, debrief tips). The validator fails if any variant misses a key that is used.
- The brief is shown before a variant is chosen, so keep placeholders out of the brief (it renders with the
  first variant).
- When the sandbox starts, the API writes the rendered files and amends the **last** seeded commit. So in
  `image/Dockerfile`, make the commit that introduces the fault the last one, and give the earlier commits a
  safe value (see `scenarios/free-delivery/image/Dockerfile`). Then `git diff` is clean and `git show HEAD`
  shows the risky change with the learner's own values.
- Hidden tests are not rendered: vary the incident, not the task.

## Reference solutions

Each `solutions/<name>.yaml` is a complete playthrough. CI checks that its edits pass the hidden tests, and
the API test plays it end to end and checks the debrief.

```yaml
name: '>= fix, canary, rollback'
edits: # before shipping: { file, find, replace } | { file, pattern, replace } | { file, append }
  - {
      file: src/discount.js,
      find: 'order.total > DISCOUNT_THRESHOLD',
      replace: 'order.total >= DISCOUNT_THRESHOLD',
    }
before: [git-log, run-tests] # what the learner does before deploying
deploy: canary # or direct
recover: [rollback] # [], [rollback], [hotfix] or [rollback, hotfix]
hotfixEdits: [] # applied before the hotfix deploy
afterEdits: [] # applied after recovery, before finishing
expect: { incident: true, resolvedBy: rollback, minScore: 100 }
```

Edit strings may use the variant's `{{KEY}}` placeholders (e.g. `{{MISSING_VAR}}=…`). For multi-line `find`
blocks that start with indentation, use `find: |2` so YAML keeps the leading spaces.
