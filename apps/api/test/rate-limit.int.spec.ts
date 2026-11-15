import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, describeDb } from './helpers';

// Separate file: the auth limit is read when the controller module loads (NFR-13).
describeDb('Rate limiting on credential endpoints (NFR-13)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp({ AUTH_RATE_LIMIT: '3' }));
  });
  afterAll(() => app.close());

  it('returns 429 RATE_LIMITED after too many login attempts', async () => {
    const attempt = () =>
      request(app.getHttpServer()).post('/auth/login').send({ email: 'x@y.co', password: 'nope-nope-nope' });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ code: 'RATE_LIMITED', action: expect.stringMatching(/minute/) });
  });

  it('does not limit ordinary reads at the same rate', async () => {
    for (let i = 0; i < 10; i++) await request(app.getHttpServer()).get('/scenarios').expect(200);
  });
});
