import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { cookiesOf, createTestApp, describeDb } from './helpers';

describeDb('Auth (FR-01, NFR-11)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: { outbox: { to: string; text: string }[] };
  const http = () => request(app.getHttpServer());
  const ali = {
    name: 'Ali Raza',
    email: 'ali@seecs.edu.pk',
    password: 'correct-horse-1',
    organisation: 'NUST SEECS',
  };

  beforeAll(async () => {
    ({ app, prisma, mail } = await createTestApp());
  });
  afterAll(() => app.close());

  it('registers a learner, sets httpOnly session cookies, never returns the hash', async () => {
    const res = await http().post('/auth/register').send(ali).expect(201);
    expect(res.body).toMatchObject({
      name: 'Ali Raza',
      email: 'ali@seecs.edu.pk',
      role: 'LEARNER',
      onboarded: false,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[ab]\$/);

    const c = cookiesOf(res);
    expect(c.pl_at).toMatch(/HttpOnly/);
    expect(c.pl_rt).toMatch(/HttpOnly/);
    expect(c.pl_at).toMatch(/SameSite=Lax/);

    const row = await prisma.user.findUniqueOrThrow({ where: { email: ali.email } });
    expect(row.passwordHash).toMatch(/^\$2[ab]\$12\$/); // bcrypt, cost 12
  });

  it('rejects a duplicate email with a helpful 409', async () => {
    const res = await http().post('/auth/register').send(ali).expect(409);
    expect(res.body).toMatchObject({ code: 'EMAIL_TAKEN' });
    expect(res.body.action).toMatch(/Log in/);
  });

  it('validates input and names the failing field (NFR-09)', async () => {
    const res = await http()
      .post('/auth/register')
      .send({ ...ali, email: 'x@y.co', password: 'short' })
      .expect(400);
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: { password: expect.stringMatching(/10/) },
    });
  });

  it('does not allow self-registration as ADMIN', async () => {
    await http()
      .post('/auth/register')
      .send({ ...ali, email: 'eve@x.co', role: 'ADMIN' })
      .expect(400);
  });

  it('logs in, and rejects a wrong password without saying which part was wrong', async () => {
    const bad = await http()
      .post('/auth/login')
      .send({ email: ali.email, password: 'wrong-password' })
      .expect(401);
    expect(bad.body).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect.',
    });
    const unknown = await http()
      .post('/auth/login')
      .send({ email: 'nobody@x.co', password: 'whatever' })
      .expect(401);
    expect(unknown.body.message).toBe(bad.body.message);
    await http()
      .post('/auth/login')
      .send({ email: ' ALI@seecs.edu.pk ', password: ali.password })
      .expect(200);
  });

  it('protects /auth/me and returns the signed-in user', async () => {
    const anon = await http().get('/auth/me').expect(401);
    expect(anon.body.code).toBe('UNAUTHENTICATED');

    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: ali.email, password: ali.password }).expect(200);
    const me = await agent.get('/auth/me').expect(200);
    expect(me.body.email).toBe(ali.email);

    await agent.post('/auth/me/onboarded').expect(200);
    expect((await agent.get('/auth/me')).body.onboarded).toBe(true);
  });

  it('rotates refresh tokens and revokes every session when an old one is replayed', async () => {
    const login = await http()
      .post('/auth/login')
      .send({ email: ali.email, password: ali.password })
      .expect(200);
    const rt1 = cookiesOf(login).pl_rt.split(';')[0];

    const r1 = await http().post('/auth/refresh').set('Cookie', rt1).expect(200);
    const rt2 = cookiesOf(r1).pl_rt.split(';')[0];
    expect(rt2).not.toBe(rt1);

    // Replaying the already-used token looks like theft: it fails AND kills the new token too.
    await http().post('/auth/refresh').set('Cookie', rt1).expect(401);
    await http().post('/auth/refresh').set('Cookie', rt2).expect(401);
  });

  it('logs out: clears cookies and the refresh token stops working', async () => {
    const login = await http()
      .post('/auth/login')
      .send({ email: ali.email, password: ali.password })
      .expect(200);
    const rt = cookiesOf(login).pl_rt.split(';')[0];
    const out = await http().post('/auth/logout').set('Cookie', rt).expect(204);
    expect(cookiesOf(out).pl_at).toMatch(/^pl_at=;.*Max-Age=0/);
    expect(cookiesOf(out).pl_rt).toMatch(/^pl_rt=;.*Max-Age=0/);
    await http().post('/auth/refresh').set('Cookie', rt).expect(401);
  });

  it('resets a forgotten password with a one-time link', async () => {
    const before = mail.outbox.length;
    await http().post('/auth/forgot-password').send({ email: 'nobody@x.co' }).expect(202);
    expect(mail.outbox.length).toBe(before); // unknown email: same response, no mail

    await http().post('/auth/forgot-password').send({ email: ali.email }).expect(202);
    const msg = mail.outbox.at(-1)!;
    expect(msg.to).toBe(ali.email);
    const token = /token=([\w-]+)/.exec(msg.text)![1];

    await http().post('/auth/reset-password').send({ token, password: 'brand-new-pass-2' }).expect(200);
    const reused = await http()
      .post('/auth/reset-password')
      .send({ token, password: 'another-pass-33' })
      .expect(400);
    expect(reused.body.code).toBe('RESET_LINK_INVALID');

    await http().post('/auth/login').send({ email: ali.email, password: ali.password }).expect(401);
    await http().post('/auth/login').send({ email: ali.email, password: 'brand-new-pass-2' }).expect(200);
  });

  describe('Profile & Settings', () => {
    const sara = { name: 'Sara Khan', email: 'sara@seecs.edu.pk', password: 'first-password-1' };
    const agent = () => request.agent(app.getHttpServer());

    it('updates name and organisation, with validation', async () => {
      const a = agent();
      await a.post('/auth/register').send(sara).expect(201);
      const bad = await a.patch('/auth/me').send({ name: 'S' }).expect(400);
      expect(bad.body.fields).toHaveProperty('name');
      const me = (await a.patch('/auth/me').send({ name: 'Sara A. Khan', organisation: 'NUST' }).expect(200))
        .body;
      expect(me).toMatchObject({ name: 'Sara A. Khan', organisation: 'NUST' });
      expect(
        (await a.patch('/auth/me').send({ name: 'Sara A. Khan', organisation: '' }).expect(200)).body
          .organisation,
      ).toBeNull();
      await http().patch('/auth/me').send({ name: 'Nobody' }).expect(401);
    });

    it('changes the password: needs the current one, signs out other sessions, keeps this one', async () => {
      const here = agent();
      const elsewhere = agent();
      await here.post('/auth/login').send({ email: sara.email, password: sara.password }).expect(200);
      await elsewhere.post('/auth/login').send({ email: sara.email, password: sara.password }).expect(200);

      const wrong = await here
        .post('/auth/change-password')
        .send({ currentPassword: 'not-my-password', newPassword: 'second-password-2' })
        .expect(400);
      expect(wrong.body).toMatchObject({
        code: 'WRONG_PASSWORD',
        fields: { currentPassword: expect.any(String) },
      });
      const same = await here
        .post('/auth/change-password')
        .send({ currentPassword: sara.password, newPassword: sara.password })
        .expect(400);
      expect(same.body.fields).toHaveProperty('newPassword');

      await here
        .post('/auth/change-password')
        .send({ currentPassword: sara.password, newPassword: 'second-password-2' })
        .expect(200);
      // This browser got fresh tokens and stays signed in (refresh still works) ...
      await here.post('/auth/refresh').expect(200);
      // ... the other session's refresh token was revoked.
      await elsewhere.post('/auth/refresh').expect(401);

      await http().post('/auth/login').send({ email: sara.email, password: sara.password }).expect(401);
      await http().post('/auth/login').send({ email: sara.email, password: 'second-password-2' }).expect(200);
    });

    it('guests have no profile to change', async () => {
      const guest = agent();
      await guest.post('/auth/guest').expect(201);
      expect((await guest.patch('/auth/me').send({ name: 'Guest Person' }).expect(403)).body.code).toBe(
        'SIGN_UP_REQUIRED',
      );
      await guest
        .post('/auth/change-password')
        .send({ currentPassword: 'whatever-1', newPassword: 'whatever-22' })
        .expect(403);
    });
  });
});
