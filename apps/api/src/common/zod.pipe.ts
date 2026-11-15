import { HttpStatus, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';
import { ApiException } from './api-exception';

/** Validates a body or query with a shared zod schema; the first problem becomes the message. */
export class ZodPipe<S extends ZodTypeAny> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || 'form';
      fields[key] ??= issue.message;
    }
    const first = result.error.issues[0];
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_FAILED',
      first.message,
      'Correct the highlighted field and submit again.',
      fields,
    );
  }
}
