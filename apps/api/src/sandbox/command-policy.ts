/**
 * Terminal command policy (FR-06, ADR-005). There is no shell in the sandbox: a command line is
 * split into argv here, checked against the scenario's allowlist, then executed directly.
 */

export type CommandDecision =
  | { kind: 'exec'; argv: string[] }
  /** Handled by the scenario engine, not the sandbox (logs, rollback). */
  | { kind: 'engine'; name: string; args: string[] }
  | { kind: 'denied'; reason: string };

/** Commands that act on simulated production; they exist only through the engine. */
export const ENGINE_COMMANDS = ['logs', 'rollback'] as const;

/** Flags that would hang the sandbox or escape the read-only rules. */
const BLOCKED_ARGS = [/^--watch/, /^--watchAll/, /^-w$/, /^--exec/, /^-c$/, /^--upload-pack/, /^--output/];

const SHELL_CHARS = /[;&|`$<>\\]/;

/** Split a command line like a simple shell would: spaces separate, quotes group. */
export function parseCommandLine(line: string): string[] | null {
  const argv: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let inToken = false;
  for (const ch of line.trim()) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inToken = true;
    } else if (/\s/.test(ch)) {
      if (inToken) argv.push(cur);
      cur = '';
      inToken = false;
    } else {
      cur += ch;
      inToken = true;
    }
  }
  if (quote) return null; // unbalanced quotes
  if (inToken) argv.push(cur);
  return argv;
}

/**
 * Decide what to do with a command line.
 * @param allow the scenario's allowlist, e.g. ["npm test", "git diff", "git log", "logs", "rollback"]
 */
export function decideCommand(line: string, allow: string[]): CommandDecision {
  if (SHELL_CHARS.test(line)) {
    return {
      kind: 'denied',
      reason: 'Pipes, redirects and shell operators are not available in this sandbox.',
    };
  }
  const argv = parseCommandLine(line);
  if (!argv || argv.length === 0) return { kind: 'denied', reason: 'Could not read that command.' };

  const match = allow
    .map((a) => a.trim().split(/\s+/))
    .sort((a, b) => b.length - a.length) // most specific first
    .find((prefix) => prefix.every((word, i) => argv[i] === word));

  if (!match) {
    return {
      kind: 'denied',
      reason: `"${argv[0]}${argv[1] && !argv[1].startsWith('-') ? ` ${argv[1]}` : ''}" is not permitted here.`,
    };
  }
  const bad = argv.slice(match.length).find((arg) => BLOCKED_ARGS.some((re) => re.test(arg)));
  if (bad) return { kind: 'denied', reason: `The option "${bad}" is not permitted here.` };

  if ((ENGINE_COMMANDS as readonly string[]).includes(argv[0])) {
    return { kind: 'engine', name: argv[0], args: argv.slice(1) };
  }
  return { kind: 'exec', argv };
}
