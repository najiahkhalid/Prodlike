// Pipeline "Migrate (dry run)" stage: checks that every migration is valid SQL-ish text.
// Like many real checks it only looks at syntax, not at how long a statement locks a busy table.
const { readdirSync, readFileSync } = require('fs');
const { join } = require('path');

const dir = join(__dirname, '..', 'db', 'migrations');
let failed = false;
for (const file of readdirSync(dir).sort()) {
  const sql = readFileSync(join(dir, file), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim();
  const ok = sql.length > 0 && sql.endsWith(';') && /^(CREATE|ALTER|DROP|INSERT|UPDATE)\b/i.test(sql);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}`);
  if (!ok) failed = true;
}
console.log(failed ? 'migration check failed' : 'all migrations look valid (dry run)');
process.exit(failed ? 1 : 0);
