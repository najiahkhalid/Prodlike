import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hash, hashSync } from 'bcryptjs';
import type { Response } from 'express';
import type {
  ChangePasswordInput,
  LoginInput,
  Me,
  RegisterSchema,
  ResetPasswordInput,
  UpdateProfileSchema,
} from '@prodlike/shared';
import type { z } from 'zod';
import type { User } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';
import { TokensService, randomToken, sha256 } from './tokens.service';

const BCRYPT_ROUNDS = 12;
const GUEST_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = hashSync('prodlike-timing-equaliser', BCRYPT_ROUNDS);

export function toMe(u: User): Me {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    organisation: u.organisation,
    onboarded: u.onboardedAt !== null,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Guest demo (A2 refinement 1): a temporary account, removed after 24 h unless the guest signs up. */
  async createGuest(res: Response): Promise<Me> {
    const user = await this.prisma.user.create({
      data: {
        name: 'Guest',
        role: 'GUEST',
        guestExpiresAt: new Date(Date.now() + GUEST_TTL_MS),
        onboardedAt: new Date(),
      },
    });
    await this.tokens.issue(res, { sub: user.id, role: user.role, name: user.name });
    return toMe(user);
  }

  /**
   * Sign up. If the visitor is currently a guest, the guest account itself becomes the real
   * account, so the demo attempt and its debrief are kept ("save this result").
   */
  async register(
    input: z.output<typeof RegisterSchema>,
    res: Response,
    current?: { sub: string; role: string },
  ): Promise<Me> {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'EMAIL_TAKEN',
        'An account with this email already exists.',
        'Log in instead, or reset your password if you forgot it.',
        { email: 'An account with this email already exists.' },
      );
    }
    const data = {
      name: input.name,
      email: input.email,
      organisation: input.organisation || null,
      role: input.role,
      passwordHash: await hash(input.password, BCRYPT_ROUNDS),
    };
    const guest =
      current?.role === 'GUEST'
        ? await this.prisma.user.findFirst({ where: { id: current.sub, role: 'GUEST' } })
        : null;
    const user = guest
      ? await this.prisma.user.update({
          where: { id: guest.id },
          data: { ...data, guestExpiresAt: null, onboardedAt: null },
        })
      : await this.prisma.user.create({ data });
    if (guest) await this.tokens.revokeAll(guest.id);
    await this.tokens.issue(res, { sub: user.id, role: user.role, name: user.name });
    return toMe(user);
  }

  async login(input: LoginInput, res: Response): Promise<Me> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
    const ok = await compare(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.passwordHash || !ok) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'Email or password is incorrect.',
        'Check them and try again, or reset your password.',
      );
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
    await this.tokens.issue(res, { sub: user.id, role: user.role, name: user.name });
    return toMe(user);
  }

  async me(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
        'Your account no longer exists.',
        'Sign up again.',
      );
    }
    return toMe(user);
  }

  async markOnboarded(userId: string): Promise<Me> {
    const user = await this.prisma.user.update({ where: { id: userId }, data: { onboardedAt: new Date() } });
    return toMe(user);
  }

  /** Profile & Settings: change your own name and organisation. */
  async updateProfile(userId: string, input: z.output<typeof UpdateProfileSchema>): Promise<Me> {
    await this.assertMember(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: input.name,
        ...(input.organisation !== undefined ? { organisation: input.organisation } : {}),
      },
    });
    return toMe(user);
  }

  /**
   * Change password, knowing the current one. Every other session is signed out; this browser gets
   * fresh tokens so it stays signed in.
   */
  async changePassword(userId: string, input: ChangePasswordInput, res: Response): Promise<Me> {
    const user = await this.assertMember(userId);
    if (!(await compare(input.currentPassword, user.passwordHash ?? DUMMY_HASH))) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'WRONG_PASSWORD',
        'Your current password is not correct.',
        'Type it again, or use "Forgot password" on the login page.',
        { currentPassword: 'This is not your current password' },
      );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hash(input.newPassword, BCRYPT_ROUNDS) },
    });
    await this.tokens.revokeAll(userId);
    await this.tokens.issue(res, { sub: user.id, role: user.role, name: user.name });
    return toMe(user);
  }

  private async assertMember(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Please log in.', 'Log in again.');
    if (user.role === 'GUEST' || !user.passwordHash) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'SIGN_UP_REQUIRED',
        'Guest sessions have no profile.',
        'Create a free account to keep your progress and settings.',
      );
    }
    return user;
  }

  /** Always succeeds, whether or not the email exists, so the form cannot be used to find accounts. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) return;
    const token = randomToken();
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    const link = `${this.config.get('APP_URL', { infer: true })}/reset-password?token=${token}`;
    await this.mail.send({
      to: email,
      subject: 'Reset your Prodlike password',
      text: `Hi ${user.name},\n\nReset your password with this link (valid for 30 minutes):\n${link}\n\nIf you did not ask for this, ignore this email.`,
    });
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(input.token) },
    });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'RESET_LINK_INVALID',
        'This reset link is invalid or has expired.',
        'Request a new link from the "Forgot password" page.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash: await hash(input.password, BCRYPT_ROUNDS) },
      }),
      this.prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    ]);
    // A password reset signs the user out everywhere.
    await this.tokens.revokeAll(row.userId);
  }
}
