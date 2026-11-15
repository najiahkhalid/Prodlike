import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AUTH_COOKIES, type AccessTokenClaims, type Role } from '@prodlike/shared';
import { Errors } from '../common/api-exception';
import { IS_PUBLIC, ROLES_KEY } from '../common/decorators';
import { TokensService } from './tokens.service';

type AuthedRequest = Request & { user?: AccessTokenClaims };

/** Global guard: every endpoint needs a valid access cookie unless marked @Public() (FR-02). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token: string | undefined = req.cookies?.[AUTH_COOKIES.access];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);

    if (token) {
      try {
        req.user = await this.tokens.verifyAccess(token);
      } catch {
        if (!isPublic) throw Errors.unauthenticated();
      }
    }
    if (isPublic) return true;
    if (!req.user) throw Errors.unauthenticated();
    return true;
  }
}

/** Global guard: enforces @Roles(...). ADMIN passes every role check. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles?.length) return true;
    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user) throw Errors.unauthenticated();
    if (user.role === 'ADMIN' || roles.includes(user.role)) return true;
    throw Errors.forbidden();
  }
}
