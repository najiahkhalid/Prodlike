import type { INestApplication } from '@nestjs/common';
import {
  ATTEMPTS_NAMESPACE,
  SocketEvents,
  type AttemptView,
  type EngineSnapshot,
  type MetricsTickPayload,
} from '@prodlike/shared';
import { io, type Socket } from 'socket.io-client';
import request, { type Agent } from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SandboxService } from '../src/sandbox/sandbox.service';
import { TEST_DB, createTestApp, createUser } from './helpers';

/**
 * Phase 3: the scenario engine end to end, on real Docker, with the clock 4x faster.
 * FR-08 pipeline, FR-09 deploy strategies, FR-10 incidents, FR-11 recovery, FR-12/NFR-03 live events.
 */
const run = TEST_DB && process.env.SANDBOX_TESTS === '1' ? describe : describe.skip;
jest.setTimeout(120_000);

const FIX_DISCOUNT = (src: string) =>
  src.replace('order.total > DISCOUNT_THRESHOLD', 'order.total >= DISCOUNT_THRESHOLD');
const BOUNDARY_TEST = `\ntest('exactly 1000', () => { expect(applyDiscount({ total: 1000 })).toBe(900); });\n`;

run('Scenario engine (Phase 3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ SANDBOX_POOL_SIZE: '1', ENGINE_TIME_SCALE: '0.25' }));
    await app.listen(0);
    baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');
    await createUser(prisma, 'LEARNER', 'ali@x.co');
    await createUser(prisma, 'LEARNER', 'sara@x.co');
    await createUser(prisma, 'LEARNER', 'eve@x.co');
  });
  afterAll(async () => {
    const sandbox = app.get(SandboxService);
    const live = await prisma.attempt.findMany({ where: { containerId: { not: null } } });
    await Promise.all(live.map((a) => sandbox.destroy(a.containerId)));
    await app.close();
  });

  async function login(email: string): Promise<{ agent: Agent; cookie: string }> {
    const agent = request.agent(app.getHttpServer());
    const res = await agent.post('/auth/login').send({ email, password: 'password-123' }).expect(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
    return { agent, cookie };
  }

  async function engineOf(agent: Agent, id: string): Promise<EngineSnapshot> {
    return ((await agent.get(`/attempts/${id}`).expect(200)).body as AttemptView).engine;
  }

  async function waitFor(agent: Agent, id: string, ok: (s: EngineSnapshot) => boolean, ms = 60_000) {
    const end = Date.now() + ms;
    let last: EngineSnapshot | undefined;
    while (Date.now() < end) {
      last = await engineOf(agent, id);
      if (ok(last)) return last;
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(
      `Timed out. Last engine state: ${JSON.stringify(last?.state)} ${JSON.stringify(last?.pipeline?.stages)}`,
    );
  }

  async function edit(agent: Agent, id: string, path: string, change: (s: string) => string) {
    const cur = (await agent.get(`/attempts/${id}/file`).query({ path })).body.content as string;
    await agent
      .put(`/attempts/${id}/files`)
      .send({ path, content: change(cur) })
      .expect(200);
  }

  const cmd = async (agent: Agent, id: string, line: string) =>
    (await agent.post(`/attempts/${id}/commands`).send({ line }).expect(200)).body.output as string;

  describe('learner path: blocked pipeline -> direct deploy -> incident -> rollback -> finish', () => {
    let ali: Agent;
    let id: string;

    beforeAll(async () => {
      ({ agent: ali } = await login('ali@x.co'));
      id = (await ali.post('/attempts').send({ scenario: 'discount-bug' }).expect(201)).body.id;
    });

    it('starts healthy on the current release', async () => {
      const e = await engineOf(ali, id);
      expect(e).toMatchObject({ state: 'READY', release: 'v1.4.1', previousRelease: null, incident: null });
      expect(Object.values(e.nodes).every((s) => s === 'healthy')).toBe(true);
      expect(e.layout.map((n) => n.id)).toContain('payments');
    });

    it('a failing test blocks the deploy (FR-08)', async () => {
      await edit(ali, id, 'tests/discount.test.js', (s) => s + BOUNDARY_TEST);
      const res = await ali
        .post(`/attempts/${id}/deploy`)
        .send({ message: 'add boundary test', strategy: 'direct' });
      expect(res.status).toBe(202);
      expect(res.body.state).toBe('PIPELINE_RUNNING');

      const e = await waitFor(ali, id, (s) => s.state === 'FAILED_PIPELINE');
      expect(e.pipeline!.stages.map((s) => [s.id, s.status])).toEqual([
        ['build', 'passed'],
        ['lint', 'passed'],
        ['test', 'failed'],
        ['deploy', 'skipped'],
      ]);
      expect(e.pipeline!.stages[2].log.join('\n')).toMatch(/exactly 1000/);
      expect(e.release).toBe('v1.4.1');
    });

    it('a second deploy cannot start while one is running', async () => {
      await edit(ali, id, 'src/discount.js', FIX_DISCOUNT);
      await ali
        .post(`/attempts/${id}/deploy`)
        .send({ message: 'fix: include Rs 1000', strategy: 'direct' })
        .expect(202);
      const busy = await ali.post(`/attempts/${id}/deploy`).send({ message: 'again', strategy: 'direct' });
      expect(busy.status).toBe(409);
      expect(busy.body.code).toBe('ENGINE_BUSY');
    });

    it('the fixed release deploys directly (FR-09) and the learner commit is in git log', async () => {
      const e = await waitFor(ali, id, (s) => s.state === 'DEPLOYED' || s.state === 'INCIDENT_ACTIVE');
      expect(e).toMatchObject({ release: 'v1.4.2', previousRelease: 'v1.4.1' });
      expect(e.pipeline!.stages.every((s) => s.status === 'passed')).toBe(true);
      expect(await cmd(ali, id, 'git log --oneline')).toContain('fix: include Rs 1000');
    });

    it('then the injected incident takes payments down (FR-10, FR-12)', async () => {
      const e = await waitFor(ali, id, (s) => s.state === 'INCIDENT_ACTIVE');
      expect(e.incident).toMatchObject({
        severity: 'SEV-2',
        service: 'payments',
        release: 'v1.4.2',
        impactPct: 100,
      });
      expect(e.nodes).toMatchObject({ payments: 'down', gateway: 'degraded', orders: 'healthy' });
      const hot = await waitFor(ali, id, (s) => s.metrics.errorRatePct > 10, 10_000);
      expect(hot.metrics.p95LatencyMs).toBeGreaterThan(500);
    });

    it('logs show the cause; healthy services stay quiet', async () => {
      expect(await cmd(ali, id, 'logs payments')).toContain('ETIMEDOUT after 50ms');
      expect(await cmd(ali, id, 'logs orders')).toMatch(/healthy/);
      expect(await cmd(ali, id, 'logs nosuch')).toMatch(/Unknown service/);
    });

    it('cannot finish while production is broken', async () => {
      const res = await ali.post(`/attempts/${id}/finish`).expect(409);
      expect(res.body.code).toBe('NOT_FINISHED');
    });

    it('rollback restores the previous release and recovers (FR-11)', async () => {
      expect(await cmd(ali, id, 'rollback')).toMatch(/Rolled back production from v1.4.2 to v1.4.1/);
      const e = await waitFor(ali, id, (s) => s.state === 'RECOVERED');
      expect(e.release).toBe('v1.4.1');
      expect(e.incident).toMatchObject({ resolvedBy: 'rollback' });
      expect(e.timeToRecoverSeconds).toEqual(expect.any(Number));
      expect(Object.values(e.nodes).every((s) => s === 'healthy')).toBe(true);
      const types = (await prisma.attemptEvent.findMany({ where: { attemptId: id } })).map((x) => x.type);
      expect(types).toEqual(
        expect.arrayContaining([
          'pipeline.failed',
          'deploy.direct',
          'incident.raised',
          'recovery.rollback',
          'terminal.logs',
        ]),
      );
    });

    it('finishing completes the attempt and frees the sandbox', async () => {
      const res = await ali.post(`/attempts/${id}/finish`).expect(200);
      // Since Phase 4, finishing returns the scored debrief.
      expect(res.body).toMatchObject({ attemptId: id, score: expect.any(Number) });
      const row = await prisma.attempt.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ state: 'COMPLETED', containerId: null });
      expect(row.endedAt).toBeTruthy();
    });
  });

  describe('canary + hotfix path', () => {
    it('a canary limits the impact; a config hotfix resolves the incident', async () => {
      const { agent: sara } = await login('sara@x.co');
      const id = (await sara.post('/attempts').send({ scenario: 'discount-bug' }).expect(201)).body.id;
      await edit(sara, id, 'src/discount.js', FIX_DISCOUNT);
      await sara
        .post(`/attempts/${id}/deploy`)
        .send({ message: 'fix discount', strategy: 'canary' })
        .expect(202);

      let e = await waitFor(sara, id, (s) => s.state === 'INCIDENT_ACTIVE');
      expect(e.incident!.impactPct).toBe(10);
      expect(e.nodes.payments).toBe('degraded');

      // A hotfix that does not touch the cause leaves the incident running.
      await sara.post(`/attempts/${id}/deploy`).send({ message: 'retry', strategy: 'direct' }).expect(202);
      e = await waitFor(sara, id, (s) => s.pipeline?.number === 2 && !!s.pipeline.finishedAt);
      expect(e.state).toBe('INCIDENT_ACTIVE');
      expect(e.release).toBe('v1.4.3');

      await edit(sara, id, 'deploy/payments.env', (s) =>
        s.replace('PAYMENT_TIMEOUT_MS=50', 'PAYMENT_TIMEOUT_MS=5000'),
      );
      await sara
        .post(`/attempts/${id}/deploy`)
        .send({ message: 'fix payments timeout', strategy: 'direct' })
        .expect(202);
      e = await waitFor(sara, id, (s) => s.state === 'RECOVERED');
      expect(e.incident).toMatchObject({ resolvedBy: 'hotfix' });
      expect(e.release).toBe('v1.4.4');
      await sara.post(`/attempts/${id}/end`).expect(200);
    });
  });

  describe('prevention path', () => {
    it('fixing the config before shipping prevents the incident, and the attempt can finish', async () => {
      const { agent: sara } = await login('sara@x.co');
      const id = (await sara.post('/attempts').send({ scenario: 'discount-bug' }).expect(201)).body.id;
      await edit(sara, id, 'src/discount.js', FIX_DISCOUNT);
      await edit(sara, id, 'deploy/payments.env', (s) =>
        s.replace('PAYMENT_TIMEOUT_MS=50', 'PAYMENT_TIMEOUT_MS=5000'),
      );
      await sara.post(`/attempts/${id}/deploy`).send({ message: 'fix both', strategy: 'canary' }).expect(202);
      await waitFor(sara, id, (s) => s.state === 'DEPLOYED');
      await new Promise((r) => setTimeout(r, 2000)); // > the scaled fault delay
      expect((await engineOf(sara, id)).state).toBe('DEPLOYED');
      const types = (await prisma.attemptEvent.findMany({ where: { attemptId: id } })).map((x) => x.type);
      expect(types).toContain('fault.prevented');
      await sara.post(`/attempts/${id}/finish`).expect(200);
    });
  });

  describe('live events over Socket.IO (NFR-03)', () => {
    let sockets: Socket[] = [];
    const connect = (cookie?: string) => {
      const s = io(`${baseUrl}${ATTEMPTS_NAMESPACE}`, {
        transports: ['websocket'],
        extraHeaders: cookie ? { cookie } : {},
        reconnection: false,
      });
      sockets.push(s);
      return s;
    };
    afterEach(() => {
      sockets.forEach((s) => s.disconnect());
      sockets = [];
    });

    it('streams snapshots within a second of a change, plus metrics every second', async () => {
      const { agent: eve, cookie } = await login('eve@x.co');
      const id = (await eve.post('/attempts').send({ scenario: 'discount-bug' }).expect(201)).body.id;
      const socket = connect(cookie);
      const ack = (await socket
        .timeout(5000)
        .emitWithAck(SocketEvents.join, { attemptId: id })) as EngineSnapshot;
      expect(ack).toMatchObject({ attemptId: id, state: 'READY' });

      const metrics = new Promise<MetricsTickPayload>((resolve) =>
        socket.once(SocketEvents.metricsTick, resolve),
      );
      expect((await metrics).attemptId).toBe(id);

      const sent = Date.now();
      const running = new Promise<number>((resolve) =>
        socket.on(
          SocketEvents.snapshot,
          (s: EngineSnapshot) => s.state === 'PIPELINE_RUNNING' && resolve(Date.now()),
        ),
      );
      await eve.post(`/attempts/${id}/deploy`).send({ message: 'ship', strategy: 'direct' }).expect(202);
      expect((await running) - sent).toBeLessThan(1000);
      await waitFor(eve, id, (s) => s.state !== 'PIPELINE_RUNNING');
      await eve.post(`/attempts/${id}/end`).expect(200);
    });

    it("refuses sockets without a session, and rooms of other users' attempts", async () => {
      const { cookie } = await login('sara@x.co');
      const { agent: ali } = await login('ali@x.co');
      const id = (await ali.post('/attempts').send({ scenario: 'discount-bug' }).expect(201)).body.id;

      const anon = connect();
      await new Promise<void>((resolve) => anon.on('disconnect', () => resolve()));

      const other = connect(cookie);
      const ack = await other.timeout(5000).emitWithAck(SocketEvents.join, { attemptId: id });
      expect(ack).toEqual({ error: 'NOT_FOUND' });
      await ali.post(`/attempts/${id}/end`).expect(200);
    });
  });
});
