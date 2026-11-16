import type { INestApplication } from '@nestjs/common';
import type { AttemptView, Debrief, EngineSnapshot, HintResult, ProgressResponse } from '@prodlike/shared';
import request, { type Agent } from 'supertest';
import { SandboxReaper } from '../src/attempts/sandbox-reaper.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SandboxService } from '../src/sandbox/sandbox.service';
import { TEST_DB, createTestApp, createUser } from './helpers';

/**
 * Phase 4 on real Docker: hidden-test scoring, debrief, badges, hints, progress, guest demo.
 * FR-13..FR-16, A2 refinements 1 (guest demo) and 3 (hints).
 */
const run = TEST_DB && process.env.SANDBOX_TESTS === '1' ? describe : describe.skip;
jest.setTimeout(150_000);

const FIX = (s: string) => s.replace('order.total > DISCOUNT_THRESHOLD', 'order.total >= DISCOUNT_THRESHOLD');
const ALT_FIX = (s: string) =>
  s.replace('order.total > DISCOUNT_THRESHOLD', '!(order.total < DISCOUNT_THRESHOLD)');
const FIX_ENV = (s: string) => s.replace('PAYMENT_TIMEOUT_MS=50', 'PAYMENT_TIMEOUT_MS=5000');
const BOUNDARY = `\ntest('exactly 1000', () => { expect(applyDiscount({ total: 1000 })).toBe(900); });\n`;

