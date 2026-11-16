import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SandboxService } from '../sandbox/sandbox.service';
import { ScenarioRegistry } from '../scenarios/scenario-registry.service';
import { ACTIVE_STATES, AttemptsService } from './attempts.service';

/**
 * Keeps the Docker host tidy (FR-05, ADR-005):
 * - on start-up, removes sandbox containers no active attempt owns (left over from a crash),
 *   and warms the pool for every scenario whose image exists;
 * - every minute, abandons attempts idle longer than SANDBOX_IDLE_MINUTES and frees their sandbox.
 */
@Injectable()
export class SandboxReaper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SandboxReaper.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sandbox: SandboxService,
    private readonly registry: ScenarioRegistry,
    private readonly attempts: AttemptsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap() {
    if (!(await this.sandbox.available())) {
      this.logger.warn('Docker is not reachable: attempts cannot start until it is running.');
      return;
    }
    try {
      await this.reconcile();
      for (const s of this.registry.all()) {
        if (await this.sandbox.imageExists(s.slug)) void this.sandbox.refill(s.slug);
        else this.logger.warn(`No sandbox image for "${s.slug}". Build it with: pnpm scenarios:build`);
      }
    } catch (e) {
      this.logger.error(`Sandbox start-up failed: ${(e as Error).message}`);
    }
    this.timer = setInterval(() => void this.sweep().catch(() => undefined), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Remove sandbox containers that no active attempt (and no warm pool) owns. */
  async reconcile(): Promise<number> {
    const owned = new Set(
      (
        await this.prisma.attempt.findMany({
          where: { state: { in: ACTIVE_STATES }, containerId: { not: null } },
          select: { containerId: true },
        })
      ).map((a) => a.containerId!),
    );
    const pooled = this.sandbox.pooledIds();
    const orphans = (await this.sandbox.listAll()).filter((id) => !owned.has(id) && !pooled.has(id));
    await Promise.all(orphans.map((id) => this.sandbox.destroy(id)));
    if (orphans.length) this.logger.log(`Removed ${orphans.length} orphaned sandbox container(s).`);
    return orphans.length;
  }

  /** Abandon idle attempts. */
  async sweep(): Promise<number> {
    const idleMs = this.config.get('SANDBOX_IDLE_MINUTES', { infer: true }) * 60_000;
    const idle = await this.prisma.attempt.findMany({
      where: { state: { in: ACTIVE_STATES }, lastActivityAt: { lt: new Date(Date.now() - idleMs) } },
    });
    for (const a of idle) await this.attempts.abandon(a, 'idle-timeout');
    if (idle.length) this.logger.log(`Abandoned ${idle.length} idle attempt(s).`);
    await this.removeExpiredGuests();
    return idle.length;
  }

  /** Guest demo accounts live 24 hours unless the guest signs up (then they are no longer GUEST). */
  async removeExpiredGuests(): Promise<number> {
    const expired = await this.prisma.user.findMany({
      where: { role: 'GUEST', guestExpiresAt: { lt: new Date() } },
      include: { attempts: { where: { state: { in: ACTIVE_STATES } } } },
    });
    for (const g of expired) {
      for (const a of g.attempts) await this.attempts.abandon(a, 'guest-expired');
      await this.prisma.user.delete({ where: { id: g.id } });
    }
    if (expired.length) this.logger.log(`Removed ${expired.length} expired guest account(s).`);
    return expired.length;
  }
}
