import { z } from 'zod';

/** Roles a person can choose when signing up. ADMIN is assigned, never self-selected. */
export const SIGNUP_ROLES = ['LEARNER', 'INSTRUCTOR'] as const;
export const ROLES = ['GUEST', 'LEARNER', 'INSTRUCTOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

const email = z.string().trim().toLowerCase().email('Enter a valid email address, e.g. name@seecs.edu.pk');
const password = z.string().min(10, 'Use at least 10 characters').max(128, 'Use at most 128 characters');

export const RegisterSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(80),
  email,
  password,
  organisation: z.string().trim().max(120).optional(),
  role: z.enum(SIGNUP_ROLES).default('LEARNER'),
});
export type RegisterInput = z.input<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.input<typeof LoginSchema>;

export const ForgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.input<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(20, 'This reset link is invalid'),
  password,
});
export type ResetPasswordInput = z.input<typeof ResetPasswordSchema>;

/** The signed-in user, as returned by GET /auth/me. */
export interface Me {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  organisation: string | null;
  onboarded: boolean;
}

/** Claims inside the access token (also read by the web middleware). */
export interface AccessTokenClaims {
  sub: string;
  role: Role;
  name: string;
}

/** Cookie names shared by the API (sets them) and the web app (reads them). */
export const AUTH_COOKIES = { access: 'pl_at', refresh: 'pl_rt' } as const;

/** Home page for each role after login. */
export function homeFor(role: Role): string {
  if (role === 'GUEST') return '/demo';
  if (role === 'INSTRUCTOR') return '/instructor';
  if (role === 'ADMIN') return '/admin';
  return '/dashboard';
}
