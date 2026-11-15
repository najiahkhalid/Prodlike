import { Controller, Get } from '@nestjs/common';
import type { AccessTokenClaims, ProgressResponse } from '@prodlike/shared';
import { CurrentUser } from '../common/decorators';
import { ScoringService } from './scoring.service';

/** The signed-in user's own progress (FR-16). */
@Controller('me')
export class MeController {
  constructor(private readonly scoring: ScoringService) {}

  @Get('progress')
  progress(@CurrentUser() user: AccessTokenClaims): Promise<ProgressResponse> {
    return this.scoring.progress(user.sub);
  }
}