run('Scoring, debrief and progress (Phase 4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ SANDBOX_POOL_SIZE: '1', ENGINE_TIME_SCALE: '0.25' }));
    for (const who of ['ali', 'sara', 'eve', 'other']) await createUser(prisma, 'LEARNER', `${who}@x.co`);
  });
  afterAll(async () => {
    const sandbox = app.get(SandboxService);
    const live = await prisma.attempt.findMany({ where: { containerId: { not: null } } });
    await Promise.all(live.map((a) => sandbox.destroy(a.containerId)));
    await app.close();
  });

  const login = async (email: string) => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email, password: 'password-123' }).expect(200);
    return agent;
  };
  const engineOf = async (a: Agent, id: string): Promise<EngineSnapshot> =>
    ((await a.get(`/attempts/${id}`).expect(200)).body as AttemptView).engine;
  async function waitFor(a: Agent, id: string, ok: (s: EngineSnapshot) => boolean, ms = 60_000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const s = await engineOf(a, id);
      if (ok(s)) return s;
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error('timed out waiting for engine state');
  }
  async function edit(a: Agent, id: string, path: string, change: (s: string) => string) {
    const cur = (await a.get(`/attempts/${id}/file`).query({ path })).body.content as string;
    await a
      .put(`/attempts/${id}/files`)
      .send({ path, content: change(cur) })
      .expect(200);
  }
  const cmd = (a: Agent, id: string, line: string) =>
    a.post(`/attempts/${id}/commands`).send({ line }).expect(200);
  const start = async (a: Agent) =>
    (await a.post('/attempts').send({ scenario: 'discount-bug' }).expect(201)).body.id as string;
  async function deployIncidentRollback(a: Agent, id: string, strategy: 'direct' | 'canary') {
    await a.post(`/attempts/${id}/deploy`).send({ message: 'ship it', strategy }).expect(202);
    await waitFor(a, id, (s) => s.state === 'INCIDENT_ACTIVE');
    await cmd(a, id, 'logs payments');
    await cmd(a, id, 'rollback');
    await waitFor(a, id, (s) => s.state === 'RECOVERED');
  }

  let idealId: string;

  it('an ideal attempt scores 100, earns all three badges and gets only the rollback tip', async () => {
    const ali = await login('ali@x.co');
    idealId = await start(ali);
    await ali.get(`/attempts/${idealId}/debrief`).expect(409); // not finished yet

    await cmd(ali, idealId, 'git log --oneline');
    await edit(ali, idealId, 'tests/discount.test.js', (s) => s + BOUNDARY);
    await edit(ali, idealId, 'src/discount.js', FIX);
    expect((await ali.post(`/attempts/${idealId}/tests`).expect(200)).body).toMatchObject({
      failed: 0,
      total: 3,
    });
    await deployIncidentRollback(ali, idealId, 'canary');

    const d: Debrief = (await ali.post(`/attempts/${idealId}/finish`).expect(200)).body;
    expect(d.score).toBe(100);
    expect(d.rubric.map((r) => [r.id, r.score, r.max])).toEqual([
      ['fix-correct', 30, 30],
      ['boundary-test', 25, 25],
      ['safe-deploy', 20, 20],
      ['recovery-time', 25, 25],
    ]);
    expect(d).toMatchObject({ strategy: 'canary', resolvedBy: 'rollback', attemptNumber: 1, hintsUsed: 0 });
    expect(d.badges.map((b) => [b.id, b.newlyEarned]).sort()).toEqual([
      ['canary-keeper', true],
      ['clean-rollback', true],
      ['edge-case-hunter', true],
    ]);
    expect(d.tips).toHaveLength(1);
    expect(d.tips[0]).toMatch(/Rolling back first was right/);
    expect(d.timeline.map((m) => m.text).join('\n')).toMatch(/canary[\s\S]*ALERT SEV-2[\s\S]*Rolled back/);

    // Stored: same debrief on GET, score + rubric rows persisted, sandbox gone.
    expect((await ali.get(`/attempts/${idealId}/debrief`).expect(200)).body.score).toBe(100);
    const row = await prisma.attempt.findUniqueOrThrow({
      where: { id: idealId },
      include: { rubricResults: true },
    });
    expect(row).toMatchObject({ state: 'COMPLETED', score: 100, containerId: null });
    expect(row.rubricResults).toHaveLength(4);
  });

  it('debriefs are private (404 for anyone else)', async () => {
    const other = await login('other@x.co');
    await other.get(`/attempts/${idealId}/debrief`).expect(404);
  });

  it('any valid fix scores full correctness; hints are context-aware and cost 5 points each', async () => {
    const sara = await login('sara@x.co');
    const id = await start(sara);

    const h1: HintResult = (await sara.post(`/attempts/${id}/hints`).expect(200)).body;
    expect(h1).toMatchObject({ text: expect.stringMatching(/src\/discount\.js/), penalty: 5, used: 1 });
    const h2: HintResult = (await sara.post(`/attempts/${id}/hints`).expect(200)).body;
    expect(h2.text).toMatch(/>=/);

    await edit(sara, id, 'src/discount.js', ALT_FIX);
    await sara.post(`/attempts/${id}/deploy`).send({ message: 'fix', strategy: 'direct' }).expect(202);
    await waitFor(sara, id, (s) => s.state === 'INCIDENT_ACTIVE');
    const h3: HintResult = (await sara.post(`/attempts/${id}/hints`).expect(200)).body;
    expect(h3.text).toMatch(/PAYMENT_TIMEOUT_MS/); // during the incident: the incident hint
    expect((await sara.get(`/attempts/${id}`)).body.hints).toMatchObject({ remaining: 1, penalty: 5 });
    await cmd(sara, id, 'rollback');
    await waitFor(sara, id, (s) => s.state === 'RECOVERED');

    const d: Debrief = (await sara.post(`/attempts/${id}/finish`).expect(200)).body;
    const by = (rid: string) => d.rubric.find((r) => r.id === rid)!.score;
    expect(by('fix-correct')).toBe(30); // !(total < threshold) is just as correct
    expect(by('boundary-test')).toBe(0);
    expect(by('safe-deploy')).toBe(14);
    expect(d).toMatchObject({ rubricTotal: 69, hintsUsed: 3, hintPenalty: 15, score: 54 });
    expect(d.tips.join(' ')).toMatch(/canary/i);
    expect(d.tips.join(' ')).toMatch(/git log/);
  });

  it('shipping without the fix fails the hidden checks', async () => {
    const eve = await login('eve@x.co');
    const id = await start(eve);
    await deployIncidentRollback(eve, id, 'direct');
    const d: Debrief = (await eve.post(`/attempts/${id}/finish`).expect(200)).body;
    const fix = d.rubric.find((r) => r.id === 'fix-correct')!;
    expect(fix.score).toBe(0);
    expect(fix.reason).toMatch(/1 of 5 hidden checks failed/);
  });

  it('a second attempt that prevents the incident counts as attempt 2 with full recovery credit', async () => {
    const ali = await login('ali@x.co');
    const id = await start(ali);
    await edit(ali, id, 'src/discount.js', FIX);
    await edit(ali, id, 'deploy/payments.env', FIX_ENV);
    await ali.post(`/attempts/${id}/deploy`).send({ message: 'fix both', strategy: 'canary' }).expect(202);
    await waitFor(ali, id, (s) => s.canFinish, 30_000);
    const d: Debrief = (await ali.post(`/attempts/${id}/finish`).expect(200)).body;
    expect(d).toMatchObject({ attemptNumber: 2, resolvedBy: 'prevented', timeToRecoverSeconds: null });
    expect(d.rubric.find((r) => r.id === 'recovery-time')!.score).toBe(25);
    expect(d.badges.find((b) => b.id === 'canary-keeper')?.newlyEarned).toBe(false); // already earned
  });

  it('progress history summarises completed attempts, skills and badges (FR-16)', async () => {
    const ali = await login('ali@x.co');
    const p: ProgressResponse = (await ali.get('/me/progress').expect(200)).body;
    expect(p.summary.completed).toBe(2);
    expect(p.attempts).toHaveLength(2);
    expect(p.attempts[0].completedAt >= p.attempts[1].completedAt).toBe(true); // newest first
    expect(p.summary.bestScore).toBe(100);
    expect(p.skills.correctness).toBe(100);
    expect(p.badges.map((b) => b.id).sort()).toEqual(['canary-keeper', 'clean-rollback', 'edge-case-hunter']);
  });

  describe('guest demo (A2 refinement 1)', () => {
    it('a guest can play the demo scenario but nothing else, then keeps it by signing up', async () => {
      const guest = request.agent(app.getHttpServer());
      const me = (await guest.post('/auth/guest').expect(201)).body;
      expect(me).toMatchObject({ role: 'GUEST', name: 'Guest' });
      await guest.get('/instructor/overview').expect(403);

      const attemptId = await start(guest);
      expect((await guest.get(`/attempts/${attemptId}`)).body.guest).toBe(true);

      // Signing up converts the guest account itself: same user, same attempt.
      const reg = await guest
        .post('/auth/register')
        .send({ name: 'Converted Guest', email: 'converted@x.co', password: 'converted-pass-1' })
        .expect(201);
      expect(reg.body).toMatchObject({ id: me.id, role: 'LEARNER', email: 'converted@x.co' });
      const view = (await guest.get(`/attempts/${attemptId}`).expect(200)).body;
      expect(view.guest).toBe(false);
      await guest.post(`/attempts/${attemptId}/end`).expect(200);
    });

    it('guest accounts expire after 24 hours and are removed with their sandboxes', async () => {
      const guest = request.agent(app.getHttpServer());
      const me = (await guest.post('/auth/guest').expect(201)).body;
      await start(guest);
      await prisma.user.update({
        where: { id: me.id },
        data: { guestExpiresAt: new Date(Date.now() - 1000) },
      });
      expect(await app.get(SandboxReaper).removeExpiredGuests()).toBe(1);
      expect(await prisma.user.findUnique({ where: { id: me.id } })).toBeNull();
    });
  });
});
