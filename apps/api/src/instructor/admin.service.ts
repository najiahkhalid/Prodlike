import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sourceSlug, type AccessTokenClaims, type AdminUser, type SandboxHealth } from '@prodlike/shared';
import { ACTIVE_STATES } from '../attempts/attempts.service';
import { ApiException, Errors } from '../common/api-exception';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SandboxService } from '../sandbox/sandbox.service';
import { ScenarioRegistry } from '../scenarios/scenario-registry.service';

/** Admin tools (FR-20): users and roles, and the health of the sandbox host. */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sandbox: SandboxService,
    private readonly registry: ScenarioRegistry,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async users(q?: string): Promise<AdminUser[]> {
    const search = q?.trim();
    const rows = await this.prisma.user.findMany({
      where: {
        role: { not: 'GUEST' },
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { _count: { select: { attempts: { where: { state: 'COMPLETED' } } } } },
    });
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      organisation: u.organisation,
      createdAt: u.createdAt.toISOString(),
      lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      completedAttempts: u._count.attempts,
    }));
  }

  async setRole(admin: AccessTokenClaims, id: string, role: 'LEARNER' | 'INSTRUCTOR' | 'ADMIN') {
    if (id === admin.sub) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'OWN_ROLE',
        'You cannot change your own role.',
        'Ask another admin to do it, so the platform always keeps an admin.',
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role === 'GUEST') throw Errors.notFound('This user');
    await this.prisma.user.update({ where: { id }, data: { role } });
    // A role change must take effect now, not when the current session expires.
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { id, role };
  }

  async sandboxHealth(): Promise<SandboxHealth> {
    const docker = await this.sandbox.available();
    const slugs = [...new Set(this.registry.all().map(sourceSlug))].sort();
    const images = await Promise.all(
      slugs.map(async (slug) => ({ slug, built: docker && (await this.sandbox.imageExists(slug)) })),
    );
    const byState = await this.prisma.attempt.groupBy({ by: ['state'], _count: { _all: true } });
    const activeSandboxes = await this.prisma.attempt.count({
      where: { state: { in: ACTIVE_STATES }, containerId: { not: null } },
    });
    const ready = await this.prisma.attemptEvent.findMany({
      where: { type: 'sandbox.ready', at: { gte: new Date(Date.now() - 24 * 3600_000) } },
      select: { payload: true },
    });
    const ms = ready
      .map((e) => (e.payload as { ms?: number } | null)?.ms)
      .filter((x): x is number => typeof x === 'number');
    return {
      docker,
      images,
      warmPool: this.sandbox.poolSizes(),
      activeSandboxes,
      maxActive: this.config.get('SANDBOX_MAX_ACTIVE', { infer: true }),
      attemptsByState: Object.fromEntries(byState.map((s) => [s.state, s._count._all])),
      provisioning: {
        last24h: ms.length,
        averageMs: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null,
        slowestMs: ms.length ? Math.max(...ms) : null,
      },
    };
  }
}
