import { z } from 'zod';

/**
 * Scenario file format (scenarios/<slug>/scenario.yaml).
 * A scenario is pure data: adding one never requires platform code changes (ADR-002).
 */

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export const NODE_KINDS = ['client', 'gateway', 'service', 'database', 'cache', 'external'] as const;
export const NODE_STATES = ['healthy', 'deploying', 'degraded', 'down'] as const;
export const SKILLS = ['correctness', 'testing', 'deploymentSafety', 'recovery'] as const;
export const DEPLOY_STRATEGIES = ['direct', 'canary'] as const;
export const SEVERITIES = ['SEV-1', 'SEV-2', 'SEV-3'] as const;

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'use lowercase-kebab-case');
const id = z.string().regex(/^[a-z0-9]+([-_.][a-z0-9]+)*$/i, 'use letters, digits, - _ .');
/** Path inside the scenario template, e.g. src/discount.js (no leading slash, no ..). */
const relPath = z.string().regex(/^(?!\/)(?!.*\.\.)[\w./-]+$/, 'must be a relative path inside the template');

export const NodeSchema = z.object({
  id,
  label: z.string().min(1),
  kind: z.enum(NODE_KINDS),
  /** Position on the map grid, shared by the 3D and the 2D view. */
  position: z.object({ x: z.number(), y: z.number() }),
});

export const LogLineSchema = z.object({
  level: z.enum(['INFO', 'WARN', 'ERROR']),
  service: id,
  message: z.string().min(1),
});

export const MetricsSchema = z.object({
  errorRatePct: z.number().min(0).max(100),
  p95LatencyMs: z.number().int().min(0),
  requestsPerSec: z.number().min(0),
});

export const ResolutionSchema = z.discriminatedUnion('type', [
  /** Production is rolled back to the previous release. */
  z.object({ type: z.literal('rollback') }),
  /** A workspace file matches a regex AND a new release is deployed. */
  z.object({ type: z.literal('file-matches-and-redeploy'), file: relPath, pattern: z.string().min(1) }),
]);

const nodeStateMap = z.record(id, z.enum(NODE_STATES));

export const FaultSchema = z.object({
  id,
  trigger: z.object({ after: z.literal('deploy'), delaySeconds: z.number().min(0).max(600) }),
  alert: z.object({ severity: z.enum(SEVERITIES), title: z.string().min(1), service: id }),
  effect: z.object({
    /** Node states while the fault is active, for a direct (100%) deploy. */
    nodes: nodeStateMap,
    metrics: MetricsSchema,
    /** Softer effect when the learner used a canary release. */
    canary: z.object({ nodes: nodeStateMap, metrics: MetricsSchema }).optional(),
    logs: z.array(LogLineSchema).min(1),
  }),
  resolutions: z.array(ResolutionSchema).min(1),
});

export const RubricCheckSchema = z.discriminatedUnion('type', [
  /** Hidden test files (from hidden-tests/) are copied into the sandbox and run at the end. */
  z.object({ type: z.literal('hidden-tests'), files: z.array(z.string().min(1)).min(1) }),
  /** Full weight if a workspace file matches a regex (multiline). */
  z.object({ type: z.literal('file-matches'), file: relPath, pattern: z.string().min(1) }),
  /** Full weight when an engine event occurred (optionally before another event). */
  z.object({
    type: z.literal('event-occurred'),
    event: z.string().min(1),
    before: z.string().min(1).optional(),
    /** Fraction of the weight when the event did not occur (0 to 1). */
    otherwise: z.number().min(0).max(1).default(0),
  }),
  /** Time-to-recover thresholds; the first threshold met gives its fraction of the weight. */
  z.object({
    type: z.literal('timing'),
    metric: z.literal('timeToRecoverSeconds'),
    thresholds: z
      .array(z.object({ maxSeconds: z.number().positive(), fraction: z.number().min(0).max(1) }))
      .min(1),
    otherwise: z.number().min(0).max(1).default(0),
  }),
]);

export const RubricItemSchema = z.object({
  id,
  skill: z.enum(SKILLS),
  weight: z.number().int().positive(),
  label: z.string().min(1),
  check: RubricCheckSchema,
  /** Shown in the debrief: why points were or were not awarded. */
  explainPass: z.string().min(1),
  explainFail: z.string().min(1),
});

export const HintSchema = z.object({
  /** Engine phase in which the hint is offered (the first unused matching hint wins). */
  when: z.enum(['before-tests-pass', 'before-deploy', 'incident-active', 'any']),
  text: z.string().min(1),
});

