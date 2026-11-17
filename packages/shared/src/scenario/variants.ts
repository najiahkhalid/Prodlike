import type { Scenario } from './schema';

/**
 * Randomised variants (A1 anti-copying, ADR-010). A scenario lists parameter sets:
 *
 *   variants:
 *     - { id: t50, params: { BAD_TIMEOUT_MS: "50" } }
 *     - { id: t25, params: { BAD_TIMEOUT_MS: "25" } }
 *
 * and uses `{{BAD_TIMEOUT_MS}}` in template files and in scenario.yaml strings (fault logs,
 * alerts, resolution patterns, hints, debrief tips). Each attempt runs one variant.
 */

export const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

/** Placeholder names used in a piece of text. */
export function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1]);
}

/** Replace `{{KEY}}` with its value; unknown keys are left as they are. */
export function renderText(text: string, params: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (whole, key: string) => (key in params ? params[key] : whole));
}

/** The parameters of a variant (empty when the scenario has none or the id is unknown). */
export function variantParams(def: Pick<Scenario, 'variants'>, variantId: string | null | undefined) {
  return def.variants.find((v) => v.id === variantId)?.params ?? def.variants[0]?.params ?? {};
}

/**
 * Which variant an attempt runs. Without randomisation everyone gets the first variant (so practice
 * attempts and tests are predictable); with it, the attempt's seed picks one.
 */
export function pickVariant(
  def: Pick<Scenario, 'variants'>,
  seed: number,
  randomise: boolean,
): string | null {
  if (def.variants.length === 0) return null;
  if (!randomise) return def.variants[0].id;
  return def.variants[Math.abs(seed) % def.variants.length].id;
}

function deepRender<T>(value: T, params: Record<string, string>): T {
  if (typeof value === 'string') return renderText(value, params) as T;
  if (Array.isArray(value)) return value.map((v) => deepRender(v, params)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, k === 'variants' ? v : deepRender(v, params)]),
    ) as T;
  }
  return value;
}

/** The scenario as one variant sees it: every `{{KEY}}` string replaced. */
export function renderScenario(def: Scenario, variantId: string | null | undefined): Scenario {
  if (def.variants.length === 0) return def;
  return deepRender(def, variantParams(def, variantId));
}

/** Placeholders used anywhere in the definition (except the variants list itself). */
export function placeholdersInScenario(def: Scenario): string[] {
  const found = new Set<string>();
  const walk = (v: unknown, key?: string) => {
    if (key === 'variants') return;
    if (typeof v === 'string') placeholdersIn(v).forEach((p) => found.add(p));
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, k));
  };
  walk(def);
  return [...found];
}
