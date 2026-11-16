import { z } from 'zod';
import { DIFFICULTIES, type Scenario, type Skill } from './scenario/schema';

/** Query parameters for GET /scenarios (FR-03). */
export const CatalogueQuerySchema = z.object({
  difficulty: z.enum(DIFFICULTIES).optional(),
  skill: z.string().trim().max(40).optional(),
  q: z.string().trim().max(80).optional(),
});
export type CatalogueQuery = z.input<typeof CatalogueQuerySchema>;

/** One card in the scenario catalogue. */
export interface ScenarioSummary {
  slug: string;
  title: string;
  summary: string;
  difficulty: Scenario['difficulty'];
  skills: string[];
  estimatedMinutes: number;
  company: string;
  guestDemo: boolean;
  published: boolean;
  /** The caller's best score so far, or null if never attempted (filled from Phase 4). */
  bestScore: number | null;
}

export interface CatalogueResponse {
  items: ScenarioSummary[];
  /** All skills across published scenarios, for the filter chips. */
  skills: string[];
}

/**
 * The scenario brief shown before an attempt (FR-04). It deliberately contains NO hidden data:
 * no faults, no hidden tests, no check details, no hint text, no debrief rules.
 */
export interface ScenarioBrief {
  slug: string;
  title: string;
  summary: string;
  difficulty: Scenario['difficulty'];
  skills: string[];
  estimatedMinutes: number;
  guestDemo: boolean;
  company: Scenario['company'];
  brief: Scenario['brief'];
  terminalCommands: string[];
  rubric: { id: string; label: string; skill: Skill; weight: number }[];
  hintPenalty: number;
  hintCount: number;
}

/** The folder a scenario's files live in: its own, or the one a Builder variant is based on. */
export function sourceSlug(s: { slug: string; basedOn?: string }): string {
  return s.basedOn ?? s.slug;
}

/** Reduce a full scenario to the safe, public brief. */
export function toBrief(s: Scenario): ScenarioBrief {
  return {
    slug: s.slug,
    title: s.title,
    summary: s.summary,
    difficulty: s.difficulty,
    skills: s.skills,
    estimatedMinutes: s.estimatedMinutes,
    guestDemo: s.guestDemo,
    company: s.company,
    brief: s.brief,
    terminalCommands: s.terminal.allow.map((c) => c.command),
    rubric: s.rubric.map((r) => ({ id: r.id, label: r.label, skill: r.skill, weight: r.weight })),
    hintPenalty: s.hintPenalty,
    hintCount: s.hints.length,
  };
}
