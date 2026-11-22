# ADR-011: Quality gates: what CI enforces and what is measured on the demo laptop

- **Status:** accepted · 2026-11-22

## Context

The SRS sets non-functional targets that unit tests cannot show: page speed (NFR-01), sandbox speed and
reliability (NFR-02), concurrency (NFR-04), map frame rate (NFR-05), accessibility (NFR-07), small screens
(NFR-08) and a security review. Some are cheap and stable enough to run on every pull request; others depend on
the hardware they run on and would make CI flaky.

## Decisions

### Enforced in CI on every pull request (fail the build)

- **Accessibility:** axe (WCAG 2.1 A/AA) on 21 page states across every role, failing on serious or critical
  violations; a keyboard-only walkthrough with visible focus checks; dialog focus trapping (`e2e/tests/quality.spec.ts`).
- **Narrow screens:** no horizontal scrolling at 768 px on the same pages.
- **LCP under 2.5 s** on key pages of the production build, measured in the browser. The budget is generous
  enough that a shared CI runner still passes, and a real regression (a blocking script, a huge image) still fails.
- **Content-Security-Policy:** any CSP violation reported in the browser console fails the test.
- **Security headers** through Caddy (CI `stack` job) and on the API (`security.int.spec`).
- **Dependency audit:** `pnpm audit --prod --audit-level high`, with any accepted advisory listed and justified in
  `docs/security.md`.

### Measured on the demo laptop, recorded in `docs/evidence/`

- **Lighthouse** (`pnpm quality:lighthouse`): scores vary with CPU load, so CI would flap.
- **Load test** (`pnpm load:test`, k6 in Docker): needs Docker capacity that shared runners do not have, and the
  number that matters is the laptop the class will actually use.
- **3D map frame rate:** headless CI renders WebGL in software. The spec records frames per second and only
  enforces 30 fps with `QUALITY_STRICT=1`.

Each evidence file records the date, the machine and the exact command, so it can be repeated before the demo.

## Consequences

- Accessibility and performance regressions are caught when they are introduced, not at the end.
- Hardware-dependent targets are reported honestly. The load test showed that a simultaneous burst of 20 starts
  exceeds the 10-second start target on this laptop while a realistic lab arrival meets it; the mitigation is in
  `docs/evidence/load-test.md` and, from Phase 6C, `docs/DEMO.md`.
