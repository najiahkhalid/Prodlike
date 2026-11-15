import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // Connect lazily: the API must still boot (and report "degraded") when the DB is down.
    try {
      await this.$connect();
    } catch (e) {
      this.logger.warn(`Database not reachable at startup: ${(e as Error).message.split('\n')[0]}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** True when a trivial query succeeds within `timeoutMs` (health checks must answer fast). */
  async isUp(timeoutMs = 1500): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    try {
      const query = this.$queryRaw`SELECT 1`.then(() => true as const);
      return await Promise.race([query, timeout]);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