export const DebriefRuleSchema = z.object({
  id,
  when: z
    .object({ eventOccurred: z.string().optional(), eventMissing: z.string().optional() })
    .refine((w) => Boolean(w.eventOccurred || w.eventMissing), 'needs eventOccurred or eventMissing'),
  tip: z.string().min(1),
});

export const ScenarioSchema = z
  .object({
    schemaVersion: z.literal(1),
    slug,
    title: z.string().min(1),
    summary: z.string().min(1),
    difficulty: z.enum(DIFFICULTIES),
    skills: z.array(z.string().min(1)).min(1),
    estimatedMinutes: z.number().int().positive(),
    guestDemo: z.boolean().default(false),
    company: z.object({ name: z.string().min(1), description: z.string().min(1) }),
    brief: z.object({
      ticketId: z.string().min(1),
      priority: z.enum(['P1', 'P2', 'P3']),
      type: z.enum(['bug', 'feature', 'incident', 'config']),
      reportedBy: z.string().min(1),
      title: z.string().min(1),
      body: z.string().min(1),
      teammateMessage: z.object({ from: z.string(), role: z.string(), text: z.string() }).optional(),
      objectives: z.array(z.string().min(1)).min(1),
      constraints: z.array(z.string().min(1)).default([]),
    }),
    architecture: z.object({
      nodes: z.array(NodeSchema).min(1),
      edges: z.array(z.tuple([id, id])),
    }),
    workspace: z.object({
      /** File opened first in the editor. */
      entryFile: relPath,
      readOnly: z.array(relPath).default([]),
    }),
    terminal: z.object({
      /** Allowed commands: the exact command, or the command followed by arguments. */
      allow: z.array(z.object({ command: z.string().min(1), description: z.string().min(1) })).min(1),
    }),
    pipeline: z.object({
      stages: z
        .array(
          z.object({
            id,
            name: z.string().min(1),
            /** Real command run in the sandbox; null means a simulated stage (deploy). */
            run: z.string().min(1).nullable(),
            simulatedSeconds: z.number().min(0).default(1),
          }),
        )
        .min(1),
    }),
    releases: z.object({ current: z.string().min(1), next: z.string().min(1) }),
    deploy: z.object({
      strategies: z.array(z.enum(DEPLOY_STRATEGIES)).min(1),
      canaryPercent: z.number().int().min(1).max(50).default(10),
    }),
    baselineMetrics: MetricsSchema,
    faults: z.array(FaultSchema).default([]),
    rubric: z.array(RubricItemSchema).min(1),
    hintPenalty: z.number().int().min(0).default(5),
    hints: z.array(HintSchema).default([]),
    debriefRules: z.array(DebriefRuleSchema).default([]),
    /** Randomised variants (anti-copying): parameter sets applied to the template per attempt. */
    variants: z.array(z.object({ id, params: z.record(z.string(), z.string()) })).default([]),
  })
  .superRefine((s, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

    const nodeIds = new Set(s.architecture.nodes.map((n) => n.id));
    if (nodeIds.size !== s.architecture.nodes.length) issue(['architecture', 'nodes'], 'duplicate node id');

    s.architecture.edges.forEach(([a, b], i) => {
      for (const end of [a, b])
        if (!nodeIds.has(end)) issue(['architecture', 'edges', i], `unknown node "${end}"`);
    });

    s.faults.forEach((f, i) => {
      const maps = [f.effect.nodes, ...(f.effect.canary ? [f.effect.canary.nodes] : [])];
      for (const m of maps) {
        for (const n of Object.keys(m))
          if (!nodeIds.has(n)) issue(['faults', i, 'effect'], `unknown node "${n}"`);
      }
      if (!nodeIds.has(f.alert.service))
        issue(['faults', i, 'alert', 'service'], `unknown node "${f.alert.service}"`);
    });

    const total = s.rubric.reduce((sum, r) => sum + r.weight, 0);
    if (total !== 100) issue(['rubric'], `rubric weights must sum to 100 (got ${total})`);

    const seen = new Set<string>();
    s.rubric.forEach((r, i) => {
      if (seen.has(r.id)) issue(['rubric', i, 'id'], 'duplicate rubric id');
      seen.add(r.id);
    });

    if (!s.pipeline.stages.some((st) => st.run === null)) {
      issue(['pipeline', 'stages'], 'needs a simulated deploy stage (run: null)');
    }
  });

export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScenarioInput = z.input<typeof ScenarioSchema>;
export type NodeState = (typeof NODE_STATES)[number];
export type Skill = (typeof SKILLS)[number];
