import { join } from 'node:path';
import { loadScenarioDir } from '@prodlike/shared/dist/node';
import type { Scenario } from '@prodlike/shared';
import { buildTimeline, buildTips } from '../src/scoring/narrative';
import { scoreRubric, type ScoringFacts } from '../src/scoring/rubric';

const def = loadScenarioDir(join(__dirname, '..', '..', '..', 'scenarios', 'discount-bug'))
  .scenario as Scenario;

const t0 = new Date('2026-11-16T10:00:00Z').getTime();
const ev = (type: string, sec: number, payload: Record<string, unknown> | null = null) => ({
  type,
  at: new Date(t0 + sec * 1000),
  payload,
});

const BOUNDARY = "test('exactly 1000', () => { expect(applyDiscount({ total: 1000 })).toBe(900); });";
const facts = (over: Partial<ScoringFacts> = {}): ScoringFacts => ({
  events: [ev('attempt.started', 0), ev('deploy.canary', 200)],
  files: { 'tests/discount.test.js': `existing tests\n${BOUNDARY}\n` },
  hiddenTests: { 'discount.hidden.test.js': { passed: 5, failed: 0, total: 5, failures: [] } },
  incidentHappened: true,
  timeToRecoverSeconds: 45,
  hintsUsed: 0,
  ...over,
});
const by = (r: ReturnType<typeof scoreRubric>, id: string) => r.rubric.find((x) => x.id === id)!;

describe('scoreRubric (FR-14)', () => {
  it('a perfect attempt scores 100', () => {
    const r = scoreRubric(def, facts());
    expect(r.score).toBe(100);
    expect(r.rubric.every((x) => x.score === x.max)).toBe(true);
    expect(r.skills).toEqual({
      correctness: { score: 30, max: 30 },
      testing: { score: 25, max: 25 },
      deploymentSafety: { score: 20, max: 20 },
      recovery: { score: 25, max: 25 },
    });
  });

  it('correctness is all-or-nothing on the hidden checks, and says how many failed', () => {
    const r = scoreRubric(
      def,
      facts({
        hiddenTests: {
          'discount.hidden.test.js': { passed: 4, failed: 1, total: 5, failures: ['total 1000'] },
        },
      }),
    );
    expect(by(r, 'fix-correct')).toMatchObject({
      score: 0,
      reason: expect.stringContaining('1 of 5 hidden checks failed'),
    });
  });

  it('a boundary test that is only a comment does not count', () => {
    const r = scoreRubric(def, facts({ files: { 'tests/discount.test.js': `// ${BOUNDARY}` } }));
    expect(by(r, 'boundary-test').score).toBe(0);
  });

  it('a direct deploy gets partial deployment-safety credit (otherwise = 0.7)', () => {
    const r = scoreRubric(def, facts({ events: [ev('attempt.started', 0), ev('deploy.direct', 100)] }));
    expect(by(r, 'safe-deploy').score).toBe(14);
  });

  it.each([
    [60, 25],
    [120, 25],
    [200, 18], // <= 300 s: 0.7
    [900, 10], // otherwise: 0.4
  ])('recovery in %ps scores %p', (seconds, points) => {
    expect(by(scoreRubric(def, facts({ timeToRecoverSeconds: seconds })), 'recovery-time').score).toBe(
      points,
    );
  });

  it('preventing the incident earns full recovery credit', () => {
    const r = scoreRubric(def, facts({ incidentHappened: false, timeToRecoverSeconds: null }));
    expect(by(r, 'recovery-time')).toMatchObject({ score: 25, reason: expect.stringMatching(/prevented/) });
  });

  it('each hint costs 5 points, and the score never goes below 0', () => {
    expect(scoreRubric(def, facts({ hintsUsed: 2 })).score).toBe(90);
    const none = scoreRubric(def, {
      events: [],
      files: {},
      hiddenTests: {},
      incidentHappened: true,
      timeToRecoverSeconds: null,
      hintsUsed: 10, // partial deploy + recovery credit (24) minus 50
    });
    expect(none.rubricTotal).toBe(24);
    expect(none.score).toBe(0);
  });
});

describe('debrief narrative (FR-13, FR-15)', () => {
  const events = [
    ev('attempt.started', 0),
    ev('file.saved', 30, { path: 'src/discount.js' }),
    ev('file.saved', 40, { path: 'src/discount.js' }),
    ev('tests.run', 60, { passed: 2, failed: 1, total: 3 }),
    ev('tests.passed', 90, { total: 3 }),
    ev('deploy.direct', 120, { release: 'v1.4.2' }),
    ev('incident.raised', 125, { faultId: 'payments-timeout' }),
    ev('terminal.logs', 140, { service: 'payments' }),
    ev('recovery.rollback', 160, { timeToRecoverSeconds: 35 }),
    ev('attempt.completed', 170),
  ];

  it('marks good, risky and bad decisions on the learner clock', () => {
    const t = buildTimeline(def, events);
    expect(t.map((m) => [m.offsetSeconds, m.kind])).toEqual([
      [0, 'info'],
      [30, 'info'], // first edit only
      [60, 'warn'],
      [90, 'good'],
      [120, 'warn'], // direct deploy
      [125, 'bad'],
      [140, 'good'],
      [160, 'good'],
      [170, 'info'],
    ]);
    expect(t[5].text).toMatch(/SEV-2/);
  });

  it('shows the matching senior-engineer tips', () => {
    const tips = buildTips(def, new Set(events.map((e) => e.type).concat('recovery.rollback')));
    expect(tips.join(' ')).toMatch(/canary/i);
    expect(tips.join(' ')).toMatch(/git log/);
    expect(tips.join(' ')).toMatch(/Rolling back first was right/);
    const ideal = buildTips(def, new Set(['deploy.canary', 'terminal.git-log']));
    expect(ideal).toEqual([]);
  });
});
