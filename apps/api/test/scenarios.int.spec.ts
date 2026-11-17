import type { INestApplication } from '@nestjs/common';
import {
  applyEdit,
  variantParams,
  type AttemptView,
  type CohortView,
  type Debrief,
  type EngineSnapshot,
  type Scenario,
  type SolutionEdit,
} from '@prodlike/shared';
import { loadAllScenarios, loadSolutions } from '@prodlike/shared/dist/node';
import { join } from 'node:path';
import request, { type Agent } from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SandboxService } from '../src/sandbox/sandbox.service';
import { TEST_DB, createTestApp, createUser } from './helpers';

/**
 * Phase 6 on real Docker: every reference solution of every scenario (scenarios/<slug>/solutions)
 * is played through the real API, and the debrief must match what the solution expects. This is the
 * proof that any valid fix earns full correctness (FR-14) and that each recovery path works.
 */
const run = TEST_DB && process.env.SANDBOX_TESTS === '1' ? describe : describe.skip;
jest.setTimeout(240_000);

const ROOT = join(__dirname, '..', '..', '..', 'scenarios');
const scenarios = loadAllScenarios(ROOT)
  .filter((r) => r.ok)
  .map((r) => ({ def: r.scenario!, solutions: loadSolutions(r.dir) }));

run('Scenario solutions, played end to end', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users = 0;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ SANDBOX_POOL_SIZE: '1', ENGINE_TIME_SCALE: '0.25' }));
  });
  afterAll(async () => {
    const sandbox = app.get(SandboxService);
    const live = await prisma.attempt.findMany({ where: { containerId: { not: null } } });
    await Promise.all(live.map((a) => sandbox.destroy(a.containerId)));
    await app.close();
  });

  async function newLearner(): Promise<Agent> {
    const email = `learner${++users}@x.co`;
    await createUser(prisma, 'LEARNER', email);
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email, password: 'password-123' }).expect(200);
    return agent;
  }
  const engineOf = async (a: Agent, id: string): Promise<EngineSnapshot> =>
    ((await a.get(`/attempts/${id}`).expect(200)).body as AttemptView).engine;
  async function waitFor(a: Agent, id: string, what: string, ok: (s: EngineSnapshot) => boolean) {
    const end = Date.now() + 90_000;
    let s: EngineSnapshot;
    do {
      s = await engineOf(a, id);
      if (ok(s)) return s;
      await new Promise((r) => setTimeout(r, 300));
    } while (Date.now() < end);
    throw new Error(`timed out waiting for ${what}; engine is ${s.state}`);
  }
  const cmd = async (a: Agent, id: string, line: string) =>
    (await a.post(`/attempts/${id}/commands`).send({ line }).expect(200)).body.output as string;
  async function applyEdits(a: Agent, id: string, edits: SolutionEdit[], params: Record<string, string>) {
    for (const e of edits) {
      const cur = (await a.get(`/attempts/${id}/file`).query({ path: e.file }).expect(200)).body
        .content as string;
      await a
        .put(`/attempts/${id}/files`)
        .send({ path: e.file, content: applyEdit(cur, e, params) })
        .expect(200);
    }
  }

  for (const { def, solutions } of scenarios) {
    describe(def.slug, () => {
      it('has at least two reference solutions', () => {
        expect(solutions.length).toBeGreaterThanOrEqual(2);
      });

      for (const sol of solutions) {
        it(`${sol.file}: ${sol.name}`, async () => {
          const a = await newLearner();
          const attempt: AttemptView = (await a.post('/attempts').send({ scenario: def.slug }).expect(201))
            .body;
          const id = attempt.id;
          const params = variantParams(def as Scenario, null); // no assignment: the first variant

          await applyEdits(a, id, sol.edits, params);
          for (const step of sol.before) {
            if (step === 'git-log') await cmd(a, id, 'git log --oneline');
            else expect((await a.post(`/attempts/${id}/tests`).expect(200)).body.failed).toBe(0);
          }

          await a
            .post(`/attempts/${id}/deploy`)
            .send({ message: sol.name, strategy: sol.deploy })
            .expect(202);
          if (sol.expect.incident) {
            await waitFor(a, id, 'the incident', (s) => s.state === 'INCIDENT_ACTIVE');
          } else {
            await waitFor(a, id, 'a healthy, watched release', (s) => s.canFinish);
            expect((await engineOf(a, id)).incident).toBeNull();
          }

          for (const step of sol.recover) {
            if (step === 'rollback') {
              await cmd(a, id, 'rollback');
            } else {
              await applyEdits(a, id, sol.hotfixEdits, params);
              await a
                .post(`/attempts/${id}/deploy`)
                .send({ message: 'hotfix', strategy: sol.deploy })
                .expect(202);
              await waitFor(a, id, 'recovery by hotfix', (s) => s.state === 'RECOVERED');
            }
          }
          await applyEdits(a, id, sol.afterEdits, params);
          await waitFor(a, id, 'finishable', (s) => s.canFinish);

          const d: Debrief = (await a.post(`/attempts/${id}/finish`).expect(200)).body;
          const correctness = d.rubric.filter((r) => r.skill === 'correctness');
          expect(correctness.map((r) => [r.id, r.score])).toEqual(correctness.map((r) => [r.id, r.max]));
          expect(d.resolvedBy).toBe(sol.expect.resolvedBy);
          if (d.score < sol.expect.minScore) {
            throw new Error(
              `score ${d.score} < ${sol.expect.minScore}:\n${d.rubric.map((r) => `  ${r.id} ${r.score}/${r.max} ${r.reason}`).join('\n')}`,
            );
          }
        });
      }
    });
  }

  it('randomised assignments give each attempt a variant, written into the sandbox and its history', async () => {
    const teacher = request.agent(app.getHttpServer());
    await createUser(prisma, 'INSTRUCTOR', 'teacher@x.co');
    await teacher.post('/auth/login').send({ email: 'teacher@x.co', password: 'password-123' }).expect(200);
    const cohort: CohortView = (
      await teacher.post('/instructor/cohorts').send({ name: 'Variant Lab' }).expect(201)
    ).body;
    await teacher
      .post(`/instructor/cohorts/${cohort.id}/assignments`)
      .send({ scenario: 'missing-env-var', randomiseFaults: true })
      .expect(201);
    const def = scenarios.find((s) => s.def.slug === 'missing-env-var')!.def;

    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const a = await newLearner();
      await a.post('/cohorts/join').send({ code: cohort.joinCode }).expect(200);
      const attempt: AttemptView = (
        await a.post('/attempts').send({ scenario: 'missing-env-var' }).expect(201)
      ).body;
      const row = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
      expect(def.variants.map((v) => v.id)).toContain(row.variantId);
      seen.add(row.variantId!);

      // The sandbox holds this variant's config, folded into the ops-bot commit: nothing to diff.
      const { MISSING_VAR, PRESENT_LINE } = variantParams(def, row.variantId);
      const env = (await a.get(`/attempts/${attempt.id}/file`).query({ path: 'deploy/notifications.env' }))
        .body.content as string;
      expect(env).toContain(PRESENT_LINE);
      expect(env).not.toMatch(new RegExp(`^${MISSING_VAR}=`, 'm'));
      expect(env).not.toContain('{{');
      expect((await cmd(a, attempt.id, 'git diff')).trim()).toBe('');
      expect(await cmd(a, attempt.id, 'git show --stat HEAD')).toContain('rotate SMS gateway secrets');
      expect(attempt.files.find((f) => f.path === 'deploy/notifications.env')?.modified).toBe(false);
      await a.post(`/attempts/${attempt.id}/end`).expect(200);
    }
    // Seeds are random, so 4 attempts are not guaranteed to differ; the pick itself is unit-tested.
    expect(seen.size).toBeGreaterThanOrEqual(1);
  });
});
