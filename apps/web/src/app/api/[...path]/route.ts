import type { NextRequest } from 'next/server';

/**
 * Same-origin proxy: the browser calls /api/*, this forwards to the API, so auth cookies stay
 * first-party. It reads API_INTERNAL_URL at RUNTIME (next.config rewrites are fixed at build
 * time, which breaks Docker and tests). In Docker, Caddy sends /api to the API directly.
 */
export const dynamic = 'force-dynamic';

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'host', 'content-length']);

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const api = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
  const target = `${api}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key)) headers.set(key, value);
  });
  headers.set('x-forwarded-for', req.headers.get('x-forwarded-for') ?? '127.0.0.1');

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(),
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return Response.json(
      {
        code: 'API_UNREACHABLE',
        message: 'The Prodlike API is not reachable.',
        action: 'Try again in a moment.',
      },
      { status: 503 },
    );
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key) && key !== 'set-cookie' && key !== 'content-encoding') out.set(key, value);
  });
  for (const c of upstream.headers.getSetCookie()) out.append('set-cookie', c);
  const body = upstream.status === 204 ? null : await upstream.arrayBuffer();
  return new Response(body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
