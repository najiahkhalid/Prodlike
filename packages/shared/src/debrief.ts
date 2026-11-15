import type { Skill } from './scenario/schema';

/** One scored rubric item (FR-14). */
export interface RubricScore {
  id: string;
  label: string;
  skill: Skill;
  score: number;
  max: number;
  /** Why the points were (or were not) awarded. */
  reason: string;
}

export type MomentKind = 'good' | 'warn' | 'bad' | 'info';

/** A key moment on the attempt timeline (FR-13, FR-15). */
export interface TimelineMoment {
  offsetSeconds: number;
  kind: MomentKind;
  text: string;
}

export interface BadgeView {
  id: string;
  name: string;
  description: string;
  /** Earned for the first time in this attempt. */
  newlyEarned: boolean;
}

/** The debrief shown after an attempt (FR-15). Computed once at finish and stored with the attempt. */
export interface Debrief {
  attemptId: string;
  scenario: { slug: string; title: string };
  /** 0–100, after hint penalties. */
  score: number;
  /** Sum of rubric points before penalties. */
  rubricTotal: number;
  hintsUsed: number;
  hintPenalty: number;
  rubric: RubricScore[];
  skills: Record<Skill, { score: number; max: number }>;
  timeline: TimelineMoment[];
  /** "What a senior engineer would do differently". */
  tips: string[];
  badges: BadgeView[];
  /** Seconds from alert to restored service; null when the incident was prevented. */
  timeToRecoverSeconds: number | null;
  totalSeconds: number;
  strategy: 'direct' | 'canary' | null;
  resolvedBy: 'rollback' | 'hotfix' | 'prevented' | null;
  /** Which of the learner's attempts at this scenario this was (1 = first). */
  attemptNumber: number;
  completedAt: string;
  /** Other scenarios worth doing next, weakest skill first. */
  recommendations: { slug: string; title: string; difficulty: string; reason: string }[];
}

/** POST /attempts/:id/hints (A2 refinement 3: hints cost points). */
export interface HintResult {
  index: number;
  text: string;
  penalty: number;
  /** Hints used so far in this attempt (including this one). */
  used: number;
  /** Hints still available. */
  remaining: number;
}

/** GET /me/progress (FR-16). */
export interface ProgressResponse {
  attempts: {
    id: string;
    scenario: { slug: string; title: string };
    score: number;
    completedAt: string;
    timeToRecoverSeconds: number | null;
    strategy: 'direct' | 'canary' | null;
  }[];
  /** Average fraction (0–100) per skill across completed attempts. */
  skills: Record<Skill, number | null>;
  badges: { id: string; name: string; description: string; awardedAt: string }[];
  summary: {
    completed: number;
    averageScore: number | null;
    bestScore: number | null;
    medianTimeToRecoverSeconds: number | null;
    /** Average of the latest 3 minus average of the first 3 (A1 "learning gain"), when there are 4+. */
    improvement: number | null;
  };
}
