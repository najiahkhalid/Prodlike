import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { join } from 'node:path';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';

/** Integration tests need a real, migrated Postgres. Locally: DATABASE_URL_TEST in apps/api/.env.test or the shell. */
export const TEST_DB = process.env.DATABASE_URL_TEST;
export const describeDb = TEST_DB ? describe : describe.skip;

/**
 * Boots the real AppModule (all guards, filters, pipes) against the test database.
 * Env must be set BEFORE AppModule is imported, because ConfigModule validates at import time.
 */
export async function createTestApp(env: Record<string, string> = {}) {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    JWT_ACCESS_SECRET: 'test-secret-0123456789abcdef',
    COOKIE_SECURE: 'false',
    AUTH_RATE_LIMIT: '1000',
    APP_URL: 'http://localhost:3000',
    SCENARIOS_DIR: join(__dirname, '..', '..', '..', 'scenarios'),
    SCENARIOS_AUTO_PUBLISH: 'true',
    ...env,
  });
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { AppModule } = require('../src/app.module');
  const { configureApp } = require('../src/main');
  const { PrismaService } = require('../src/prisma/prisma.service');
  const { MailService } = require('../src/auth/mail.service');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>());
  const prisma: PrismaService = app.get(PrismaService);
  await resetDb(prisma);
  await app.init(); // runs the scenario sync
  return {
    app: app as INestApplication,
    prisma,
    mail: app.get(MailService) as { outbox: { to: string; text: string }[] },
  };
}

export async function resetDb(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AttemptEvent","RubricResult","HintUsage","Attempt","Assignment","CohortMember","Cohort",' +
      '"UserBadge","RefreshToken","PasswordResetToken","Feedback","User","ScenarioVersion","Scenario" CASCADE',
  );
}

/** Creates a user directly (e.g. an ADMIN, which cannot self-register). */
export async function createUser(
  prisma: PrismaService,
  role: 'LEARNER' | 'INSTRUCTOR' | 'ADMIN',
  email: string,
  password = 'password-123',
) {
  return prisma.user.create({
    data: { email, name: `${role} user`, role, passwordHash: await hash(password, 4) },
  });
}

/** A supertest agent that keeps cookies, logged in as the given user. */
export async function loginAgent(app: INestApplication, email: string, password = 'password-123') {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/auth/login').send({ email, password }).expect(200);
  return agent;
}

/** Parse Set-Cookie headers into name -> raw header. */
export function cookiesOf(res: request.Response): Record<string, string> {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return Object.fromEntries((raw ?? []).map((c) => [c.split('=')[0], c]));
}
