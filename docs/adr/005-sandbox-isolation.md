# ADR-005: Sandbox isolation

- **Status:** accepted · 2026-11-15

## Context

Learners run arbitrary code. No attempt may affect another learner or the host (NFR-10).

## Decision

One Docker container per attempt, created by the API through the Docker Engine API (dockerode), from the scenario image (`infra/sandbox-base` + `scenarios/<slug>/image`). Containers are started with:

| Setting                  | Value                                                         |
| ------------------------ | ------------------------------------------------------------- |
| User                     | `node` (uid 1000, non-root)                                   |
| Network                  | `none` (dependencies are baked into the image)                |
| Memory / CPU / processes | 512 MB / 1 CPU / 128                                          |
| Capabilities             | all dropped; `no-new-privileges`                              |
| Filesystem               | read-only root; writable `/workspace` volume and `/tmp` tmpfs |

- **No raw shell.** The terminal sends a command line to the API, which checks it against the scenario's allowlist and runs it with `docker exec`, streaming output back.
- Files are read and written through the API (tar archives), never by mounting host paths.
- **Warm pool** of 2–3 pre-created containers per scenario to meet "ready within 10 s" (NFR-02).
- **Reaper** removes containers idle for 60 minutes, finished, or orphaned when the API starts. A configurable concurrency cap: 20 per the SRS, about 8 on a laptop.

## Verification

CI builds the images and checks that the scenario tests pass with these flags, that the process is not root, and that outbound network access fails (`.github/workflows/ci.yml`, job `scenario-images`).
