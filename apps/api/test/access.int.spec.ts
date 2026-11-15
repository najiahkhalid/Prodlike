import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, createUser, describeDb, loginAgent } from './helpers';

describeDb('Role-based access (FR-02) and catalogue (FR-03, FR-04, FR-20)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await createUser(prisma, 'LEARNER', 'learner@x.co');
    await createUser(prisma, 'INSTRUCTOR', 'teacher@x.co');
    await createUser(prisma, 'ADMIN', 'admin@x.co');
  });
  afterAll(() => app.close());

  describe('public endpoints', () => {
    // Regression: /health must stay public behind the global auth guard (Docker + CI depend on it).
    it('GET /health needs no login and reports the database', async () => {
      const res = await http().get('/health').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', checks: { database: 'up' } });
    });
  });

  describe('instructor area', () => {
    it('anonymous -> 401', async () => {
      await http().get('/instructor/overview').expect(401);
    });
    it('learner -> 403 with a helpful message', async () => {
      const learner = await loginAgent(app, 'learner@x.co');
      const res = await learner.get('/instructor/overview').expect(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN', action: expect.stringMatching(/dashboard/) });
    });
    it('instructor and admin -> 200', async () => {
      await (await loginAgent(app, 'teacher@x.co')).get('/instructor/overview').expect(200);
      await (await loginAgent(app, 'admin@x.co')).get('/instructor/overview').expect(200);
    });
  });

  describe('catalogue', () => {
    it('lists the synced scenario publicly, with skills for the filter chips', async () => {
      const res = await http().get('/scenarios').expect(200);
      const slugs = res.body.items.map((s: { slug: string }) => s.slug);
      expect(slugs).toContain('discount-bug');
      expect(res.body.skills).toEqual(expect.arrayContaining(['Bug fix', 'Testing']));
      expect(res.body.items[0]).toMatchObject({ company: 'ByteBite Food Delivery', bestScore: null });
    });

    it('filters by difficulty, skill (case-insensitive) and text', async () => {
      expect((await http().get('/scenarios?difficulty=advanced')).body.items).toHaveLength(0);
      expect((await http().get('/scenarios?difficulty=beginner')).body.items).toHaveLength(1);
      expect((await http().get('/scenarios?skill=testing')).body.items).toHaveLength(1);
      expect((await http().get('/scenarios?skill=kubernetes')).body.items).toHaveLength(0);
      expect((await http().get('/scenarios?q=ByteBite')).body.items).toHaveLength(1);
      await http().get('/scenarios?difficulty=impossible').expect(400);
    });

    it('serves a brief with no hidden data', async () => {
      const res = await http().get('/scenarios/discount-bug').expect(200);
      expect(res.body.brief.ticketId).toBe('BYTE-482');
      expect(res.body.rubric).toHaveLength(4);
      const json = JSON.stringify(res.body);
      for (const secret of [
        'faults',
        'hidden-tests',
        'explainFail',
        'debriefRules',
        'PAYMENT_TIMEOUT_MS=50',
      ]) {
        expect(json).not.toContain(secret);
      }
      const missing = await http().get('/scenarios/does-not-exist').expect(404);
      expect(missing.body.code).toBe('NOT_FOUND');
    });

    it('records the scenario as an immutable version', async () => {
      const versions = await prisma.scenarioVersion.findMany({ include: { scenario: true } });
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({ version: 1, scenario: { slug: 'discount-bug' } });
    });
  });

  describe('publishing (admin only)', () => {
    it('learner cannot publish/unpublish', async () => {
      const learner = await loginAgent(app, 'learner@x.co');
      await learner.patch('/admin/scenarios/discount-bug').send({ published: false }).expect(403);
    });

    it('admin unpublishes: hidden from learners, still visible to admins, then restored', async () => {
      const admin = await loginAgent(app, 'admin@x.co');
      await admin.patch('/admin/scenarios/discount-bug').send({ published: false }).expect(200);

      expect((await http().get('/scenarios')).body.items).toHaveLength(0);
      await http().get('/scenarios/discount-bug').expect(404);
      const adminView = (await admin.get('/scenarios')).body.items;
      expect(adminView).toEqual([expect.objectContaining({ slug: 'discount-bug', published: false })]);

      await admin.patch('/admin/scenarios/discount-bug').send({ published: true }).expect(200);
      expect((await http().get('/scenarios')).body.items).toHaveLength(1);
    });
  });
});
