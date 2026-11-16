import type { INestApplication } from '@nestjs/common';
import type { AssignmentResults, AttemptView, CohortView, Debrief, EngineSnapshot } from '@prodlike/shared';
import type { Agent } from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SandboxService } from '../src/sandbox/sandbox.service';
import { TEST_DB, createTestApp, createUser, loginAgent } from './helpers';

/**
 * Phase 5 on real Docker: an instructor builds a no-incident variant, assigns it, a learner plays
 * it in the base scenario's sandbox, and the result lands in the instructor's report.
 */
const run = TEST_DB && process.env.SANDBOX_TESTS === '1' ? describe : describe.skip;
jest.setTimeout(150_000);

run('Assigned Scenario Builder variant, end to end', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ SANDBOX_POOL_SIZE: '1', ENGINE_TIME_SCALE: '0.25' }));
    await createUser(prisma, 'INSTRUCTOR', 'teacher@x.co');
    await createUser(prisma, 'LEARNER', 'ali@x.co');
  });
  afterAll(async () => {
    const sandbox = app.get(SandboxService);
    const live = await prisma.attempt.findMany({ where: { containerId: { not: null } } });
    await Promise.all(live.map((a) => sandbox.destroy(a.containerId)));
    await app.close();
  });

  it('variant → assignment → attempt in the base sandbox → scored with the variant rubric → report', async () => {
    const teacher = await loginAgent(app, 'teacher@x.co');
    const ali: Agent = await loginAgent(app, 'ali@x.co');

    const variant = (
      await teacher
        .post('/instructor/variants')
        .send({
          basedOn: 'discount-bug',
          title: 'Discount Bug: code only',
          ticketTitle: 'Fix the Rs 1,000 boundary',
          ticketBody: 'Fix the discount for orders of exactly Rs 1,000 and add a test.',
          faultsEnabled: false,
          weights: { 'fix-correct': 60, 'boundary-test': 40 },
          hintPenalty: 0,
        })
        .expect(201)
    ).body;
    const cohort: CohortView = (await teacher.post('/instructor/cohorts').send({ name: 'Lab 7' }).expect(201))
      .body;
    await ali.post('/cohorts/join').send({ code: cohort.joinCode }).expect(200);
    const assigned: CohortView = (
      await teacher
        .post(`/instructor/cohorts/${cohort.id}/assignments`)
        .send({ scenario: variant.slug })
        .expect(201)
    ).body;
    const assignmentId = assigned.assignments[0].id;

    // The learner starts it: a sandbox from the BASE scenario's image, linked to the assignment.
    const attempt: AttemptView = (await ali.post('/attempts').send({ scenario: variant.slug }).expect(201))
      .body;
    expect(attempt.scenario.title).toBe('Discount Bug: code only');
    expect(attempt.files.map((f) => f.path)).toContain('src/discount.js');
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).assignmentId).toBe(
      assignmentId,
    );

    const edit = async (path: string, change: (s: string) => string) => {
      const cur = (await ali.get(`/attempts/${attempt.id}/file`).query({ path })).body.content as string;
      await ali
        .put(`/attempts/${attempt.id}/files`)
        .send({ path, content: change(cur) })
        .expect(200);
    };
    await edit('src/discount.js', (s) =>
      s.replace('order.total > DISCOUNT_THRESHOLD', 'order.total >= DISCOUNT_THRESHOLD'),
    );
    await edit(
      'tests/discount.test.js',
      (s) => `${s}\ntest('1000', () => { expect(applyDiscount({ total: 1000 })).toBe(900); });\n`,
    );
    await ali.post(`/attempts/${attempt.id}/deploy`).send({ message: 'fix', strategy: 'direct' }).expect(202);

    // No incident in this variant: production stays healthy and the attempt can be finished.
    const end = Date.now() + 60_000;
    let engine: EngineSnapshot;
    do {
      await new Promise((r) => setTimeout(r, 400));
      engine = ((await ali.get(`/attempts/${attempt.id}`)).body as AttemptView).engine;
    } while (!engine.canFinish && Date.now() < end);
    expect(engine).toMatchObject({ state: 'DEPLOYED', incident: null, canFinish: true });

    const d: Debrief = (await ali.post(`/attempts/${attempt.id}/finish`).expect(200)).body;
    expect(d.rubric.map((r) => [r.id, r.score, r.max])).toEqual([
      ['fix-correct', 60, 60],
      ['boundary-test', 40, 40],
    ]);
    expect(d.score).toBe(100);

    const r: AssignmentResults = (
      await teacher.get(`/instructor/assignments/${assignmentId}/results`).expect(200)
    ).body;
    expect(r.rows).toEqual([
      expect.objectContaining({ bestScore: 100, attempts: 1, bestAttemptId: attempt.id }),
    ]);
    expect(r.summary).toMatchObject({ completed: 1, averageScore: 100 });
  });
});
