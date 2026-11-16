import { Injectable } from '@nestjs/common';
import {
  toBrief,
  type AccessTokenClaims,
  type CatalogueQuery,
  type CatalogueResponse,
  type ScenarioBrief,
  type ScenarioSummary,
} from '@prodlike/shared';
import { Errors } from '../common/api-exception';
import { PrismaService } from '../prisma/prisma.service';
import { ScenarioRegistry } from './scenario-registry.service';

const DIFFICULTY_ORDER = { beginner: 0, intermediate: 1, advanced: 2 } as const;

@Injectable()
export class ScenariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ScenarioRegistry,
  ) {}

  /** FR-03: published scenarios (admins also see drafts), filtered by difficulty, skill and text. */
  async list(query: CatalogueQuery, user?: AccessTokenClaims): Promise<CatalogueResponse> {
    const isAdmin = user?.role === 'ADMIN';
    // Everyone sees published scenarios; authors also see their own Builder variants; admins see all.
    const rows = await this.prisma.scenario.findMany({
      where: isAdmin ? {} : { OR: [{ published: true }, ...(user ? [{ authorId: user.sub }] : [])] },
    });

    const best = new Map<string, number>();
    if (user) {
      const scores = await this.prisma.attempt.groupBy({
        by: ['scenarioVersionId'],
        where: { userId: user.sub, score: { not: null } },
        _max: { score: true },
      });
      if (scores.length) {
        const versions = await this.prisma.scenarioVersion.findMany({
          where: { id: { in: scores.map((s) => s.scenarioVersionId) } },
          include: { scenario: true },
        });
        for (const s of scores) {
          const slug = versions.find((v) => v.id === s.scenarioVersionId)?.scenario.slug;
          if (slug && s._max.score !== null) best.set(slug, Math.max(best.get(slug) ?? 0, s._max.score));
        }
      }
    }

    const all: ScenarioSummary[] = rows
      .map((row) => {
        const def = this.registry.get(row.slug);
        if (!def) return null;
        return {
          slug: def.slug,
          title: def.title,
          summary: def.summary,
          difficulty: def.difficulty,
          skills: def.skills,
          estimatedMinutes: def.estimatedMinutes,
          company: def.company.name,
          guestDemo: def.guestDemo,
          published: row.published,
          bestScore: best.get(def.slug) ?? null,
        };
      })
      .filter((s): s is ScenarioSummary => s !== null)
      .sort(
        (a, b) =>
          DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty] || a.title.localeCompare(b.title),
      );

    const skills = [...new Set(all.flatMap((s) => s.skills))].sort();
    const q = query.q?.toLowerCase();
    const skill = query.skill?.toLowerCase();
    const items = all.filter(
      (s) =>
        (!query.difficulty || s.difficulty === query.difficulty) &&
        (!skill || s.skills.some((k) => k.toLowerCase() === skill)) &&
        (!q || [s.title, s.summary, s.company].some((t) => t.toLowerCase().includes(q))),
    );
    return { items, skills };
  }

  /** FR-04: the brief for one scenario, with no hidden data (see toBrief). */
  async brief(slug: string, user?: AccessTokenClaims): Promise<ScenarioBrief> {
    const row = await this.prisma.scenario.findUnique({ where: { slug } });
    const def = this.registry.get(slug);
    const visible = row && def && (await this.canAccess(user, row));
    if (!visible) throw Errors.notFound('This scenario');
    return toBrief(def);
  }

  /**
   * Who may open a scenario: anyone if it is published; admins always; the author of a Builder
   * variant; and learners whose cohort has it assigned (so instructors can assign unpublished variants).
   */
  async canAccess(
    user: AccessTokenClaims | undefined,
    row: { id: string; published: boolean; authorId: string | null },
  ) {
    if (row.published || user?.role === 'ADMIN') return true;
    if (!user) return false;
    if (row.authorId === user.sub) return true;
    const assigned = await this.prisma.assignment.count({
      where: { scenarioId: row.id, cohort: { archivedAt: null, members: { some: { userId: user.sub } } } },
    });
    return assigned > 0;
  }

  /** FR-20 (part): admins publish or unpublish a scenario. */
  async setPublished(slug: string, published: boolean) {
    const row = await this.prisma.scenario.findUnique({ where: { slug } });
    if (!row) throw Errors.notFound('This scenario');
    const updated = await this.prisma.scenario.update({ where: { slug }, data: { published } });
    return { slug: updated.slug, published: updated.published };
  }
}
