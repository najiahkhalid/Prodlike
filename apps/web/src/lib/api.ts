import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ApiError, HealthResponse, Me } from '@prodlike/shared';

/** Base URL for server-side calls (inside Docker this is the api service, not localhost). */
export const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiError };

/** Server-side call to the API, forwarding the visitor's cookies. */
export async function serverApi<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const cookieHeader = (await cookies()).toString();
  try {
    const res = await fetch(`${API_INTERNAL_URL}${path}`, {
      ...init,
      cache: 'no-store',
      headers: { ...(init.headers ?? {}), cookie: cookieHeader, accept: 'application/json' },
      signal: init.signal ?? AbortSignal.timeout(5000),
    });
    const body = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: body as T };
    return {
      ok: false,
      status: res.status,
      error: (body as ApiError) ?? { code: `HTTP_${res.status}`, message: 'Request failed.' },
    };
  } catch {
    return {
      ok: false,
      status: 503,
      error: {
        code: 'API_UNREACHABLE',
        message: 'The Prodlike API is not reachable.',
        action: 'Try again in a moment.',
      },
    };
  }
}

/** The signed-in user, or a redirect to login (middleware normally guarantees a session). */
export async function requireMe(nextPath: string): Promise<Me> {
  const me = await serverApi<Me>('/auth/me');
  if (!me.ok) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return me.data;
}

export async function getHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${API_INTERNAL_URL}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}
