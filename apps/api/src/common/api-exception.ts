import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiError } from '@prodlike/shared';

/**
 * Every deliberate API error: a stable machine code, a human message saying what happened,
 * and an action saying what the user can do next (NFR-09).
 */
export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    code: string,
    message: string,
    action?: string,
    fields?: Record<string, string>,
  ) {
    super(
      { code, message, action, ...(fields ? { fields } : {}) } satisfies ApiError & { fields?: unknown },
      status,
    );
  }
}

export const Errors = {
  unauthenticated: () =>
    new ApiException(
      HttpStatus.UNAUTHORIZED,
      'UNAUTHENTICATED',
      'You are not signed in.',
      'Log in and try again.',
    ),
  forbidden: () =>
    new ApiException(
      HttpStatus.FORBIDDEN,
      'FORBIDDEN',
      'Your account does not have access to this page.',
      'Go back to your dashboard, or ask an admin for access.',
    ),
  notFound: (what: string) =>
    new ApiException(
      HttpStatus.NOT_FOUND,
      'NOT_FOUND',
      `${what} was not found.`,
      'Check the link and try again.',
    ),
};
