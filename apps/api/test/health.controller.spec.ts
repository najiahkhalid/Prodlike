import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from '../src/health/health.controller';
import { PrismaService } from '../src/prisma/prisma.service';

describe('GET /health', () => {
  let app: INestApplication;
  const prisma = { isUp: jest.fn<Promise<boolean>, []>() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('reports ok when the database is up', async () => {
    prisma.isUp.mockResolvedValueOnce(true);
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', checks: { database: 'up' } });
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  it('reports degraded (still 200) when the database is down', async () => {
    prisma.isUp.mockResolvedValueOnce(false);
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'degraded', checks: { database: 'down' } });
  });
});
