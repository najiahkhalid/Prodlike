import type { INestApplication } from '@nestjs/common';
import type { AttemptView, CommandResult, TestRunResult } from '@prodlike/shared';
import type { Agent } from 'supertest';
import { SandboxReaper } from '../src/attempts/sandbox-reaper.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SandboxService } from '../src/sandbox/sandbox.service';
import { TEST_DB, createTestApp, createUser, loginAgent } from './helpers';

/**
 * Real Docker + the real discount-bug image. Run with SANDBOX_TESTS=1 after `pnpm scenarios:build`.
 * Covers FR-05 (isolated sandbox), FR-06 (restricted terminal), FR-07 (tests), NFR-02, NFR-10, NFR-14.
 */
const run = TEST_DB && process.env.SANDBOX_TESTS === '1' ? describe : describe.skip;
jest.setTimeout(90_000);

const FIXED = (src: string) =>
  src.replace('order.total > DISCOUNT_THRESHOLD', 'order.total >= DISCOUNT_THRESHOLD');
const BOUNDARY_TEST = `
test('applies discount at exactly Rs 1000', () => {
  expect(applyDiscount({ total: 1000 })).toBe(900);
});
`;

run('Sandbox workspace (Phase 2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sandbox: SandboxService;
  let ali: Agent;
  let attempt: AttemptView;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ SANDBOX_POOL_SIZE: '1' }));
    sandbox = app.get(SandboxService);
    await createUser(prisma, 'LEARNER', 'ali@x.co');
    await createUser(prisma, 'LEARNER', 'eve@x.co');
    ali = await loginAgent(app, 'ali@x.co');
  });
  afterAll(async () => {
    const live = await prisma.attempt.findMany({ where: { containerId: { not: null } } });
    await Promise.all(live.map((a) => sandbox.destroy(a.containerId)));
    await app.close();
  });

  it('starts an attempt with a ready sandbox in under 10 s (FR-05, NFR-02)', async () => {
    const res = await ali.post('/attempts').send({ scenario: 'discount-bug' }).expect(201);
    attempt = res.body;
    expect(attempt.state).toBe('READY');
    expect(attempt.provisionedInMs).toBeLessThan(10_000);
    expect(attempt.scenario).toMatchObject({ ticketId: 'BYTE-482', entryFile: 'src/discount.js' });
    const paths = attempt.files.map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining(['src/discount.js', 'tests/discount.test.js', 'package.json']),
    );
    expect(paths.some((p) => p.startsWith('node_modules') || p.startsWith('.git'))).toBe(false);
    expect(attempt.files.find((f) => f.path === 'src/index.js')?.readOnly).toBe(true);
  });

  it('runs the container locked down (NFR-10)', async () => {
    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    const info = await sandbox.docker.getContainer(row.containerId!).inspect();
    expect(info.Config.User).toBe('node');
    expect(info.HostConfig).toMatchObject({
      NetworkMode: 'none',
      ReadonlyRootfs: true,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      Memory: 512 * 1024 * 1024,
      PidsLimit: 128,
    });

    const id = await sandbox.exec(row.containerId!, ['id', '-u']);
    expect(id.output.trim()).toBe('1000');
    const net = await sandbox.exec(row.containerId!, [
      'node', '-e', "require('https').get('https://example.com',()=>process.exit(0)).on('error',()=>process.exit(3))",
    ]); // prettier-ignore
    expect(net.exitCode).toBe(3);
    const rootfs = await sandbox.exec(row.containerId!, ['touch', '/usr/evil']);
    expect(rootfs.exitCode).not.toBe(0);
  });

  it('reads files, and refuses paths outside the workspace', async () => {
    const res = await ali.get(`/attempts/${attempt.id}/file`).query({ path: 'src/discount.js' }).expect(200);
    expect(res.body.content).toContain('order.total > DISCOUNT_THRESHOLD');
    await ali.get(`/attempts/${attempt.id}/file`).query({ path: '../../etc/passwd' }).expect(400);
    await ali.get(`/attempts/${attempt.id}/file`).query({ path: '.hidden-tests/x.js' }).expect(400);
  });

  it('runs the real test suite and returns structured results (FR-07)', async () => {
    const res = await ali.post(`/attempts/${attempt.id}/tests`).expect(200);
    const r: TestRunResult = res.body;
    expect(r).toMatchObject({ passed: 2, failed: 0, total: 2 });
    expect(r.cases.map((c) => c.name)).toContain('no discount below Rs 1000');
    expect(r.durationMs).toBeLessThan(30_000);
  });

  it('saves files; a boundary test exposes the bug, the fix makes it pass', async () => {
    const original = (await ali.get(`/attempts/${attempt.id}/file`).query({ path: 'tests/discount.test.js' }))
      .body.content as string;
    await ali
      .put(`/attempts/${attempt.id}/files`)
      .send({ path: 'tests/discount.test.js', content: original + BOUNDARY_TEST })
      .expect(200);

    const failing: TestRunResult = (await ali.post(`/attempts/${attempt.id}/tests`).expect(200)).body;
    expect(failing).toMatchObject({ passed: 2, failed: 1, total: 3 });
    expect(failing.cases.find((c) => c.status === 'failed')?.failure).toMatch(/Expected: 900/);

    const src = (await ali.get(`/attempts/${attempt.id}/file`).query({ path: 'src/discount.js' })).body
      .content;
    const saved = await ali
      .put(`/attempts/${attempt.id}/files`)
      .send({ path: 'src/discount.js', content: FIXED(src) })
      .expect(200);
    expect(saved.body).toMatchObject({ path: 'src/discount.js', modified: true });

    const passing: TestRunResult = (await ali.post(`/attempts/${attempt.id}/tests`).expect(200)).body;
    expect(passing).toMatchObject({ passed: 3, failed: 0 });

    const view: AttemptView = (await ali.get(`/attempts/${attempt.id}`).expect(200)).body;
    expect(view.progress).toEqual({ changed: true, testsPassed: true });
    expect(view.files.find((f) => f.path === 'src/discount.js')?.modified).toBe(true);
  });

  it('refuses to write read-only files', async () => {
    const res = await ali
      .put(`/attempts/${attempt.id}/files`)
      .send({ path: 'src/index.js', content: 'x' })
      .expect(403);
    expect(res.body.code).toBe('FILE_READ_ONLY');
  });

  it('runs allowlisted commands and refuses everything else (FR-06)', async () => {
    const cmd = async (line: string): Promise<CommandResult> =>
      (await ali.post(`/attempts/${attempt.id}/commands`).send({ line }).expect(200)).body;

    const diff = await cmd('git diff');
    expect(diff).toMatchObject({ allowed: true, exitCode: 0 });
    expect(diff.output).toContain('>= DISCOUNT_THRESHOLD');

    const log = await cmd('git log --oneline');
    expect(log.output).toContain('chore(payments): tune timeout');

    for (const line of ['rm -rf /', 'curl https://example.com', 'npm test; ls', 'npm test -- --watch']) {
      const r = await cmd(line);
      expect(r.allowed).toBe(false);
      expect(r.output).toContain('Allowed commands');
    }
    const logs = await cmd('logs payments');
    expect(logs.output).toMatch(/not deployed to yet/);
  });

  it('starting the same scenario again resumes the attempt', async () => {
    const again = await ali.post('/attempts').send({ scenario: 'discount-bug' }).expect(201);
    expect(again.body.id).toBe(attempt.id);
  });

  it('survives a lost container: a fresh sandbox gets the saved files back (NFR-14)', async () => {
    const before = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    await sandbox.destroy(before.containerId);

    const view: AttemptView = (await ali.get(`/attempts/${attempt.id}`).expect(200)).body;
    expect(view.provisionedInMs).toBeDefined();
    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.containerId).not.toBe(before.containerId);

    const src = await ali.get(`/attempts/${attempt.id}/file`).query({ path: 'src/discount.js' }).expect(200);
    expect(src.body.content).toContain('>= DISCOUNT_THRESHOLD');
  });

  it('hides attempts from other users (404, not 403, so ids reveal nothing)', async () => {
    const eve = await loginAgent(app, 'eve@x.co');
    await eve.get(`/attempts/${attempt.id}`).expect(404);
    await eve.post(`/attempts/${attempt.id}/commands`).send({ line: 'git diff' }).expect(404);
  });

  it('ending an attempt removes its sandbox; further commands are refused', async () => {
    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    await ali.post(`/attempts/${attempt.id}/end`).expect(200);
    expect(await sandbox.isRunning(row.containerId!)).toBe(false);
    const res = await ali.post(`/attempts/${attempt.id}/commands`).send({ line: 'git diff' }).expect(409);
    expect(res.body.code).toBe('ATTEMPT_ENDED');
  });

  it('the reaper abandons idle attempts and removes orphaned containers', async () => {
    const fresh: AttemptView = (await ali.post('/attempts').send({ scenario: 'discount-bug' }).expect(201))
      .body;
    expect(fresh.id).not.toBe(attempt.id);
    await prisma.attempt.update({
      where: { id: fresh.id },
      data: { lastActivityAt: new Date(Date.now() - 2 * 3600_000) },
    });

    const reaper = app.get(SandboxReaper);
    expect(await reaper.sweep()).toBe(1);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: fresh.id } })).state).toBe('ABANDONED');

    const orphan = await sandbox.create('discount-bug');
    expect(await reaper.reconcile()).toBeGreaterThanOrEqual(1);
    expect(await sandbox.isRunning(orphan)).toBe(false);
  });
});
