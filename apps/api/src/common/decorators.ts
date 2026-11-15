import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AccessTokenClaims, Role } from '@prodlike/shared';

export const IS_PUBLIC = 'isPublic';
export const ROLES_KEY = 'roles';

/** Endpoint needs no sign-in. Everything else is protected by default (deny by default, FR-02). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Only these roles may call the endpoint. ADMIN is always allowed. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** The signed-in user's token claims. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AccessTokenClaims => {
  return ctx.switchToHttp().getRequest().user;
});
