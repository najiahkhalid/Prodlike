import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  CommandSchema,
  SaveFileSchema,
  StartAttemptSchema,
  type AccessTokenClaims,
  type AttemptView,
  type CommandInput,
  type CommandResult,
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

  @HttpCode(200)
  @Post(':id/end')
  end(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.attempts.end(user, id);
  }
}
