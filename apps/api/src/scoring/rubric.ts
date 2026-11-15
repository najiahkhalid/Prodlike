import type { RubricScore, Scenario, Skill } from '@prodlike/shared';

/** Everything the rubric is judged on, gathered when the attempt finishes. */
export interface ScoringFacts {
  /** Attempt timeline, oldest first. */
  events: { type: string; at: Date }[];
  /** Current workspace content of every file a `file-matches` check names. */
  files: Record<string, string | undefined>;
  /** Hidden test results per hidden test file. */
  hiddenTests: Record<string, { passed: number; failed: number; total: number; failures: string[] }>;
  incidentHappened: boolean;
  timeToRecoverSeconds: number | null;
  hintsUsed: number;
}

export interface ScoreResult {
  rubric: RubricScore[];
  rubricTotal: number;
  penalty: number;
  /** 0..100 after the hint penalty. */
  score: number;
  skills: Record<Skill, { score: number; max: number }>;
}

/** First time an event of this type happened, or null. */
function firstAt(events: ScoringFacts['events'], type: string): number | null {
  const e = events.find((x) => x.type === type);
  return e ? e.at.getTime() : null;
}

/**
 * Score an attempt against the scenario rubric (FR-14). Checks test BEHAVIOUR (hidden tests),
 * workspace content (regex), what the learner did (events) and how fast service came back
 * (timing), so any valid solution earns full marks.
 */
export function scoreRubric(def: Scenario, facts: ScoringFacts): ScoreResult {
  const rubric: RubricScore[] = def.rubric.map((item) => {
    const full = (reason = item.explainPass) => ({ score: item.weight, reason });
    const part = (fraction: number, reason: string) => ({
      score: Math.round(item.weight * fraction),
      reason,
    });
    const none = (reason = item.explainFail) => ({ score: 0, reason });
    const c = item.check;
    let r: { score: number; reason: string };

    switch (c.type) {
      case 'hidden-tests': {
        const results = c.files.map((f) => facts.hiddenTests[f]);
        if (results.some((x) => !x)) {
          r = none('The hidden checks could not run, so correctness could not be confirmed.');
          break;
        }
        const failed = results.reduce((n, x) => n + x!.failed, 0);
        const total = results.reduce((n, x) => n + x!.total, 0);
        r =
          failed === 0 && total > 0
            ? full()
            : none(`${item.explainFail} (${failed} of ${total} hidden checks failed)`);
        break;
      }
      case 'file-matches': {
        const content = facts.files[c.file];
        r = content !== undefined && new RegExp(c.pattern, 'm').test(content) ? full() : none();
        break;
      }
      case 'event-occurred': {
        const at = firstAt(facts.events, c.event);
        const limit = c.before ? firstAt(facts.events, c.before) : null;
        const ok = at !== null && (limit === null || at <= limit);
        r = ok ? full() : c.otherwise > 0 ? part(c.otherwise, item.explainFail) : none();
        break;
      }
      case 'timing': {
        if (!facts.incidentHappened) {
          r = full('No incident: you prevented it by fixing the cause before shipping.');
          break;
        }
        const t = facts.timeToRecoverSeconds;
        const hit = t === null ? undefined : c.thresholds.find((th) => t <= th.maxSeconds);
        if (hit && hit.fraction === 1) r = full(`${item.explainPass} (${t}s)`);
        else if (hit) r = part(hit.fraction, `${item.explainFail} (${t}s)`);
        else r = part(c.otherwise, t === null ? 'Service was not restored.' : `${item.explainFail} (${t}s)`);
        break;
      }
    }
    return {
      id: item.id,
      label: item.label,
      skill: item.skill,
      score: r.score,
      max: item.weight,
      reason: r.reason,
    };
  });

  const rubricTotal = rubric.reduce((n, r) => n + r.score, 0);
  const penalty = facts.hintsUsed * def.hintPenalty;
  const skills = {
    correctness: { score: 0, max: 0 },
    testing: { score: 0, max: 0 },
    deploymentSafety: { score: 0, max: 0 },
    recovery: { score: 0, max: 0 },
  };
  for (const r of rubric) {
    skills[r.skill].score += r.score;
    skills[r.skill].max += r.max;
  }
  return { rubric, rubricTotal, penalty, score: Math.max(0, Math.min(100, rubricTotal - penalty)), skills };
}
