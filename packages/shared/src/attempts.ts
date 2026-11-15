import { z } from 'zod';
import type { EngineState } from './events';

/** POST /attempts — start (or resume) an attempt at a scenario (FR-05). */
export const StartAttemptSchema = z.object({ scenario: z.string().min(1).max(80) });
export type StartAttemptInput = z.input<typeof StartAttemptSchema>;

/** PUT /attempts/:id/files — save one file (autosave). */
export const SaveFileSchema = z.object({
  path: z.string().min(1).max(200),
  content: z.string().max(200_000, 'Files are limited to 200 KB'),
});
export type SaveFileInput = z.input<typeof SaveFileSchema>;

/** POST /attempts/:id/commands — run one terminal command line (FR-06). */
export const CommandSchema = z.object({ line: z.string().trim().min(1).max(300) });
export type CommandInput = z.input<typeof CommandSchema>;

export interface WorkspaceFile {
  path: string;
  readOnly: boolean;
  /** Changed compared with the scenario template (shown as "M" in the explorer). */
  modified: boolean;
}

/** Everything the workspace page needs to render an attempt. */
export interface AttemptView {
  id: string;
  state: EngineState;
  startedAt: string;
  scenario: {
    slug: string;
    title: string;
    ticketId: string;
    ticketTitle: string;
    company: string;
    entryFile: string;
    terminalCommands: { command: string; description: string }[];
  };
  files: WorkspaceFile[];
  /** Lifecycle steps reached so far: understand, change, test, ship, recover. */
  progress: { changed: boolean; testsPassed: boolean };
  /** Milliseconds the sandbox took to become ready (NFR-02), when it was just provisioned. */
  provisionedInMs?: number;
}

export interface CommandResult {
  line: string;
  allowed: boolean;
  exitCode: number | null;
  /** Combined stdout + stderr, may contain ANSI colour codes. */
  output: string;
  durationMs: number;
  /** Output was cut at the size limit. */
  truncated: boolean;
}

export interface TestCase {
  name: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped';
  /** First lines of the failure message, ANSI-free. */
  failure?: string;
}

/** POST /attempts/:id/tests — structured result of the scenario test suite (FR-07). */
export interface TestRunResult {
  passed: number;
  failed: number;
  total: number;
  durationMs: number;
  cases: TestCase[];
  /** Raw runner output (ANSI), for the terminal-style view. */
  output: string;
}
