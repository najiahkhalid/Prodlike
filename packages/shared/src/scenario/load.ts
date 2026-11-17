import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { ScenarioSchema, type Scenario } from './schema';
import { SolutionSchema, type Solution } from './solutions';
import { placeholdersIn, placeholdersInScenario } from './variants';

/** Every file under a folder, as paths relative to it (skips node_modules). */
export function listFiles(dir: string, base = ''): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === '.git') return [];
    const full = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    return statSync(full).isDirectory() ? listFiles(full, rel) : [rel];
  });
}

export interface ScenarioLoadResult {
  dir: string;
  ok: boolean;
  scenario?: Scenario;
  errors: string[];
}

/** Parse and validate one scenario folder, including every file it references. */
export function loadScenarioDir(dir: string): ScenarioLoadResult {
  const file = join(dir, 'scenario.yaml');
  if (!existsSync(file)) return { dir, ok: false, errors: ['missing scenario.yaml'] };

  let raw: unknown;
  try {
    raw = parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { dir, ok: false, errors: [`YAML parse error: ${(e as Error).message}`] };
  }

  const parsed = ScenarioSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      dir,
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }

  const s = parsed.data;
  const errors: string[] = [];
  const template = join(dir, 'template');

  if (!existsSync(join(dir, 'image', 'Dockerfile'))) errors.push('missing image/Dockerfile');
  if (!existsSync(template)) {
    errors.push('missing template/ folder');
  } else {
    const mustExist = [s.workspace.entryFile, ...s.workspace.readOnly];
    for (const r of s.rubric) if (r.check.type === 'file-matches') mustExist.push(r.check.file);
    for (const f of s.faults) {
      for (const res of f.resolutions) if (res.type === 'file-matches-and-redeploy') mustExist.push(res.file);
    }
    for (const p of mustExist)
      if (!existsSync(join(template, p))) errors.push(`template file not found: ${p}`);
  }

  for (const r of s.rubric) {
    if (r.check.type !== 'hidden-tests') continue;
    for (const f of r.check.files) {
      if (!existsSync(join(dir, 'hidden-tests', f))) errors.push(`hidden test not found: hidden-tests/${f}`);
    }
  }

  // Variants: every {{KEY}} used in scenario.yaml or the template must be defined by every variant.
  const used = new Set(placeholdersInScenario(s));
  for (const f of listFiles(template)) {
    placeholdersIn(readFileSync(join(template, f), 'utf8')).forEach((k) => used.add(k));
  }
  if (used.size && s.variants.length === 0) {
    errors.push(
      `placeholders ${[...used].map((k) => `{{${k}}}`).join(', ')} are used but no variants are defined`,
    );
  }
  const ids = new Set<string>();
  for (const v of s.variants) {
    if (ids.has(v.id)) errors.push(`duplicate variant id "${v.id}"`);
    ids.add(v.id);
    for (const k of used) if (!(k in v.params)) errors.push(`variant "${v.id}" does not define {{${k}}}`);
  }

  // Reference solutions must parse (they are played by the API tests and CI).
  try {
    loadSolutions(dir);
  } catch (e) {
    errors.push((e as Error).message);
  }

  const folder = dir.split(/[\\/]/).filter(Boolean).pop();
  if (folder !== s.slug) errors.push(`folder name "${folder}" must equal slug "${s.slug}"`);

  return { dir, ok: errors.length === 0, scenario: s, errors };
}

/** Load every scenario folder under a root such as <repo>/scenarios. */
export function loadAllScenarios(root: string): ScenarioLoadResult[] {
  return readdirSync(root)
    .map((name) => join(root, name))
    .filter((p) => statSync(p).isDirectory())
    .map(loadScenarioDir);
}

/** The reference playthroughs in <scenario>/solutions/*.yaml (ADR-010). */
export function loadSolutions(dir: string): (Solution & { file: string })[] {
  const folder = join(dir, 'solutions');
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f) => {
      const parsed = SolutionSchema.safeParse(parse(readFileSync(join(folder, f), 'utf8')));
      if (!parsed.success) {
        const why = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new Error(`solutions/${f}: ${why}`);
      }
      return { ...parsed.data, file: f };
    });
}
