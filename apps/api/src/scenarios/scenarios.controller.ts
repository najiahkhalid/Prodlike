import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  CatalogueQuerySchema,
  type AccessTokenClaims,
  type CatalogueQuery,
  type CatalogueResponse,
  type ScenarioBrief,
} from '@prodlike/shared';
import { z } from 'zod';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ScenariosService } from './scenarios.service';

/**
 * Catalogue and briefs are public (the landing page and the guest demo use them) and contain no
 * hidden scenario data. Signed-in users additionally get their best scores.
 */
@Controller('scenarios')
export class ScenariosController {
  constructor(private readonly scenarios: ScenariosService) {}

  @Public()
  @Get()
  list(
    @Query(new ZodPipe(CatalogueQuerySchema)) query: CatalogueQuery,
    @CurrentUser() user?: AccessTokenClaims,
  ): Promise<CatalogueResponse> {
    return this.scenarios.list(query, user);
  }

  @Public()
  @Get(':slug')
  brief(@Param('slug') slug: string, @CurrentUser() user?: AccessTokenClaims): Promise<ScenarioBrief> {
    return this.scenarios.brief(slug, user);
  }
}

const PublishSchema = z.object({ published: z.boolean() });

@Roles('ADMIN')
@Controller('admin/scenarios')
export class AdminScenariosController {
  constructor(private readonly scenarios: ScenariosService) {}

  @Patch(':slug')
  setPublished(
    @Param('slug') slug: string,
    @Body(new ZodPipe(PublishSchema)) body: z.infer<typeof PublishSchema>,
  ) {
    return this.scenarios.setPublished(slug, body.published);
  }
}
