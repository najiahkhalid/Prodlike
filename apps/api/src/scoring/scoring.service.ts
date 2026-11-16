import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Attempt, Prisma } from '@prisma/client';
import type { BadgeView, Debrief, EngineSnapshot, ProgressResponse, Scenario, Skill } from '@prodlike/shared';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseJestJson } from '../attempts/jest-results';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SandboxService } from '../sandbox/sandbox.service';
import { ScenarioRegistry } from '../scenarios/scenario-registry.service';
import { buildTimeline, buildTips, type TimelineEvent } from './narrative';
import { scoreRubric, type ScoringFacts } from './rubric';

export const BADGES = [
  {
    id: 'clean-rollback',
    name: 'Clean Rollback',
    description: 'Restored service within 2 minutes of an incident.',
  },
  {
    id: 'edge-case-hunter',
    name: 'Edge-Case Hunter',
    description: 'Covered a boundary case with a test before shipping.',
  },
  {
    id: 'canary-keeper',
    name: 'Canary Keeper',
    description: 'Shipped with a canary release and limited the blast radius.',
  },
] as const;

const SKILL_LABEL: Record<Skill, string> = {
  correctness: 'correctness',
  testing: 'testing',
  deploymentSafety: 'deployment safety',
  recovery: 'incident recovery',
};
const HIDDEN_DIR = '.hidden-tests';

