import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Prisma } from '@prisma/client';
import type { Scenario } from '@prodlike/shared';
import { loadAllScenarios } from '@prodlike/shared/dist/node';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/** sha256 over scenario.yaml, the template and hidden tests: any content change = new version. */
function hashScenarioDir(dir: string): string {
  const h = createHash('sha256');
  const walk = (p: string) => {
    for (const name of readdirSync(p).sort()) {
      const full = join(p, name);
      if (statSync(full).isDirectory()) {
        if (name !== 'node_modules') walk(full);
      } else {
        h.update(relative(dir, full).replace(/\\/g, '/'));
        h.update(readFileSync(full));
      }
    }
  };
  for (const part of ['scenario.yaml', 'template', 'hidden-tests']) {
    const p = join(dir, part);
    if (!existsSync(p)) continue;
    if (statSync(p).isDirectory()) walk(p);
    else h.update(part).update(readFileSync(p));
  }
  return h.digest('hex');
}

/**
 * Loads scenarios/*\/ on startup, validates them with the shared schema and records them as
 * Scenario + immutable ScenarioVersion rows (ADR-002). Keeps the latest definitions in memory.
 */
@Injectable()
export class ScenarioRegistry implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScenarioRegistry.name);
  private readonly bySlug = new Map<string, Scenario>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.sync();
    } catch (e) {
      // The API must still boot (health shows the DB state) even if the database is down.
      this.logger.error(`Scenario sync failed: ${(e as Error).message.split('\n')[0]}`);
    }
  }

  get(slug: string): Scenario | undefined {
    return this.bySlug.get(slug);
  }

  all(): Scenario[] {
    return [...this.bySlug.values()];
  }

  async sync(): Promise<void> {
    const root = this.config.get('SCENARIOS_DIR', { infer: true });
    const autoPublish = this.config.get('SCENARIOS_AUTO_PUBLISH', { infer: true });
    if (!existsSync(root)) {
      this.logger.warn(`Scenario folder not found: ${root}`);
      return;
    }

    for (const r of loadAllScenarios(root)) {
      if (!r.ok || !r.scenario) {
        this.logger.error(`Skipping invalid scenario ${r.dir}:\n  - ${r.errors.join('\n  - ')}`);
        continue;
      }
      const s = r.scenario;
      const sourceHash = hashScenarioDir(r.dir);

      const scenario = await this.prisma.scenario.upsert({
        where: { slug: s.slug },
        create: {
          slug: s.slug,
          title: s.title,
          difficulty: s.difficulty,
          guestDemo: s.guestDemo,
          published: autoPublish,
        },
        update: { title: s.title, difficulty: s.difficulty, guestDemo: s.guestDemo },
      });

      const existing = await this.prisma.scenarioVersion.findUnique({
        where: { scenarioId_sourceHash: { scenarioId: scenario.id, sourceHash } },
      });
      if (!existing) {
        const last = await this.prisma.scenarioVersion.findFirst({
          where: { scenarioId: scenario.id },
          orderBy: { version: 'desc' },
        });
        await this.prisma.scenarioVersion.create({
          data: {
            scenarioId: scenario.id,
            version: (last?.version ?? 0) + 1,
            sourceHash,
            definition: s as unknown as Prisma.InputJsonValue,
          },
        });
        this.logger.log(`Scenario ${s.slug}: new version ${(last?.version ?? 0) + 1}`);
      }
      this.bySlug.set(s.slug, s);
    }
    this.logger.log(`Scenarios loaded: ${[...this.bySlug.keys()].join(', ') || 'none'}`);
  }
}
