// Checks every built scenario image (CI job "scenario-images", ADR-010). For each scenario:
//   1. the learner's visible tests PASS in a locked-down sandbox (the bug hides at an edge);
//   2. the hidden tests FAIL on the original code (they really catch the bug);
//   3. the hidden tests PASS after each reference solution's edits (any valid fix earns full marks);
//   4. the sandbox runs as non-root with no network, and git log tells the release-train story.
// Usage: node infra/scripts/check-scenarios.mjs [slug]   (after pnpm scenarios:build)
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(root, 'packages', 'shared', 'package.json'));
const { loadScenarioDir, loadSolutions } = require('./dist/node.js');
const { applyEdit, renderText, variantParams } = require('./dist/index.js');

const LOCKED = [
  '--network',
  'none',
  '--cap-drop',
  'ALL',
  '--security-opt',
  'no-new-privileges',
  '--memory',
  '512m',
  '--pids-limit',
  '128',
];

function docker(args, input) {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const ansi = new RegExp(`${String.fromCharCode(27)}\[[0-9;]*m`, 'g');
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.replace(ansi, '');
  return { code: r.status ?? 1, out };
}

/** Writes files into a throwaway container, then runs a command (no shell inside the sandbox). */
const RUNNER = `
const fs = require('fs'), path = require('path'), cp = require('child_process');
const job = JSON.parse(fs.readFileSync(0, 'utf8'));
for (const [p, c] of Object.entries(job.files)) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, c);
}
const r = cp.spawnSync(job.cmd[0], job.cmd.slice(1), { encoding: 'utf8' });
process.stdout.write((r.stdout || '') + (r.stderr || ''));
process.exit(r.status === null ? 1 : r.status);
`;

function runWith(image, files, cmd) {
  return docker(
    ['run', '--rm', '-i', ...LOCKED, image, 'node', '-e', RUNNER],
    JSON.stringify({ files, cmd }),
  );
}

const only = process.argv[2];
let failures = 0;
const fail = (slug, msg, out = '') => {
  failures++;
  console.error(`  ✗ ${msg}`);
  if (out)
    console.error(
      out
        .split('\n')
        .slice(-25)
        .map((l) => `      ${l}`)
        .join('\n'),
    );
};

for (const slug of readdirSync(join(root, 'scenarios'))) {
  if (only && slug !== only) continue;
  const dir = join(root, 'scenarios', slug);
  if (!existsSync(join(dir, 'image', 'Dockerfile'))) continue;
  const { ok, scenario: def, errors } = loadScenarioDir(dir);
  console.log(`\n${slug}`);
  if (!ok) {
    fail(slug, `invalid scenario: ${errors.join('; ')}`);
    continue;
  }
  const image = `prodlike/scenario-${slug}:latest`;
  const hiddenFiles = def.rubric.flatMap((r) => (r.check.type === 'hidden-tests' ? r.check.files : []));
  const hidden = Object.fromEntries(
    hiddenFiles.map((f) => [`.hidden-tests/${f}`, readFileSync(join(dir, 'hidden-tests', f), 'utf8')]),
  );
  const jestHidden = ['node_modules/.bin/jest', '--ci', '--runTestsByPath', ...Object.keys(hidden)];

  // 1. Visible tests pass in a read-only, locked-down sandbox.
  const visible = docker(['run', '--rm', ...LOCKED, '--read-only', '--tmpfs', '/tmp', image, 'npm', 'test']);
  if (visible.code === 0) console.log('  ✓ learner tests pass on the starting code');
  else fail(slug, 'learner tests fail on the starting code', visible.out);

  // 2. Hidden tests catch the bug.
  const original = runWith(image, hidden, jestHidden);
  if (original.code !== 0 && /Tests:\s+\d+ failed/.test(original.out))
    console.log('  ✓ hidden tests fail on the starting code');
  else fail(slug, 'hidden tests did not catch the bug on the starting code', original.out);

  // 3. Every reference solution passes the hidden tests (first variant, like an unassigned attempt).
  const params = variantParams(def, null);
  for (const sol of loadSolutions(dir)) {
    try {
      const files = { ...hidden };
      for (const edit of [...sol.edits, ...sol.hotfixEdits, ...sol.afterEdits]) {
        const path = edit.file;
        const current = files[path] ?? renderText(readFileSync(join(dir, 'template', path), 'utf8'), params);
        files[path] = applyEdit(current, edit, params);
      }
      const r = runWith(image, files, jestHidden);
      if (r.code === 0) console.log(`  ✓ solution "${sol.name}" passes the hidden tests`);
      else fail(slug, `solution "${sol.name}" fails the hidden tests`, r.out);
      const own = runWith(image, files, ['npm', 'test']);
      if (own.code !== 0) fail(slug, `solution "${sol.name}" fails its own visible tests`, own.out);
    } catch (e) {
      fail(slug, `solution "${sol.name}": ${e.message}`);
    }
  }

  // 4. Isolation and history.
  const who = docker(['run', '--rm', ...LOCKED, image, 'id', '-u']);
  if (who.code === 0 && who.out.trim() !== '0') console.log('  ✓ runs as a non-root user');
  else fail(slug, 'sandbox runs as root', who.out);
  const net = docker([
    'run',
    '--rm',
    ...LOCKED,
    image,
    'node',
    '-e',
    "require('https').get('https://example.com', () => process.exit(0)).on('error', () => process.exit(3))",
  ]);
  if (net.code === 3) console.log('  ✓ has no network');
  else fail(slug, 'sandbox reached the network', net.out);
  const log = docker(['run', '--rm', ...LOCKED, image, 'git', 'log', '--oneline']);
  if (log.code === 0 && log.out.trim().split('\n').length >= 3)
    console.log('  ✓ git log tells the release-train story');
  else fail(slug, 'seeded git history is missing', log.out);
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll scenario checks passed.');
process.exit(failures ? 1 : 0);
