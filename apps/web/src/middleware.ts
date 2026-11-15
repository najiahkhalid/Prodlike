import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { AUTH_COOKIES, homeFor, type AccessTokenClaims, type Role } from '@prodlike/shared';

/**
 * Route protection (FR-02). The middleware only decides where a visitor may GO;
 * the API re-checks every request, so a forged cookie still gets nothing.
 *
 * 'members' = any signed-in account except a guest. Guests (the no-sign-up demo) may only use
 * their demo attempt and its debrief; anything else invites them to sign up and keep their result.
 */
const RULES: { prefix: string; roles: Role[] | 'members' | 'everyone' }[] = [
  { prefix: '/admin', roles: ['ADMIN'] },
  { prefix: '/instructor', roles: ['INSTRUCTOR', 'ADMIN'] },
  { prefix: '/dashboard', roles: 'members' },
  { prefix: '/scenarios', roles: 'everyone' },
  { prefix: '/attempts', roles: 'everyone' },
  { prefix: '/progress', roles: 'members' },
  { prefix: '/settings', roles: 'members' },
];
const AUTH_PAGES = ['/login', '/signup'];

const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET ?? '');

async function readSession(req: NextRequest): Promise<AccessTokenClaims | null> {
  const token = req.cookies.get(AUTH_COOKIES.access)?.value;
  if (!token || !process.env.JWT_ACCESS_SECRET) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: 'prodlike', algorithms: ['HS256'] });
    return payload as unknown as AccessTokenClaims;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await readSession(req);
  const hasRefresh = Boolean(req.cookies.get(AUTH_COOKIES.refresh)?.value);

  // Signed-in members do not need the login/sign-up pages (guests do: signing up keeps their demo).
  if (AUTH_PAGES.includes(pathname)) {
    if (session && session.role !== 'GUEST')
      return NextResponse.redirect(new URL(homeFor(session.role), req.url));
    return NextResponse.next();
  }

  const rule = RULES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  if (!rule) return NextResponse.next();

  const nextParam = encodeURIComponent(pathname + search);
  if (!session) {
    // Access token expired but a refresh token exists: renew silently, then come back.
    const target = hasRefresh ? `/auth/refresh?next=${nextParam}` : `/login?next=${nextParam}`;
    return NextResponse.redirect(new URL(target, req.url));
  }
  if (session.role === 'GUEST' && rule.roles !== 'everyone') {
    return NextResponse.redirect(new URL('/signup?claim=1', req.url));
  }
  if (Array.isArray(rule.roles) && !rule.roles.includes(session.role)) {
    const url = new URL(homeFor(session.role), req.url);
    url.searchParams.set('denied', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/signup',
    '/admin/:path*',
    '/instructor/:path*',
    '/dashboard/:path*',
    '/scenarios/:path*',
    '/attempts/:path*',
    '/progress/:path*',
    '/settings/:path*',
  ],
};
