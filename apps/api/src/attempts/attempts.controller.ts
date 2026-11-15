import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  CommandSchema,
  DeploySchema,
  SaveFileSchema,
  StartAttemptSchema,
  type AccessTokenClaims,
  type AttemptView,
  type CommandInput,
  type CommandResult,
  type Debrief,
  type DeployInput,
  type HintResult,
  type EngineSnapshot,
  type SaveFileInput,
  type StartAttemptInput,
  type TestRunResult,
} from '@prodlike/shared';
import { z } from 'zod';
import { CurrentUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AttemptsService } from './attempts.service';

const FileQuerySchema = z.object({ path: z.string().min(1).max(200) });

/** The scenario workspace API (FR-05..07). Every route needs a signed-in owner of the attempt. */
@Controller('attempts')
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Post()
  start(
    @CurrentUser() user: AccessTokenClaims,
    @Body(new ZodPipe(StartAttemptSchema)) body: StartAttemptInput,
  ): Promise<AttemptView> {
    return this.attempts.start(user, body.scenario);
  }

  @Get(':id')
  get(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string): Promise<AttemptView> {
    return this.attempts.get(user, id);
  }

  @Get(':id/file')
  readFile(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Query(new ZodPipe(FileQuerySchema)) q: z.infer<typeof FileQuerySchema>,
  ) {
    return this.attempts.readFile(user, id, q.path);
  }

  @Put(':id/files')
  saveFile(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Body(new ZodPipe(SaveFileSchema)) body: SaveFileInput,
  ) {
    return this.attempts.saveFile(user, id, body.path, body.content);
  }

  @HttpCode(200)
  @Post(':id/commands')
  command(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Body(new ZodPipe(CommandSchema)) body: CommandInput,
  ): Promise<CommandResult> {
    return this.attempts.command(user, id, body.line);
  }

  @HttpCode(200)
  @Post(':id/tests')
  tests(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string): Promise<TestRunResult> {
    return this.attempts.runTests(user, id);
  }

  /** FR-08/09: commit + CI/CD pipeline + deploy. Returns at once; progress streams over the socket. */
  @HttpCode(202)
  @Post(':id/deploy')
  deploy(
    @CurrentUser() user: AccessTokenClaims,
    @Param('id') id: string,
    @Body(new ZodPipe(DeploySchema)) body: DeployInput,
  ): Promise<EngineSnapshot> {
    return this.attempts.deploy(user, id, body);
  }

  /** FR-11: roll production back to the previous release. */
  @HttpCode(200)
  @Post(':id/rollback')
  rollback(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.attempts.rollback(user, id);
  }

  /** Finish once production is healthy: scores the attempt and returns the debrief (FR-14, FR-15). */
  @HttpCode(200)
  @Post(':id/finish')
  finish(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string): Promise<Debrief> {
    return this.attempts.finish(user, id);
  }

  @Get(':id/debrief')
  debrief(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string): Promise<Debrief> {
    return this.attempts.debrief(user, id);
  }

  /** A context-aware hint; each one costs rubric points. */
  @HttpCode(200)
  @Post(':id/hints')
  hint(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string): Promise<HintResult> {
    return this.attempts.useHint(user, id);
  }

  @HttpCode(200)
  @Post(':id/end')
  end(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.attempts.end(user, id);
  }
}
