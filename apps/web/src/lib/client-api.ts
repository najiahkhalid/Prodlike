'use client';
import type { ApiError } from '@prodlike/shared';

export class ClientApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiError & { fields?: Record<string, string> },
  ) {
    super(body.message);
  }
}

/**
 * Browser-side call to the API through the same-origin /api proxy.
 * On 401 it refreshes the session once and retries, so an expired access token is invisible.
 */
export async function clientApi<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new ClientApiError(0, {
      code: 'NETWORK',
      message: 'Could not reach Prodlike.',
      action: 'Check your connection and try again.',
    });
  }

  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    const refreshed = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
    if (refreshed.ok) return clientApi<T>(path, init, true);
  }

  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw new ClientApiError(
      res.status,
      body ?? { code: `HTTP_${res.status}`, message: 'Something went wrong.' },
    );
  }
  return body as T;
}
