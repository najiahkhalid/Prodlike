import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { AUTH_COOKIES, type AccessTokenClaims } from '@prodlike/shared';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');

/**
 * Short-lived access JWT + rotating refresh token, both in httpOnly cookies (ADR-004, NFR-11).
 * Refresh tokens are stored only as SHA-256 hashes, so a database leak does not leak sessions.
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async issue(res: Response, claims: AccessTokenClaims): Promise<void> {
    const accessTtl = this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true });
    const refreshDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });

    const access = await this.jwt.signAsync({ ...claims }, { expiresIn: accessTtl });
    const refresh = randomToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: claims.sub,
        tokenHash: sha256(refresh),
        expiresAt: new Date(Date.now() + refreshDays * 86_400_000),
      },
    });

    res.cookie(AUTH_COOKIES.access, access, this.cookieOptions(accessTtl * 1000));
    res.cookie(AUTH_COOKIES.refresh, refresh, this.cookieOptions(refreshDays * 86_400_000));
  }

  /**
   * Exchange a refresh token for a new pair. A reused (already revoked) token means it was stolen:
   * every session of that user is revoked.
   */
  async rotate(res: Response, refresh: string | undefined): Promise<string | null> {
    if (!refresh) return null;
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refresh) },
      include: { user: true },
    });
    if (!row) return null;
    if (row.revokedAt) {
      await this.revokeAll(row.userId);
      return null;
    }
    if (row.expiresAt < new Date()) return null;

    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    await this.issue(res, { sub: row.user.id, role: row.user.role, name: row.user.name });
    return row.user.id;
  }

  async revoke(refresh: string | undefined): Promise<void> {
    if (!refresh) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refresh), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  clear(res: Response): void {
    res.clearCookie(AUTH_COOKIES.access, this.cookieOptions(0));
    res.clearCookie(AUTH_COOKIES.refresh, this.cookieOptions(0));
  }

  verifyAccess(token: string): Promise<AccessTokenClaims> {
    return this.jwt.verifyAsync<AccessTokenClaims>(token);
  }

  private cookieOptions(maxAgeMs: number) {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'lax' as const,
      path: '/',
      maxAge: maxAgeMs,
    };
  }
}
