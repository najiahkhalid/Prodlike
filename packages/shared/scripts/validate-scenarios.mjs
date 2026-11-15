// Validates every scenarios/<slug>/ folder; exits with code 1 on any error (used in CI).
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { loadAllScenarios } = require('../dist/node.js');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scenarios');

let failed = 0;
for (const r of loadAllScenarios(root)) {
  const name = r.dir.split(/[\\/]/).pop();
  if (r.ok) {
    console.log(`OK    ${name}  (${r.scenario.title})`);
  } else {
    failed++;
    console.error(`FAIL  ${name}`);
    for (const e of r.errors) console.error(`        - ${e}`);
  }
}
process.exit(failed ? 1 : 0);
