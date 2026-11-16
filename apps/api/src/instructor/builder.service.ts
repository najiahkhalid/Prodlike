import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ScenarioSchema,
  type AccessTokenClaims,
  type CreateVariantInput,
  type Scenario,
  type VariantView,
} from '@prodlike/shared';
import { createHash, randomInt } from 'node:crypto';
import { ApiException, Errors } from '../common/api-exception';
import { PrismaService } from '../prisma/prisma.service';
import { ScenarioRegistry } from '../scenarios/scenario-registry.service';

/**
 * Scenario Builder (FR-19, "could have"): instructors create a VARIANT of an existing scenario
 * (new ticket text, incident on/off, rubric weights, hint cost) without writing code. A variant
 * reuses its base scenario's sandbox image, template and hidden tests (`basedOn`), is private to
 * its author until published, and can be assigned to the author's own cohorts.
 */
@Injectable()
export class BuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ScenarioRegistry,
  ) {}

  async list(user: AccessTokenClaims): Promise<VariantView[]> {
    const rows = await this.prisma.scenario.findMany({
      where: { basedOn: { not: null }, ...(user.role === 'ADMIN' ? {} : { authorId: user.sub }) },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      basedOn: r.basedOn!,
      createdAt: r.createdAt.toISOString(),
      published: r.published,
    }));
  }

  async create(user: AccessTokenClaims, input: CreateVariantInput): Promise<VariantView> {
    const baseRow = await this.prisma.scenario.findUnique({ where: { slug: input.basedOn } });
    const base = this.registry.get(input.basedOn);
    // Variants are built from file-based scenarios only (no variants of variants).
    if (!baseRow || !base || base.basedOn || !(baseRow.published || user.role === 'ADMIN')) {
      throw Errors.notFound('That base scenario');
    }
    const unknown = Object.keys(input.weights).filter((id) => !base.rubric.some((r) => r.id === id));
    if (unknown.length) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        `Unknown rubric items: ${unknown.join(', ')}.`,
        'Use the rubric items of the base scenario.',
      );
    }

    const slug = `${base.slug}-v-${Array.from({ length: 5 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[randomInt(31)]).join('')}`;
    const candidate = {
      ...base,
      slug,
      basedOn: base.slug,
      title: input.title,
      guestDemo: false,
      brief: { ...base.brief, title: input.ticketTitle, body: input.ticketBody },
      faults: input.faultsEnabled ? base.faults : [],
      // Items given 0 points are dropped (the schema requires positive weights).
      rubric: base.rubric
        .map((r) => ({ ...r, weight: input.weights[r.id] ?? 0 }))
        .filter((r) => r.weight > 0),
      hintPenalty: input.hintPenalty,
      // Debrief tips about the incident make no sense when it is switched off.
      debriefRules: input.faultsEnabled
        ? base.debriefRules
        : base.debriefRules.filter((r) => !/recovery|incident/.test(r.id)),
      hints: input.faultsEnabled ? base.hints : base.hints.filter((h) => h.when !== 'incident-active'),
    };
    const parsed = ScenarioSchema.safeParse(candidate);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        `${first.path.join('.')}: ${first.message}`,
        'Adjust the variant and save again.',
      );
    }
    const def: Scenario = parsed.data;

    const row = await this.prisma.scenario.create({
      data: {
        slug,
        title: def.title,
        difficulty: def.difficulty,
        published: false,
        basedOn: base.slug,
        authorId: user.sub,
        versions: {
          create: {
            version: 1,
            sourceHash: createHash('sha256').update(JSON.stringify(def)).digest('hex'),
            definition: def as unknown as Prisma.InputJsonValue,
          },
        },
      },
    });
    this.registry.register(def);
    return {
      slug,
      title: row.title,
      basedOn: base.slug,
      createdAt: row.createdAt.toISOString(),
      published: false,
    };
  }
}
