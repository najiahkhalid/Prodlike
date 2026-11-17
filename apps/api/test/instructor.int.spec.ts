import type { INestApplication } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AssignmentResults, CohortView, MyCohorts, SandboxHealth } from '@prodlike/shared';
import type { Agent } from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, createUser, describeDb, loginAgent } from './helpers';

/** Phase 5: cohorts, assignments, results, CSV, admin, Scenario Builder (FR-17..FR-20, NFR-13). */
describeDb('Instructor & admin (Phase 5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let teacher: Agent;
  let rival: Agent;
  let admin: Agent;
  const learners: Record<string, Agent> = {};
  const ids: Record<string, string> = {};
  let cohort: CohortView;
  let assignmentId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    for (const [key, role, name] of [
      ['teacher', 'INSTRUCTOR', 'Dr Teacher'],
      ['rival', 'INSTRUCTOR', 'Other Teacher'],
      ['admin', 'ADMIN', 'Admin'],
      ['ali', 'LEARNER', 'Ali Raza'],
      ['sara', 'LEARNER', 'Sara Khan'],
      ['zed', 'LEARNER', '=HYPERLINK("http://evil")'],
      ['outsider', 'LEARNER', 'Not In Class'],
    ] as const) {
      const u = await createUser(prisma, role, `${key}@x.co`);
      await prisma.user.update({ where: { id: u.id }, data: { name } });
      ids[key] = u.id;
    }
    teacher = await loginAgent(app, 'teacher@x.co');
    rival = await loginAgent(app, 'rival@x.co');
    admin = await loginAgent(app, 'admin@x.co');
    for (const k of ['ali', 'sara', 'zed', 'outsider']) learners[k] = await loginAgent(app, `${k}@x.co`);
  });
  afterAll(() => app.close());

  describe('cohorts and join codes (FR-17)', () => {
    it('an instructor creates a class with a readable join code', async () => {
      cohort = (await teacher.post('/instructor/cohorts').send({ name: 'BSCS-12 Lab' }).expect(201)).body;
      expect(cohort.joinCode).toMatch(/^[A-HJ-NP-Z]{4}-\d{4}$/);
      await teacher.post('/instructor/cohorts').send({ name: 'x' }).expect(400);
    });

    it('learners join with the code (case-insensitive); bad codes get a helpful error', async () => {
      for (const k of ['ali', 'sara', 'zed']) {
        await learners[k].post('/cohorts/join').send({ code: cohort.joinCode.toLowerCase() }).expect(200);
      }
      const bad = await learners.ali.post('/cohorts/join').send({ code: 'ZZZZ-0000' }).expect(404);
      expect(bad.body).toMatchObject({
        code: 'JOIN_CODE_INVALID',
        action: expect.stringMatching(/instructor/),
      });
      await learners.ali.post('/cohorts/join').send({ code: 'nonsense' }).expect(400);
      await teacher.post('/cohorts/join').send({ code: cohort.joinCode }).expect(409);

      const view: CohortView = (await teacher.get(`/instructor/cohorts/${cohort.id}`).expect(200)).body;
      expect(view.learners.map((l) => l.name).sort()).toEqual([
        '=HYPERLINK("http://evil")',
        'Ali Raza',
        'Sara Khan',
      ]);
    });
  });

  describe('assignments (FR-17)', () => {
    it('assigns a scenario with a deadline; learners see it on their dashboard', async () => {
      const due = new Date(Date.now() + 7 * 86_400_000).toISOString();
      const view: CohortView = (
        await teacher
          .post(`/instructor/cohorts/${cohort.id}/assignments`)
          .send({ scenario: 'discount-bug', dueAt: due })
          .expect(201)
      ).body;
      assignmentId = view.assignments[0].id;
      expect(view.assignments[0]).toMatchObject({
        learners: 3,
        completed: 0,
        scenario: { slug: 'discount-bug' },
      });

      const mine: MyCohorts = (await learners.ali.get('/me/cohorts').expect(200)).body;
      expect(mine.cohorts).toEqual([
        expect.objectContaining({ name: 'BSCS-12 Lab', instructor: 'Dr Teacher' }),
      ]);
      expect(mine.assignments).toEqual([
        expect.objectContaining({
          status: 'todo',
          scenario: expect.objectContaining({ slug: 'discount-bug' }),
        }),
      ]);
    });

    it('refuses duplicates and past deadlines', async () => {
      const dup = await teacher
        .post(`/instructor/cohorts/${cohort.id}/assignments`)
        .send({ scenario: 'discount-bug' })
        .expect(409);
      expect(dup.body.code).toBe('ALREADY_ASSIGNED');
      const past = new Date(Date.now() - 86_400_000).toISOString();
      await teacher
        .post(`/instructor/cohorts/${cohort.id}/assignments`)
        .send({ scenario: 'discount-bug', dueAt: past })
        .expect(400);
    });
  });

  describe('isolation between instructors (NFR-13)', () => {
    it("another instructor gets 404 for this class, its assignments, results, CSV and learners' debriefs", async () => {
      await rival.get(`/instructor/cohorts/${cohort.id}`).expect(404);
      await rival
        .post(`/instructor/cohorts/${cohort.id}/assignments`)
        .send({ scenario: 'discount-bug' })
        .expect(404);
      await rival.get(`/instructor/assignments/${assignmentId}/results`).expect(404);
      await rival.get(`/instructor/assignments/${assignmentId}/results.csv`).expect(404);
      await rival.delete(`/instructor/cohorts/${cohort.id}`).expect(404);
      expect((await rival.get('/instructor/cohorts').expect(200)).body).toEqual([]);
    });

    it('learners cannot use instructor endpoints at all', async () => {
      await learners.ali.get('/instructor/cohorts').expect(403);
    });
  });

  describe('results (FR-18)', () => {
    let resultsAttempt: Record<string, string>;

    beforeAll(async () => {
      // Seed finished attempts directly (the full scoring path is covered by the Docker tests).
      const version = await prisma.scenarioVersion.findFirstOrThrow({
        where: { scenario: { slug: 'discount-bug' } },
      });
      const make = async (
        who: string,
        score: number,
        missedTesting: boolean,
        ttr: number,
        minutesAgo: number,
      ) => {
        const endedAt = new Date(Date.now() - minutesAgo * 60_000);
        const a = await prisma.attempt.create({
          data: {
            userId: ids[who],
            scenarioVersionId: version.id,
            assignmentId,
            state: 'COMPLETED',
            seed: 1,
            score,
            strategy: 'canary',
            startedAt: new Date(endedAt.getTime() - 600_000 + 1),
            endedAt,
            snapshot: {
              debrief: { score, timeToRecoverSeconds: ttr, scenario: { slug: 'discount-bug' } },
            } as Prisma.InputJsonValue,
            rubricResults: {
              create: [
                { checkId: 'fix-correct', skill: 'correctness', score: 30, max: 30, reason: '' },
                {
                  checkId: 'boundary-test',
                  skill: 'testing',
                  score: missedTesting ? 0 : 25,
                  max: 25,
                  reason: '',
                },
              ],
            },
          },
        });
        return a.id;
      };
      // The assignment was created moments ago: make the attempts start after it.
      await prisma.assignment.update({
        where: { id: assignmentId },
        data: { createdAt: new Date(Date.now() - 3600_000) },
      });
      resultsAttempt = {
        ali: await make('ali', 92, false, 40, 5),
        sara: await make('sara', 45, true, 200, 3),
      };
      await make('sara', 30, true, 300, 30); // an earlier, worse attempt: best counts
    });

    it('per-learner best scores, class averages, distribution and common mistakes', async () => {
      const r: AssignmentResults = (
        await teacher.get(`/instructor/assignments/${assignmentId}/results`).expect(200)
      ).body;
      const row = (name: string) => r.rows.find((x) => x.learner.name === name)!;
      expect(row('Ali Raza')).toMatchObject({
        bestScore: 92,
        attempts: 1,
        late: false,
        strategy: 'canary',
        timeToRecoverSeconds: 40,
      });
      expect(row('Sara Khan')).toMatchObject({
        bestScore: 45,
        attempts: 2,
        bestAttemptId: resultsAttempt.sara,
      });
      expect(row('=HYPERLINK("http://evil")')).toMatchObject({ bestScore: null, attempts: 0, late: false });
      expect(r.summary).toMatchObject({
        averageScore: 69,
        completed: 2,
        learners: 3,
        medianTimeToRecoverSeconds: 200,
      });
      expect(r.summary.distribution.find((d) => d.bucket === '90-100')!.count).toBe(1);
      expect(r.summary.distribution.find((d) => d.bucket === '40-49')!.count).toBe(1);
      expect(r.summary.commonMisses[0]).toEqual({ label: 'Boundary case covered by a test', missedBy: 1 });
    });

    it('flags late work once the deadline has passed', async () => {
      await prisma.assignment.update({
        where: { id: assignmentId },
        data: { dueAt: new Date(Date.now() - 4 * 60_000) },
      });
      const r: AssignmentResults = (
        await teacher.get(`/instructor/assignments/${assignmentId}/results`).expect(200)
      ).body;
      const late = Object.fromEntries(r.rows.map((x) => [x.learner.name, x.late]));
      // Ali finished 5 min ago (before the deadline 4 min ago), Sara 3 min ago (after), the third never.
      expect(late).toEqual({ 'Ali Raza': false, 'Sara Khan': true, '=HYPERLINK("http://evil")': true });
      expect((await learners.sara.get('/me/cohorts')).body.assignments[0].status).toBe('late');
    });

    it('exports CSV for the gradebook, neutralising spreadsheet formulas', async () => {
      const res = await teacher.get(`/instructor/assignments/${assignmentId}/results.csv`).expect(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(
        /attachment; filename="BSCS-12-Lab-discount-bug-results\.csv"/,
      );
      const lines = res.text
        .replace(/^\uFEFF/, '')
        .trim()
        .split('\r\n');
      expect(lines[0]).toBe('learner,email,best_score,attempts,completed_at,late,time_to_recover_s,strategy');
      expect(lines).toHaveLength(4);
      expect(lines.find((l) => l.startsWith('Ali Raza'))).toMatch(
        /^Ali Raza,ali@x\.co,92,1,.*,no,40,canary$/,
      );
      // =HYPERLINK(...) must not be executable: prefixed with ' and quoted (it contains quotes).
      expect(lines.find((l) => l.includes('HYPERLINK'))).toMatch(/^"'=HYPERLINK\(""http:\/\/evil""\)",/);
    });

    it("lets the instructor open a learner's debrief, but only for their own classes", async () => {
      const d = (await teacher.get(`/instructor/attempts/${resultsAttempt.ali}/debrief`).expect(200)).body;
      expect(d).toMatchObject({ score: 92, learner: 'Ali Raza' });
      await rival.get(`/instructor/attempts/${resultsAttempt.ali}/debrief`).expect(404);
    });

    it('removing a learner and archiving the class', async () => {
      const after: CohortView = (
        await teacher.delete(`/instructor/cohorts/${cohort.id}/members/${ids.zed}`).expect(200)
      ).body;
      expect(after.learners).toHaveLength(2);
    });
  });

  describe('Scenario Builder (FR-19)', () => {
    const base = {
      basedOn: 'discount-bug',
      title: 'Discount Bug (lab version)',
      ticketTitle: 'Orders of exactly Rs 1,000 are not discounted',
      ticketBody: 'Fix the boundary and prove it with a test. No incident in this lab version.',
      faultsEnabled: false,
      weights: { 'fix-correct': 50, 'boundary-test': 50, 'safe-deploy': 0, 'recovery-time': 0 },
      hintPenalty: 2,
    };
    let slug: string;

    it('validates weights and rubric items', async () => {
      const sum = await teacher
        .post('/instructor/variants')
        .send({ ...base, weights: { 'fix-correct': 60, 'boundary-test': 50 } })
        .expect(400);
      expect(sum.body.message).toMatch(/add up to 100/);
      const unknown = await teacher
        .post('/instructor/variants')
        .send({ ...base, weights: { 'fix-correct': 50, nope: 50 } })
        .expect(400);
      expect(unknown.body.message).toMatch(/Unknown rubric items: nope/);
      await learners.ali.post('/instructor/variants').send(base).expect(403);
    });

    it('creates a private variant the author can see and assign', async () => {
      const v = (await teacher.post('/instructor/variants').send(base).expect(201)).body;
      slug = v.slug;
      expect(v).toMatchObject({ basedOn: 'discount-bug', published: false });
      expect(slug).toMatch(/^discount-bug-v-[a-z0-9]{5}$/);

      const brief = (await teacher.get(`/scenarios/${slug}`).expect(200)).body;
      expect(brief).toMatchObject({ title: 'Discount Bug (lab version)', hintPenalty: 2 });
      expect(brief.rubric.map((r: { weight: number }) => r.weight)).toEqual([50, 50]);
      expect(
        (await teacher.get('/scenarios').expect(200)).body.items.map((s: { slug: string }) => s.slug),
      ).toContain(slug);
      expect((await teacher.get('/instructor/variants').expect(200)).body).toHaveLength(1);
      expect((await rival.get('/instructor/variants').expect(200)).body).toHaveLength(0);
    });

    it('is invisible to learners until it is assigned to their class', async () => {
      await learners.ali.get(`/scenarios/${slug}`).expect(404);
      expect(
        (await learners.ali.get('/scenarios')).body.items.map((s: { slug: string }) => s.slug),
      ).not.toContain(slug);
      await rival.post(`/instructor/cohorts/${cohort.id}/assignments`).send({ scenario: slug }).expect(404);

      await teacher.post(`/instructor/cohorts/${cohort.id}/assignments`).send({ scenario: slug }).expect(201);
      expect((await learners.ali.get(`/scenarios/${slug}`).expect(200)).body.title).toBe(
        'Discount Bug (lab version)',
      );
      await learners.outsider.get(`/scenarios/${slug}`).expect(404);
    });
  });

  describe('admin (FR-20)', () => {
    it('lists and searches users (guests excluded)', async () => {
      await prisma.user.create({ data: { name: 'Guest', role: 'GUEST' } });
      const all = (await admin.get('/admin/users').expect(200)).body;
      expect(all.some((u: { role: string }) => u.role === 'GUEST')).toBe(false);
      const found = (await admin.get('/admin/users?q=sara').expect(200)).body;
      expect(found).toEqual([expect.objectContaining({ name: 'Sara Khan', completedAttempts: 2 })]);
      await teacher.get('/admin/users').expect(403);
    });

    it('changes roles, ends the old sessions, and refuses to change its own role', async () => {
      await admin.patch(`/admin/users/${ids.outsider}/role`).send({ role: 'INSTRUCTOR' }).expect(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.outsider } })).role).toBe('INSTRUCTOR');
      expect(await prisma.refreshToken.count({ where: { userId: ids.outsider, revokedAt: null } })).toBe(0);
      const self = await admin.patch(`/admin/users/${ids.admin}/role`).send({ role: 'LEARNER' }).expect(409);
      expect(self.body.code).toBe('OWN_ROLE');
      await admin.patch(`/admin/users/${ids.ali}/role`).send({ role: 'GUEST' }).expect(400);
    });

    it('reports sandbox health', async () => {
      const h: SandboxHealth = (await admin.get('/admin/sandboxes').expect(200)).body;
      expect(typeof h.docker).toBe('boolean');
      expect(h.images.map((i) => i.slug).sort()).toEqual([
        'discount-bug',
        'free-delivery',
        'friday-deploy',
        'missing-env-var',
      ]); // variants share their base image
      expect(h.maxActive).toBeGreaterThan(0);
      expect(h.attemptsByState.COMPLETED).toBeGreaterThanOrEqual(3);
    });
  });
});
