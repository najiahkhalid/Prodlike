# ADR-006: Workspace editor, terminal and saving work

- **Status:** accepted · 2026-11-15

## Context

Phase 2 builds the Scenario Workspace (FR-05..07). The SRS named Monaco and xterm.js. The demo runs on a laptop that may be offline (ADR-001).

## Decisions

1. **CodeMirror 6 instead of Monaco.** Monaco loads its code and web workers from a CDN by default, and self-hosting it in Next.js needs extra bundler work. CodeMirror 6 is bundled with the app, works offline, and is much smaller. It gives syntax highlighting, line numbers and a read-only mode.
2. **Terminal over HTTP for now.** `POST /attempts/:id/commands` runs one command and returns its output when it finishes. Commands are capped at 30 s, so the learner sees output within a few seconds. Live streaming (Socket.IO) arrives in Phase 3, together with the engine's real-time events (ADR-004). The terminal is a light custom component rather than xterm.js, because it only needs to show output and accept one command line, with colours.
3. **No shell, ever.** A command line is split into arguments and checked against the scenario allowlist (`apps/api/src/sandbox/command-policy.ts`). Pipes, redirects, `$` and `;` are refused, as are `--watch` and similar flags. The command then runs directly with `docker exec`, wrapped in `timeout -s KILL 30`.
4. **Work is saved twice.** Every file save is written into the container AND into `Attempt.snapshot` in Postgres. If a container disappears (reaper, Docker restart, API crash), the next request claims a fresh sandbox and writes the saved files back (NFR-14).
5. **Ownership checks return 404, not 403**, so attempt ids reveal nothing about other users.

## Consequences

- Learners cannot run long-lived processes such as watch mode or servers. Scenarios must be testable with a single `npm test` run.
- Switching to Monaco later stays possible: only `CodeEditor.tsx` would change.
