import { z } from 'zod';
import { ENGINE_STATES } from './events';

// ---------------------------------------------------------------- cohorts (FR-17)

export const CreateCohortSchema = z.object({
  name: z.string().trim().min(2, 'Give the class a name, e.g. "BSCS-12 Lab"').max(80),
});
export type CreateCohortInput = z.input<typeof CreateCohortSchema>;

/** Join codes look like ABCD-1234: easy to read aloud and type. */
export const JOIN_CODE = /^[A-Z]{4}-\d{4}$/;
export const JoinCohortSchema = z.object({
  code: z.string().trim().toUpperCase().regex(JOIN_CODE, 'Join codes look like ABCD-1234'),
});
export type JoinCohortInput = z.input<typeof JoinCohortSchema>;

export const CreateAssignmentSchema = z.object({
  scenario: z.string().min(1).max(120),
  /** ISO date-time; optional (no deadline). */
  dueAt: z
    .string()
    .datetime({ offset: true, message: 'Pick a valid deadline' })
    .optional()
    .refine((d) => !d || Date.parse(d) > Date.now(), 'The deadline must be in the future'),
  randomiseFaults: z.boolean().default(true),
});
export type CreateAssignmentInput = z.input<typeof CreateAssignmentSchema>;

export interface AssignmentView {
  id: string;
  scenario: { slug: string; title: string; difficulty: string };
  dueAt: string | null;
  createdAt: string;
  learners: number;
  completed: number;
  averageScore: number | null;
}

export interface CohortView {
  id: string;
  name: string;
  joinCode: string;
  createdAt: string;
  learners: { id: string; name: string; email: string | null; joinedAt: string }[];
  assignments: AssignmentView[];
}

export interface ResultRow {
  learner: { id: string; name: string; email: string | null };
  attempts: number;
  bestScore: number | null;
  bestAttemptId: string | null;
  completedAt: string | null;
  /** Completed after the deadline (or not completed and the deadline has passed). */
  late: boolean;
  timeToRecoverSeconds: number | null;
  strategy: 'direct' | 'canary' | null;
}

/** FR-18: results of one assignment, per learner and for the cohort. */
export interface AssignmentResults {
  assignment: AssignmentView;
  cohort: { id: string; name: string };
  rows: ResultRow[];
  summary: {
    averageScore: number | null;
    completed: number;
    learners: number;
    medianTimeToRecoverSeconds: number | null;
    /** Score histogram in 10-point buckets: 0-9 … 90-100. */
    distribution: { bucket: string; count: number }[];
    /** Rubric items most often missed, to show the class's common mistake. */
    commonMisses: { label: string; missedBy: number }[];
  };
}

/** What a learner sees about their classes (dashboard). */
export interface MyCohorts {
  cohorts: { id: string; name: string; instructor: string }[];
  assignments: {
    id: string;
    cohort: string;
    scenario: { slug: string; title: string; difficulty: string };
    dueAt: string | null;
    status: 'todo' | 'done' | 'late';
    bestScore: number | null;
  }[];
}

// ---------------------------------------------------------------- admin (FR-20)

export const ASSIGNABLE_ROLES = ['LEARNER', 'INSTRUCTOR', 'ADMIN'] as const;
export const UpdateRoleSchema = z.object({ role: z.enum(ASSIGNABLE_ROLES) });

export interface AdminUser {
  id: string;
  name: string;
  email: string | null;
  role: string;
  organisation: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  completedAttempts: number;
}

export interface SandboxHealth {
  docker: boolean;
  images: { slug: string; built: boolean }[];
  warmPool: Record<string, number>;
  activeSandboxes: number;
  maxActive: number;
  attemptsByState: Partial<Record<(typeof ENGINE_STATES)[number], number>>;
  provisioning: { last24h: number; averageMs: number | null; slowestMs: number | null };
}

// ---------------------------------------------------------------- scenario builder (FR-19)

export const CreateVariantSchema = z
  .object({
    basedOn: z.string().min(1).max(80),
    title: z.string().trim().min(3).max(100),
    ticketTitle: z.string().trim().min(5).max(200),
    ticketBody: z.string().trim().min(10).max(2000),
    /** Inject the scenario's incident after deploy (off = a pure coding exercise). */
    faultsEnabled: z.boolean(),
    /** Rubric weights by rubric item id; must add up to 100. */
    weights: z.record(z.string(), z.number().int().min(0).max(100)),
    hintPenalty: z.number().int().min(0).max(20),
  })
  .refine((v) => Object.values(v.weights).reduce((a, b) => a + b, 0) === 100, {
    message: 'Rubric weights must add up to 100',
    path: ['weights'],
  });
export type CreateVariantInput = z.input<typeof CreateVariantSchema>;

export interface VariantView {
  slug: string;
  title: string;
  basedOn: string;
  createdAt: string;
  published: boolean;
}