/** Scoring, debrief, badges and progress (FR-13..16). */
@Injectable()
export class ScoringService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sandbox: SandboxService,
    private readonly registry: ScenarioRegistry,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Badge definitions must exist before any can be awarded (same list as the seed script). */
  async onModuleInit() {
    try {
      for (const b of BADGES) {
        await this.prisma.badge.upsert({
          where: { id: b.id },
          create: { ...b },
          update: { name: b.name, description: b.description },
        });
      }
    } catch {
      // database not reachable yet; the seed script also creates them
    }
  }

  // ---------------------------------------------------------------- at finish

  /**
   * Gather what the rubric needs from the live sandbox: the hidden tests (copied in only now, so
   * learners never see them) and the files that regex checks read.
   */
  async collectFacts(
    attemptId: string,
    def: Scenario,
    containerId: string,
    engine: EngineSnapshot,
  ): Promise<Omit<ScoringFacts, 'events'>> {
    const hiddenTests: ScoringFacts['hiddenTests'] = {};
    for (const item of def.rubric) {
      if (item.check.type !== 'hidden-tests') continue;
      for (const file of item.check.files) {
        const source = join(
          this.config.get('SCENARIOS_DIR', { infer: true }),
          def.slug,
          'hidden-tests',
          file,
        );
        if (!existsSync(source)) continue;
        await this.sandbox.writeFile(containerId, `${HIDDEN_DIR}/${file}`, readFileSync(source, 'utf8'));
        const out = '/tmp/prodlike-hidden.json';
        await this.sandbox.exec(containerId, ['rm', '-f', out]);
        await this.sandbox.exec(
          containerId,
          [
            'node_modules/.bin/jest',
            '--rootDir',
            '/workspace',
            '--json',
            `--outputFile=${out}`,
            '--runTestsByPath',
            `${HIDDEN_DIR}/${file}`,
          ],
          { timeoutSec: 60 },
        );
        try {
          const parsed = parseJestJson((await this.sandbox.exec(containerId, ['cat', out])).output);
          hiddenTests[file] = {
            passed: parsed.passed,
            failed: parsed.failed,
            total: parsed.total,
            failures: parsed.cases.filter((c) => c.status === 'failed').map((c) => c.name),
          };
        } catch {
          // the suite could not even load (e.g. a syntax error): counted as failing
          hiddenTests[file] = { passed: 0, failed: 1, total: 1, failures: ['hidden checks could not run'] };
        }
      }
    }

    const files: ScoringFacts['files'] = {};
    for (const item of def.rubric) {
      if (item.check.type !== 'file-matches') continue;
      try {
        files[item.check.file] = await this.sandbox.readFile(containerId, item.check.file);
      } catch {
        files[item.check.file] = undefined;
      }
    }

    const hints = await this.prisma.hintUsage.count({ where: { attemptId } });
    return {
      hiddenTests,
      files,
      incidentHappened: engine.incident !== null,
      timeToRecoverSeconds: engine.timeToRecoverSeconds,
      hintsUsed: hints,
    };
  }

  /** Score, build the debrief, award badges and store everything with the attempt. */
  async finalize(
    attempt: Attempt,
    def: Scenario,
    facts: Omit<ScoringFacts, 'events'>,
    engine: EngineSnapshot,
  ): Promise<Debrief> {
    const rows = await this.prisma.attemptEvent.findMany({
      where: { attemptId: attempt.id },
      orderBy: { at: 'asc' },
    });
    const events: TimelineEvent[] = rows.map((e) => ({
      type: e.type,
      at: e.at,
      payload: (e.payload as Record<string, unknown> | null) ?? null,
    }));
    const scored = scoreRubric(def, { ...facts, events });
    const types = new Set(events.map((e) => e.type));

    // Badges (motivation; stored once per user).
    const earned: string[] = [];
    if (facts.incidentHappened && facts.timeToRecoverSeconds !== null && facts.timeToRecoverSeconds <= 120)
      earned.push('clean-rollback');
    if (scored.rubric.some((r) => r.skill === 'testing' && r.max > 0 && r.score === r.max))
      earned.push('edge-case-hunter');
    if (types.has('deploy.canary')) earned.push('canary-keeper');
    const badges: BadgeView[] = [];
    for (const id of earned) {
      const def = BADGES.find((b) => b.id === id)!;
      const had = await this.prisma.userBadge.findUnique({
        where: { userId_badgeId: { userId: attempt.userId, badgeId: id } },
      });
      if (!had)
        await this.prisma.userBadge.create({
          data: { userId: attempt.userId, badgeId: id, attemptId: attempt.id },
        });
      badges.push({ id, name: def.name, description: def.description, newlyEarned: !had });
    }

    const version = await this.prisma.scenarioVersion.findUniqueOrThrow({
      where: { id: attempt.scenarioVersionId },
    });
    const attemptNumber = await this.prisma.attempt.count({
      where: {
        userId: attempt.userId,
        state: 'COMPLETED',
        scenarioVersion: { scenarioId: version.scenarioId },
        startedAt: { lte: attempt.startedAt },
      },
    });

    const completedAt = rows.find((e) => e.type === 'attempt.completed')?.at ?? new Date();
    const debrief: Debrief = {
      attemptId: attempt.id,
      scenario: { slug: def.slug, title: def.title },
      score: scored.score,
      rubricTotal: scored.rubricTotal,
      hintsUsed: facts.hintsUsed,
      hintPenalty: scored.penalty,
      rubric: scored.rubric,
      skills: scored.skills,
      timeline: buildTimeline(def, events),
      tips: buildTips(def, types),
      badges,
      timeToRecoverSeconds: facts.timeToRecoverSeconds,
      totalSeconds: Math.round((completedAt.getTime() - attempt.startedAt.getTime()) / 1000),
      strategy: (attempt.strategy as 'direct' | 'canary' | null) ?? null,
      resolvedBy: engine.incident?.resolvedBy ?? (types.has('fault.prevented') ? 'prevented' : null),
      attemptNumber: Math.max(1, attemptNumber),
      completedAt: completedAt.toISOString(),
      recommendations: await this.recommend(attempt.userId, def.slug, scored.skills),
    };

    await this.prisma.$transaction([
      this.prisma.rubricResult.deleteMany({ where: { attemptId: attempt.id } }),
      this.prisma.rubricResult.createMany({
        data: scored.rubric.map((r) => ({
          attemptId: attempt.id,
          checkId: r.id,
          skill: r.skill,
          score: r.score,
          max: r.max,
          reason: r.reason,
        })),
      }),
    ]);
    const stored = await this.prisma.attempt.findUniqueOrThrow({
      where: { id: attempt.id },
      select: { snapshot: true },
    });
    await this.prisma.attempt.update({
      where: { id: attempt.id },
      data: {
        score: scored.score,
        snapshot: { ...((stored.snapshot as object) ?? {}), debrief } as unknown as Prisma.InputJsonValue,
      },
    });
    return debrief;
  }

  /** Published scenarios the learner has not completed, the ones training their weakest skill first. */
  private async recommend(userId: string, currentSlug: string, skills: Debrief['skills']) {
    const weakest = (Object.entries(skills) as [Skill, { score: number; max: number }][])
      .filter(([, v]) => v.max > 0)
      .sort((a, b) => a[1].score / a[1].max - b[1].score / b[1].max)[0]?.[0];
    const published = await this.prisma.scenario.findMany({
      where: { published: true, slug: { not: currentSlug } },
    });
    const done = new Set(
      (
        await this.prisma.attempt.findMany({
          where: { userId, state: 'COMPLETED' },
          select: { scenarioVersion: { select: { scenario: { select: { slug: true } } } } },
        })
      ).map((a) => a.scenarioVersion.scenario.slug),
    );
    return published
      .map((row) => this.registry.get(row.slug))
      .filter((s): s is Scenario => Boolean(s))
      .map((s) => {
        const trains = weakest
          ? s.rubric.filter((r) => r.skill === weakest).reduce((n, r) => n + r.weight, 0)
          : 0;
        return { s, trains, done: done.has(s.slug) };
      })
      .sort((a, b) => Number(a.done) - Number(b.done) || b.trains - a.trains)
      .slice(0, 3)
      .map(({ s, trains, done }) => ({
        slug: s.slug,
        title: s.title,
        difficulty: s.difficulty,
        reason: done
          ? 'Try it again to beat your score'
          : trains && weakest
            ? `Builds your ${SKILL_LABEL[weakest]}`
            : 'A new challenge',
      }));
  }

  // ---------------------------------------------------------------- progress (FR-16)

  async progress(userId: string): Promise<ProgressResponse> {
    const attempts = await this.prisma.attempt.findMany({
      where: { userId, state: 'COMPLETED', score: { not: null } },
      orderBy: { endedAt: 'asc' },
      include: { scenarioVersion: { include: { scenario: true } } },
    });
    const list = attempts.map((a) => {
      const d = (a.snapshot as { debrief?: Debrief } | null)?.debrief;
      return {
        id: a.id,
        scenario: { slug: a.scenarioVersion.scenario.slug, title: a.scenarioVersion.scenario.title },
        score: a.score!,
        completedAt: (a.endedAt ?? a.startedAt).toISOString(),
        timeToRecoverSeconds: d?.timeToRecoverSeconds ?? null,
        strategy: (a.strategy as 'direct' | 'canary' | null) ?? null,
      };
    });

    const results = await this.prisma.rubricResult.findMany({
      where: { attempt: { userId, state: 'COMPLETED' } },
    });
    const skills = {
      correctness: null,
      testing: null,
      deploymentSafety: null,
      recovery: null,
    } as ProgressResponse['skills'];
    for (const skill of Object.keys(skills) as Skill[]) {
      const rs = results.filter((r) => r.skill === skill);
      const max = rs.reduce((n, r) => n + r.max, 0);
      skills[skill] = max ? Math.round((rs.reduce((n, r) => n + r.score, 0) / max) * 100) : null;
    }

    const badges = await this.prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { awardedAt: 'asc' },
    });
    const scores = list.map((a) => a.score);
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    const ttrs = list
      .map((a) => a.timeToRecoverSeconds)
      .filter((t): t is number => t !== null)
      .sort((a, b) => a - b);
    return {
      attempts: [...list].reverse(),
      skills,
      badges: badges.map((b) => ({
        id: b.badgeId,
        name: b.badge.name,
        description: b.badge.description,
        awardedAt: b.awardedAt.toISOString(),
      })),
      summary: {
        completed: list.length,
        averageScore: avg(scores),
        bestScore: scores.length ? Math.max(...scores) : null,
        medianTimeToRecoverSeconds: ttrs.length ? ttrs[Math.floor(ttrs.length / 2)] : null,
        improvement: scores.length >= 4 ? avg(scores.slice(-3))! - avg(scores.slice(0, 3))! : null,
      },
    };
  }
}
