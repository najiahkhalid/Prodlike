import { Controller, Get, Module } from '@nestjs/common';
import type { AccessTokenClaims } from '@prodlike/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Instructor overview. Phase 1 only needs it to prove role-based access (FR-02);
 * cohorts and assignments fill it in Phase 5. Every query is scoped to the caller (NFR-13).
 */
@Roles('INSTRUCTOR')
@Controller('instructor')
export class InstructorController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  async overview(@CurrentUser() user: AccessTokenClaims) {
    const cohorts = await this.prisma.cohort.findMany({
      where: { ownerId: user.sub, archivedAt: null },
      select: { id: true, name: true, joinCode: true, _count: { select: { members: true } } },
    });
    return {
      cohorts: cohorts.map((c) => ({
        id: c.id,
        name: c.name,
        joinCode: c.joinCode,
        learners: c._count.members,
      })),
      learners: cohorts.reduce((n, c) => n + c._count.members, 0),
    };
  }
}

@Module({ controllers: [InstructorController] })
export class InstructorModule {}
