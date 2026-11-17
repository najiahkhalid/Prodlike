import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadScenarioDir } from '../src/scenario/load';
import {
  pickVariant,
  placeholdersIn,
  placeholdersInScenario,
  renderScenario,
  renderText,
  variantParams,
} from '../src/scenario/variants';

const discount = loadScenarioDir(join(__dirname, '..', '..', '..', 'scenarios', 'discount-bug')).scenario!;

describe('scenario variants (ADR-010)', () => {
  it('finds and renders placeholders, leaving unknown ones alone', () => {
    expect(placeholdersIn('A={{X}} B={{Y_2}} c={{lower}}')).toEqual(['X', 'Y_2']);
    expect(renderText('A={{X}} B={{Z}}', { X: '1' })).toBe('A=1 B={{Z}}');
  });

  it('without randomisation everyone gets the first variant', () => {
    for (const seed of [0, 1, 2, 99, 12345]) expect(pickVariant(discount, seed, false)).toBe('t50');
  });

  it('with randomisation the seed picks the variant, deterministically', () => {
    const picks = [0, 1, 2].map((seed) => pickVariant(discount, seed, true));
    expect(new Set(picks).size).toBe(3);
    expect(pickVariant(discount, 4, true)).toBe(pickVariant(discount, 4, true));
  });

  it('a scenario without variants has none to pick', () => {
    expect(pickVariant({ variants: [] }, 7, true)).toBeNull();
    expect(variantParams({ variants: [] }, 'x')).toEqual({});
  });

  it('renders every string in the definition except the variants list', () => {
    expect(placeholdersInScenario(discount)).toContain('BAD_TIMEOUT_MS');
    const r = renderScenario(discount, 't25');
    expect(JSON.stringify(r.faults)).toContain('ETIMEDOUT after 25ms');
    expect(placeholdersInScenario(r)).toEqual([]);
    expect(r.variants).toEqual(discount.variants);
    // Unknown variant id falls back to the first variant.
    expect(JSON.stringify(renderScenario(discount, 'nope').faults)).toContain('after 50ms');
  });
});
