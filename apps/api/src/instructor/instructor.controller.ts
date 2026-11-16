import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  CreateAssignmentSchema,
  CreateCohortSchema,
  CreateVariantSchema,
  JoinCohortSchema,
  UpdateRoleSchema,
  type AccessTokenClaims,
  type CreateAssignmentInput,
  type CreateVariantInput,
} from '@prodlike/shared';
import { z } from 'zod';
import { CurrentUser, Roles } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';
import { BuilderService } from './builder.service';
import { InstructorService } from './instructor.service';

/** Instructor area (FR-17, FR-18, FR-19). Every route is scoped to the caller's own cohorts (NFR-13). */
@Roles('INSTRUCTOR')
@Controller('instructor')
export class InstructorController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instructor: InstructorService,
    private readonly builder: BuilderService,
  ) {}

  /** Small summary used since Phase 1. */
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

  @Get('cohorts')
  cohorts(@CurrentUser() user: AccessTokenClaims) {
    return this.instructor.listCohorts(user);
  }

  @Post('cohorts')
  createCohort(
    @CurrentUser() user: AccessTokenClaims,
    @Body(new ZodPipe(CreateCohortSchema)) body: { name: string },
  ) {
    return this.instructor.createCohort(user, body.name);
  }

  @Get('cohorts/:id')
  cohort(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.instructor.getCohort(user, id);
  }

  @Delete('cohorts/:id')
  archive(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.instructor.archiveCohort(user, id);
  }

  @Delete('cohorts/:id/members/:userId')
  removeMember(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.instructor.removeMember(user, id, userId);
  }

  @Post('cohorts/:id/assignments')
  assign(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Body(new ZodPipe(CreateAssignmentSchema)) body: CreateAssignmentInput,
  ) {
    return this.instructor.createAssignment(user, id, body);
  }

  @Delete('assignments/:id')
  unassign(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.instructor.deleteAssignment(user, id);
  }

  @Get('assignments/:id/results')
  results(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.instructor.results(user, id);
  }

  /** CSV export for the gradebook (FR-18). */
  @Get('assignments/:id/results.csv')
  async csv(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, csv } = await this.instructor.resultsCsv(user, id);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="${filename}"`);
    return `\uFEFF${csv}`; // BOM so Excel opens UTF-8 names correctly
  }

  @Get('attempts/:id/debrief')
  debrief(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.instructor.learnerDebrief(user, id);
  }

  @Get('variants')
  variants(@CurrentUser() user: AccessTokenClaims) {
    return this.builder.list(user);
  }

  @Post('variants')
  createVariant(
    @CurrentUser() user: AccessTokenClaims,
    @Body(new ZodPipe(CreateVariantSchema)) body: CreateVariantInput,
  ) {
    return this.builder.create(user, body);
  }
}

/** Learners joining a class and seeing their assignments (FR-17). */
@Controller()
export class LearnerCohortsController {
  constructor(private readonly instructor: InstructorService) {}

  @HttpCode(200)
  @Post('cohorts/join')
  join(@CurrentUser() user: AccessTokenClaims, @Body(new ZodPipe(JoinCohortSchema)) body: { code: string }) {
    return this.instructor.join(user, body.code);
  }

  @Get('me/cohorts')
  mine(@CurrentUser() user: AccessTokenClaims) {
    return this.instructor.myCohorts(user);
  }
}

const UsersQuery = z.object({ q: z.string().max(80).optional() });

/** Admin tools (FR-20). */
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  users(@Query(new ZodPipe(UsersQuery)) q: z.infer<typeof UsersQuery>) {
    return this.admin.users(q.q);
  }

  @Patch('users/:id/role')
  setRole(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateRoleSchema)) body: z.infer<typeof UpdateRoleSchema>,
  ) {
    return this.admin.setRole(user, id, body.role);
  }

  @Get('sandboxes')
  sandboxes() {
    return this.admin.sandboxHealth();
  }
}
