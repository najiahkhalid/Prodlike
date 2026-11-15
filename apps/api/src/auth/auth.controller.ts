import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  AUTH_COOKIES,
  ForgotPasswordSchema,
  LoginSchema,
  RegisterSchema,
  ResetPasswordSchema,
  type AccessTokenClaims,
  type ForgotPasswordInput,
  type LoginInput,
  type Me,
  type ResetPasswordInput,
} from '@prodlike/shared';
import { z } from 'zod';
import { Errors } from '../common/api-exception';
import { CurrentUser, Public } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';

/** Tight limit on credential endpoints (NFR-13); the number comes from AUTH_RATE_LIMIT. */
const authLimit = () => ({
  default: { limit: Number(process.env.AUTH_RATE_LIMIT ?? 10), ttl: 60_000 },
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
  ) {}

  @Public()
  @Throttle(authLimit())
  @Post('register')
  register(
    @Body(new ZodPipe(RegisterSchema)) body: z.output<typeof RegisterSchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Me> {
    return this.auth.register(body, res);
  }

  @Public()
  @Throttle(authLimit())
  @HttpCode(200)
  @Post('login')
  login(
    @Body(new ZodPipe(LoginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Me> {
    return this.auth.login(body, res);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<Me> {
    const userId = await this.tokens.rotate(res, req.cookies?.[AUTH_COOKIES.refresh]);
    if (!userId) {
      this.tokens.clear(res);
      throw Errors.unauthenticated();
    }
    return this.auth.me(userId);
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.tokens.revoke(req.cookies?.[AUTH_COOKIES.refresh]);
    this.tokens.clear(res);
  }

  @Get('me')
  me(@CurrentUser() user: AccessTokenClaims): Promise<Me> {
    return this.auth.me(user.sub);
  }

  @HttpCode(200)
  @Post('me/onboarded')
  onboarded(@CurrentUser() user: AccessTokenClaims): Promise<Me> {
    return this.auth.markOnboarded(user.sub);
  }

  @Public()
  @Throttle(authLimit())
  @HttpCode(202)
  @Post('forgot-password')
  async forgot(@Body(new ZodPipe(ForgotPasswordSchema)) body: ForgotPasswordInput) {
    await this.auth.forgotPassword(body.email);
    return { message: 'If an account exists for this email, a reset link is on its way.' };
  }

  @Public()
  @Throttle(authLimit())
  @HttpCode(200)
  @Post('reset-password')
  async reset(@Body(new ZodPipe(ResetPasswordSchema)) body: ResetPasswordInput) {
    await this.auth.resetPassword(body);
    return { message: 'Password updated. Log in with your new password.' };
  }
}
