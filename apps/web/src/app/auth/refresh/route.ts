import { NextResponse, type NextRequest } from 'next/server';
import { API_INTERNAL_URL } from '@/lib/api';

/** Only allow redirects back into this site (no open redirects). */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
}

/**
 * Used by the middleware when the access token has expired but a refresh token exists:
 * rotates the session with the API, forwards the new cookies, and returns to the page.
 */
export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get('next'));
  try {
    const res = await fetch(`${API_INTERNAL_URL}/auth/refresh`, {
      method: 'POST',
      headers: { cookie: req.headers.get('cookie') ?? '' },
      cache: 'no-store',
    });
    const target = res.ok ? next : `/login?next=${encodeURIComponent(next)}`;
    const out = NextResponse.redirect(new URL(target, req.url));
    for (const c of res.headers.getSetCookie()) out.headers.append('set-cookie', c);
    return out;
  } catch {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, req.url));
  }
}
