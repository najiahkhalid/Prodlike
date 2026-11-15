// Builds the sandbox base image and one image per scenario (ADR-005).
// Usage: pnpm scenarios:build            (all scenarios)
//        pnpm scenarios:build discount-bug
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (args) => {
  console.log(`$ docker ${args.join(' ')}`);
  execFileSync('docker', args, { stdio: 'inherit', cwd: root });
};

run(['build', '-t', 'prodlike/sandbox-base:node20', 'infra/sandbox-base']);

const only = process.argv[2];
const dir = join(root, 'scenarios');
for (const slug of readdirSync(dir)) {
  if (only && slug !== only) continue;
  const ctx = join(dir, slug);
  if (!existsSync(join(ctx, 'image', 'Dockerfile'))) continue;
  run(['build', '-f', join(ctx, 'image', 'Dockerfile'), '-t', `prodlike/scenario-${slug}:latest`, ctx]);
}
console.log('Scenario images built.');
