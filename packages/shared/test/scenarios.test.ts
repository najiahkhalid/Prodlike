import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAllScenarios } from '../src/scenario/load';
import { ScenarioSchema } from '../src/scenario/schema';

const SCENARIOS_ROOT = join(__dirname, '..', '..', '..', 'scenarios');
const results = loadAllScenarios(SCENARIOS_ROOT);

describe('scenario folders in /scenarios', () => {
  it('finds at least one scenario', () => {
    expect(results.length).toBeGreaterThan(0);
  });

  for (const r of results) {
    it(`${r.dir.split(/[\\/]/).pop()} is valid`, () => {
      expect(r.errors).toEqual([]);
    });
  }
});

describe('ScenarioSchema rules', () => {
  const base = results.find((r) => r.ok)!.scenario!;

  it('rejects rubric weights that do not sum to 100', () => {
    const bad = {
      ...base,
      rubric: base.rubric.map((r, i) => (i === 0 ? { ...r, weight: r.weight + 1 } : r)),
    };
    const res = ScenarioSchema.safeParse(bad);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.error?.issues)).toContain('sum to 100');
  });

  it('rejects edges to unknown nodes', () => {
    const bad = { ...base, architecture: { ...base.architecture, edges: [['web', 'ghost']] } };
    expect(ScenarioSchema.safeParse(bad).success).toBe(false);
  });

  it('requires a simulated deploy stage', () => {
    const bad = { ...base, pipeline: { stages: base.pipeline.stages.filter((s) => s.run !== null) } };
    expect(ScenarioSchema.safeParse(bad).success).toBe(false);
  });
});
