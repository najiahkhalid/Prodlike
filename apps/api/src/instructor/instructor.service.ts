import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AccessTokenClaims,
  AssignmentResults,
  AssignmentView,
  CohortView,
  CreateAssignmentInput,
  Debrief,
  MyCohorts,
  ResultRow,
} from '@prodlike/shared';
import { randomInt } from 'node:crypto';
import { ApiException, Errors } from '../common/api-exception';
import { PrismaService } from '../prisma/prisma.service';
import { ScenarioRegistry } from '../scenarios/scenario-registry.service';
import { ScenariosService } from '../scenarios/scenarios.service';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: they look like 1 and 0

/** A readable join code like KXPT-4821. */
export function makeJoinCode(): string {
  const letters = Array.from({ length: 4 }, () => LETTERS[randomInt(LETTERS.length)]).join('');
  return `${letters}-${String(randomInt(10_000)).padStart(4, '0')}`;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const average = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

type AssignmentWithScenario = Prisma.AssignmentGetPayload<{
  include: { scenario: true; cohort: { include: { members: true } } };
}>;

/**
 * Cohorts, assignments and results for instructors (FR-17, FR-18), plus the learner side of
 * joining a class. Every instructor query is scoped to cohorts they own (NFR-13); admins see all.
 */
@Injectable()
export class InstructorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ScenarioRegistry,
    private readonly scenarios: ScenariosService,
  ) {}

  // ---------------------------------------------------------------- cohorts

  async createCohort(user: AccessTokenClaims, name: string): Promise<CohortView> {
    for (let i = 0; i < 5; i++) {
      try {
        const c = await this.prisma.cohort.create({
          data: { name, ownerId: user.sub, joinCode: makeJoinCode() },
        });
        return this.cohortView(c.id);
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2002') throw e; // retry only on a join-code collision
      }
    }
    throw new ApiException(
      HttpStatus.SERVICE_UNAVAILABLE,
      'TRY_AGAIN',
      'Could not create the class.',
      'Try again.',
    );
  }

  async listCohorts(user: AccessTokenClaims): Promise<CohortView[]> {
    const rows = await this.prisma.cohort.findMany({
      where: { archivedAt: null, ...(user.role === 'ADMIN' ? {} : { ownerId: user.sub }) },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return Promise.all(rows.map((r) => this.cohortView(r.id)));
  }

  async getCohort(user: AccessTokenClaims, id: string): Promise<CohortView> {
    await this.ownedCohort(user, id);
    return this.cohortView(id);
  }

  async archiveCohort(user: AccessTokenClaims, id: string) {
    await this.ownedCohort(user, id);
    await this.prisma.cohort.update({ where: { id }, data: { archivedAt: new Date() } });
    return { archived: true };
  }

  async removeMember(user: AccessTokenClaims, cohortId: string, userId: string) {
    await this.ownedCohort(user, cohortId);
    await this.prisma.cohortMember.deleteMany({ where: { cohortId, userId } });
    return this.cohortView(cohortId);
  }

  // ---------------------------------------------------------------- assignments

  async createAssignment(
    user: AccessTokenClaims,
    cohortId: string,
    input: CreateAssignmentInput,
  ): Promise<CohortView> {
    await this.ownedCohort(user, cohortId);
    const scenario = await this.prisma.scenario.findUnique({ where: { slug: input.scenario } });
    if (!scenario || !this.registry.get(scenario.slug) || !(await this.scenarios.canAccess(user, scenario))) {
      throw Errors.notFound('This scenario');
    }
    const dup = await this.prisma.assignment.findFirst({ where: { cohortId, scenarioId: scenario.id } });
    if (dup) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'ALREADY_ASSIGNED',
        'This scenario is already assigned to this class.',
        'Remove the existing assignment first if you want a new deadline.',
      );
    }
    await this.prisma.assignment.create({
      data: {
        cohortId,
        scenarioId: scenario.id,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        randomiseFaults: input.randomiseFaults ?? true,
      },
    });
    return this.cohortView(cohortId);
  }

  async deleteAssignment(user: AccessTokenClaims, id: string) {
    const a = await this.ownedAssignment(user, id);
    await this.prisma.attempt.updateMany({ where: { assignmentId: id }, data: { assignmentId: null } });
    await this.prisma.assignment.delete({ where: { id } });
    return this.cohortView(a.cohortId);
  }

  // ---------------------------------------------------------------- results (FR-18)

  async results(user: AccessTokenClaims, assignmentId: string): Promise<AssignmentResults> {
    const a = await this.ownedAssignment(user, assignmentId);
    const learnerIds = a.cohort.members.map((m) => m.userId);
    const learners = await this.prisma.user.findMany({
      where: { id: { in: learnerIds } },
      orderBy: { name: 'asc' },
    });
    const attempts = await this.prisma.attempt.findMany({
      where: {
        userId: { in: learnerIds },
        scenarioVersion: { scenarioId: a.scenarioId },
        startedAt: { gte: a.createdAt },
      },
      include: { rubricResults: true },
    });
    const now = Date.now();
    const due = a.dueAt?.getTime() ?? null;

    const rows: ResultRow[] = learners.map((l) => {
      const mine = attempts.filter((x) => x.userId === l.id);
      const best = mine
        .filter((x) => x.state === 'COMPLETED' && x.score !== null)
        .sort((x, y) => y.score! - x.score! || x.endedAt!.getTime() - y.endedAt!.getTime())[0];
      const d = (best?.snapshot as { debrief?: Debrief } | null)?.debrief;
      const completedAt = best?.endedAt ?? null;
      return {
        learner: { id: l.id, name: l.name, email: l.email },
        attempts: mine.length,
        bestScore: best?.score ?? null,
        bestAttemptId: best?.id ?? null,
        completedAt: completedAt?.toISOString() ?? null,
        late: due !== null && (completedAt ? completedAt.getTime() > due : now > due),
        timeToRecoverSeconds: d?.timeToRecoverSeconds ?? null,
        strategy: (best?.strategy as 'direct' | 'canary' | null) ?? null,
      };
    });

    const scores = rows.map((r) => r.bestScore).filter((s): s is number => s !== null);
    const distribution = Array.from({ length: 10 }, (_, i) => ({
      bucket: i === 9 ? '90-100' : `${i * 10}-${i * 10 + 9}`,
      count: scores.filter((s) => Math.min(9, Math.floor(s / 10)) === i).length,
    }));

    // The class's common mistakes: rubric items the learners' best attempts most often missed.
    const def = this.registry.get(a.scenario.slug);
    const misses = new Map<string, number>();
    for (const r of rows) {
      const best = attempts.find((x) => x.id === r.bestAttemptId);
      for (const rr of best?.rubricResults ?? []) {
        if (rr.score < rr.max) {
          const label = def?.rubric.find((x) => x.id === rr.checkId)?.label ?? rr.checkId;
          misses.set(label, (misses.get(label) ?? 0) + 1);
        }
      }
    }

    return {
      assignment: await this.assignmentView(a),
      cohort: { id: a.cohort.id, name: a.cohort.name },
      rows,
      summary: {
        averageScore: average(scores),
        completed: scores.length,
        learners: rows.length,
        medianTimeToRecoverSeconds: median(
          rows.map((r) => r.timeToRecoverSeconds).filter((t): t is number => t !== null),
        ),
        distribution,
        commonMisses: [...misses.entries()]
          .map(([label, missedBy]) => ({ label, missedBy }))
          .sort((x, y) => y.missedBy - x.missedBy)
          .slice(0, 3),
      },
    };
  }

  /** CSV for the gradebook (FR-18). Cells that start with = + - @ are prefixed so spreadsheets do not run them. */
  async resultsCsv(
    user: AccessTokenClaims,
    assignmentId: string,
  ): Promise<{ filename: string; csv: string }> {
    const r = await this.results(user, assignmentId);
    const cell = (v: unknown) => {
      let s = v === null || v === undefined ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'learner',
      'email',
      'best_score',
      'attempts',
      'completed_at',
      'late',
      'time_to_recover_s',
      'strategy',
    ];
    const lines = r.rows.map((x) =>
      [
        x.learner.name,
        x.learner.email,
        x.bestScore,
        x.attempts,
        x.completedAt,
        x.late ? 'yes' : 'no',
        x.timeToRecoverSeconds,
        x.strategy,
      ]
        .map(cell)
        .join(','),
    );
    const safe = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-|-$/g, '');
    return {
      filename: `${safe(r.cohort.name)}-${safe(r.assignment.scenario.slug)}-results.csv`,
      csv: `${[header.join(','), ...lines].join('\r\n')}\r\n`,
    };
  }

  /** An instructor may read the debrief of a learner in one of their cohorts (NFR-13). */
  async learnerDebrief(user: AccessTokenClaims, attemptId: string): Promise<Debrief & { learner: string }> {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: { user: true },
    });
    const allowed =
      attempt &&
      (user.role === 'ADMIN' ||
        (await this.prisma.cohortMember.count({
          where: { userId: attempt.userId, cohort: { ownerId: user.sub, archivedAt: null } },
        })) > 0);
    const d = (attempt?.snapshot as { debrief?: Debrief } | null)?.debrief;
    if (!allowed || !d) throw Errors.notFound('This debrief');
    return { ...d, learner: attempt!.user.name };
  }

  // ---------------------------------------------------------------- learner side

  async join(user: AccessTokenClaims, code: string) {
    const cohort = await this.prisma.cohort.findUnique({ where: { joinCode: code } });
    if (!cohort || cohort.archivedAt) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'JOIN_CODE_INVALID',
        'No class uses that join code.',
        'Check the code with your instructor and try again.',
      );
    }
    if (cohort.ownerId === user.sub) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'OWN_CLASS',
        'You teach this class.',
        'Share the code with your learners instead.',
      );
    }
    await this.prisma.cohortMember.upsert({
      where: { cohortId_userId: { cohortId: cohort.id, userId: user.sub } },
      create: { cohortId: cohort.id, userId: user.sub },
      update: {},
    });
    return { cohort: { id: cohort.id, name: cohort.name } };
  }

  async myCohorts(user: AccessTokenClaims): Promise<MyCohorts> {
    const memberships = await this.prisma.cohortMember.findMany({
      where: { userId: user.sub, cohort: { archivedAt: null } },
      include: { cohort: { include: { owner: true, assignments: { include: { scenario: true } } } } },
    });
    const assignments: MyCohorts['assignments'] = [];
    for (const m of memberships) {
      for (const a of m.cohort.assignments) {
        const best = await this.prisma.attempt.findFirst({
          where: {
            userId: user.sub,
            state: 'COMPLETED',
            scenarioVersion: { scenarioId: a.scenarioId },
            startedAt: { gte: a.createdAt },
          },
          orderBy: { score: 'desc' },
        });
        const late = a.dueAt && (best ? best.endedAt! > a.dueAt : Date.now() > a.dueAt.getTime());
        const def = this.registry.get(a.scenario.slug);
        assignments.push({
          id: a.id,
          cohort: m.cohort.name,
          scenario: {
            slug: a.scenario.slug,
            title: a.scenario.title,
            difficulty: def?.difficulty ?? a.scenario.difficulty,
          },
          dueAt: a.dueAt?.toISOString() ?? null,
          status: best ? (late ? 'late' : 'done') : late ? 'late' : 'todo',
          bestScore: best?.score ?? null,
        });
      }
    }
    assignments.sort((x, y) => (x.dueAt ?? '9999').localeCompare(y.dueAt ?? '9999'));
    return {
      cohorts: memberships.map((m) => ({
        id: m.cohort.id,
        name: m.cohort.name,
        instructor: m.cohort.owner.name,
      })),
      assignments,
    };
  }

  // ---------------------------------------------------------------- helpers

  /** Owner (or admin) only; everyone else gets 404 so cohort ids reveal nothing (NFR-13). */
  private async ownedCohort(user: AccessTokenClaims, id: string) {
    const c = await this.prisma.cohort.findUnique({ where: { id } });
    if (!c || c.archivedAt || (c.ownerId !== user.sub && user.role !== 'ADMIN'))
      throw Errors.notFound('This class');
    return c;
  }

  private async ownedAssignment(user: AccessTokenClaims, id: string): Promise<AssignmentWithScenario> {
    const a = await this.prisma.assignment.findUnique({
      where: { id },
      include: { scenario: true, cohort: { include: { members: true } } },
    });
    if (!a || a.cohort.archivedAt || (a.cohort.ownerId !== user.sub && user.role !== 'ADMIN')) {
      throw Errors.notFound('This assignment');
    }
    return a;
  }

  private async assignmentView(a: AssignmentWithScenario): Promise<AssignmentView> {
    const memberIds = a.cohort.members.map((m) => m.userId);
    const done = await this.prisma.attempt.findMany({
      where: {
        userId: { in: memberIds },
        state: 'COMPLETED',
        scenarioVersion: { scenarioId: a.scenarioId },
        startedAt: { gte: a.createdAt },
      },
      select: { userId: true, score: true },
    });
    const best = new Map<string, number>();
    for (const d of done) best.set(d.userId, Math.max(best.get(d.userId) ?? 0, d.score ?? 0));
    const def = this.registry.get(a.scenario.slug);
    return {
      id: a.id,
      scenario: {
        slug: a.scenario.slug,
        title: a.scenario.title,
        difficulty: def?.difficulty ?? a.scenario.difficulty,
      },
      dueAt: a.dueAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      learners: memberIds.length,
      completed: best.size,
      averageScore: average([...best.values()]),
    };
  }

  private async cohortView(id: string): Promise<CohortView> {
    const c = await this.prisma.cohort.findUniqueOrThrow({
      where: { id },
      include: {
        members: { include: { user: true }, orderBy: { joinedAt: 'asc' } },
        assignments: {
          include: { scenario: true, cohort: { include: { members: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return {
      id: c.id,
      name: c.name,
      joinCode: c.joinCode,
      createdAt: c.createdAt.toISOString(),
      learners: c.members.map((m) => ({
        id: m.userId,
        name: m.user.name,
        email: m.user.email,
        joinedAt: m.joinedAt.toISOString(),
      })),
      assignments: await Promise.all(c.assignments.map((a) => this.assignmentView(a))),
    };
  }
}
