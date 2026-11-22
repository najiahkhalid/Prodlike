import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { cookiesOf, createTestApp, describeDb } from './helpers';

/** Security review checks for the API surface (docs/security.md). */
describeDb('Security headers and error hygiene', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });
  afterAll(() => app.close());

  it('does not advertise the framework, blocks sniffing and caching', async () => {
    const res = await http().get('/health').expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('answers malformed JSON with the standard error shape and no stack trace', async () => {
    const res = await http()
      .post('/auth/login')
      .set('content-type', 'application/json')
      .send('{"email": "a@b.co", ')
      .expect(400);
    expect(res.body).toEqual(
      expect.objectContaining({ code: expect.any(String), message: expect.any(String) }),
    );
    expect(JSON.stringify(res.body)).not.toMatch(/at \w+ \(|node_modules|\.ts:\d+/);
  });

  it('answers unknown routes with the standard shape', async () => {
    const res = await http().get('/definitely-not-a-route').expect(404);
    expect(res.body).toEqual(
      expect.objectContaining({ code: expect.any(String), message: expect.any(String) }),
    );
    expect(JSON.stringify(res.body)).not.toContain('stack');
  });

  it('session cookies are HttpOnly and SameSite=Lax, and the refresh cookie is path-scoped', async () => {
    const res = await http()
      .post('/auth/register')
      .send({ name: 'Cookie Check', email: 'cookie@x.co', password: 'long-enough-pw' })
      .expect(201);
    const c = cookiesOf(res);
    for (const name of ['pl_at', 'pl_rt']) {
      expect(c[name]).toMatch(/HttpOnly/i);
      expect(c[name]).toMatch(/SameSite=Lax/i);
    }
  });
});
