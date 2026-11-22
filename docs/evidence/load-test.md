# Load test: concurrent attempts (NFR-04) and sandbox speed (NFR-02)

- **Date:** 2026-11-22 · **Machine:** the demo laptop (Windows 10, Docker Desktop with WSL2, 12 CPUs, 8 GB for Docker)
- **Tool:** k6 0.54.0 in Docker, script `infra/load/attempts.k6.js`, raw results in `load-test-*-summary.json`
- **API:** production build (`node apps/api/dist/main.js`) with `SANDBOX_MAX_ACTIVE=20`, `SANDBOX_POOL_SIZE=3`,
  `AUTH_RATE_LIMIT=1000`; scenario `discount-bug`

Each virtual user is one learner: sign up → start an attempt (a real, isolated sandbox) → run the real test suite
in it → open the workspace three times → end the attempt.

## Results

| Profile                                            | Learners | Sandbox starts | Start time median / p95 | Test run median / p95 | Failed requests |
| -------------------------------------------------- | -------- | -------------- | ----------------------- | --------------------- | --------------- |
| **Lab**: learners arrive over 1 minute             | 20       | 20 / 20 (100%) | **0.61 s / 0.75 s** ✓   | 3.3 s / 3.7 s ✓       | 0 / 140 ✓       |
| **Burst**: all 20 click "Start" in the same second | 20       | 20 / 20 (100%) | 19.5 s / **20.2 s** ✗   | 8.1 s / 8.7 s ✓       | 0 / 140 ✓       |

Targets: start success > 95%, start p95 < 10 s, test run p95 < 30 s, failed requests < 5%.

## Reading the results

- **NFR-04 (20 concurrent attempts): met.** In the burst run all 20 sandboxes were running at once, every request
  succeeded and every test run finished, at well under the 30-second limit.
- **NFR-02 (ready in under 10 s, > 95% success): met for a realistic lab, not for a simultaneous burst.** Three warm
  containers answer instantly; the rest are created on demand. Docker Desktop on Windows creates roughly one
  container per second, so 17 cold starts in the same second queue up behind each other (about 20 s). When the
  same 20 learners arrive over a minute, as when a class opens the lab, the warm pool refills between arrivals and
  every start takes under a second.
- A run with a larger pool (`SANDBOX_POOL_SIZE=10` for every scenario) was _slower_: warming 40 containers competes
  with the learners' own starts on an 8 GB laptop. **3 per scenario is the right setting for this machine.**

## Mitigation for the demo and the pilot

- Let learners start a minute apart, or start in two halves (`docs/DEMO.md`, Phase 6C).
- Keep `SANDBOX_POOL_SIZE=3`. On a Linux server Docker creates containers several times faster; the same burst is
  expected to meet the 10-second target there.

## Re-running

```bash
pnpm --filter @prodlike/api build
SANDBOX_MAX_ACTIVE=20 SANDBOX_POOL_SIZE=3 AUTH_RATE_LIMIT=1000 node apps/api/dist/main.js   # plus the usual env
BASE_URL=http://host.docker.internal:4000 VUS=20 PROFILE=lab pnpm load:test
BASE_URL=http://host.docker.internal:4000 VUS=20 PROFILE=burst pnpm load:test
```
