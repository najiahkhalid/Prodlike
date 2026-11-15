import type { HealthResponse } from '@prodlike/shared';

/** Base URL for server-side calls (inside Docker this is the api service, not localhost). */
export const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

export async function getHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${API_INTERNAL_URL}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}
