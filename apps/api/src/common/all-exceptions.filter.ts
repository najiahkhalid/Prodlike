import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import type { ApiError } from '@prodlike/shared';

/** Turns every error into the shared ApiError shape `{ code, message, action }` (NFR-09). */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toApiError(exception);
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(status).json(body);
  }

  private toApiError(e: unknown): { status: number; body: ApiError } {
    if (e instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        body: {
          code: 'RATE_LIMITED',
          message: 'Too many attempts in a short time.',
          action: 'Wait a minute, then try again.',
        },
      };
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const r = e.getResponse();
      if (typeof r === 'object' && r !== null && 'code' in r) return { status, body: r as ApiError };
      if (status === HttpStatus.NOT_FOUND) {
        return {
          status,
          body: { code: 'NOT_FOUND', message: 'This endpoint does not exist.', action: 'Check the URL.' },
        };
      }
      const message = typeof r === 'string' ? r : ((r as { message?: string }).message ?? e.message);
      return { status, body: { code: `HTTP_${status}`, message: String(message) } };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: 'INTERNAL',
        message: 'Something went wrong on our side.',
        action: 'Try again. If it keeps happening, tell the Prodlike team.',
      },
    };
  }
}
