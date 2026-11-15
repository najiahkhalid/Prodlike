import { NextResponse, type NextRequest } from 'next/server';
import { API_INTERNAL_URL } from '@/lib/api';

/** Logout is a POST form (never a GET link, so it cannot be triggered by a stray prefetch). */
export async function POST(req: NextRequest) {
  const out = NextResponse.redirect(new URL('/login?loggedOut=1', req.url), { status: 303 });
  try {
    const res = await fetch(`${API_INTERNAL_URL}/auth/logout`, {
      method: 'POST',
      headers: { cookie: req.headers.get('cookie') ?? '' },
      cache: 'no-store',
    });
    for (const c of res.headers.getSetCookie()) out.headers.append('set-cookie', c);
  } catch {
    // API down: still clear the cookies locally.
  }
  out.cookies.delete('pl_at');
  out.cookies.delete('pl_rt');
  return out;
}
