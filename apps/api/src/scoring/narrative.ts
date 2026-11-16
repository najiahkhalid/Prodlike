import type { Scenario, TimelineMoment } from '@prodlike/shared';

export interface TimelineEvent {
  type: string;
  at: Date;
  payload: Record<string, unknown> | null;
}

const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/**
 * Turn the raw attempt events into the debrief timeline (FR-13, FR-15): only the decisions that
 * mattered, each marked good / warn / bad, in the learner's own clock (seconds since start).
 */
export function buildTimeline(def: Scenario, events: TimelineEvent[]): TimelineMoment[] {
  if (!events.length) return [];
  const start = events[0].at.getTime();
  const out: TimelineMoment[] = [];
  const add = (e: TimelineEvent, kind: TimelineMoment['kind'], text: string) =>
    out.push({ offsetSeconds: Math.max(0, Math.round((e.at.getTime() - start) / 1000)), kind, text });
  const editedOnce = new Set<string>();
  let testsFailedShown = false;

  for (const e of events) {
    const p = e.payload ?? {};
    switch (e.type) {
      case 'attempt.started':
        add(e, 'info', `Opened ticket ${def.brief.ticketId}`);
        break;
      case 'file.saved': {
        const path = str(p.path);
        if (path && !editedOnce.has(path)) {
          editedOnce.add(path);
          add(e, 'info', `Edited ${path}`);
        }
        break;
      }
      case 'tests.run':
        if ((num(p.failed) ?? 0) > 0 && !testsFailedShown) {
          testsFailedShown = true;
          add(e, 'warn', `Ran the tests: ${num(p.failed)} failing`);
        }
        break;
      case 'tests.passed':
        add(e, 'good', `All ${num(p.total) ?? ''} tests passing`);
        break;
      case 'terminal.git-log':
        add(e, 'good', 'Checked the release train with git log');
        break;
      case 'hint.used':
        add(e, 'warn', `Used a hint (−${num(p.penalty) ?? def.hintPenalty})`);
        break;
      case 'pipeline.failed':
        add(e, 'warn', `Pipeline blocked at the ${str(p.stage)} stage: nothing broken was shipped`);
        break;
      case 'deploy.direct':
        add(e, 'warn', `Deployed ${str(p.release)} directly to all traffic`);
        break;
      case 'deploy.canary':
        add(e, 'good', `Deployed ${str(p.release)} as a ${def.deploy.canaryPercent}% canary`);
        break;
      case 'fault.prevented':
        add(e, 'good', 'Prevented the incident: the cause was fixed before shipping');
        break;
      case 'incident.raised': {
        const fault = def.faults.find((f) => f.id === str(p.faultId));
        add(e, 'bad', `ALERT ${fault?.alert.severity ?? ''}: ${fault?.alert.title ?? 'production incident'}`);
        break;
      }
      case 'terminal.logs':
        add(e, 'good', `Investigated the ${str(p.service)} logs`);
        break;
      case 'recovery.rollback':
        add(e, 'good', `Rolled back: service restored in ${num(p.timeToRecoverSeconds)}s`);
        break;
      case 'recovery.hotfix':
        add(e, 'good', `Shipped a hotfix: service restored in ${num(p.timeToRecoverSeconds)}s`);
        break;
      case 'attempt.completed':
        add(e, 'info', 'Finished the attempt');
        break;
    }
  }
  return out;
}

/** Senior-engineer tips (FR-15): the scenario's debrief rules whose condition matches this attempt. */
export function buildTips(def: Scenario, eventTypes: Set<string>): string[] {
  return def.debriefRules
    .filter((r) => {
      const occurred = !r.when.eventOccurred || eventTypes.has(r.when.eventOccurred);
      const missing = !r.when.eventMissing || !eventTypes.has(r.when.eventMissing);
      return occurred && missing;
    })
    .map((r) => r.tip);
}
