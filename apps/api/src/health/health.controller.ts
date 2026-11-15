import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@prodlike/shared';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

const VERSION = process.env.npm_package_version ?? '0.1.0';

/** Public: used by the landing page status card, Docker and CI before anyone is signed in. */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const dbUp = await this.prisma.isUp();
    return {
      status: dbUp ? 'ok' : 'degraded',
      version: VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database: dbUp ? 'up' : 'down' },
    };
  }
}
