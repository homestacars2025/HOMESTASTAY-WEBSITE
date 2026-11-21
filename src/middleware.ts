import createIntlMiddleware from 'next-intl/middleware';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

/**
 * transfer.homestastay.com — the drivers' subdomain (same project). Only
 * /d/<token> exists there; it is served by /driver/<lang>/<token> (outside the
 * locale tree: no site header, no analytics). Everything else on that host is
 * a 404. TRANSFER_HOST overrides the host name (e.g. for a preview).
 */
const TRANSFER_HOST = process.env.TRANSFER_HOST?.trim() || 'transfer.homestastay.com';
const DRIVER_LANGS = new Set(['tr', 'en', 'ar', 'ru']);

function driverHost(request: NextRequest): NextResponse | null {
  const host = (request.headers.get('host') ?? '').split(':')[0].toLowerCase();
  if (host !== TRANSFER_HOST && host !== 'transfer.localhost') return null;
  const m = /^\/d\/([A-Za-z0-9_-]{8,200})\/?$/.exec(request.nextUrl.pathname);
  const url = request.nextUrl.clone();
  if (!m) {
    url.pathname = '/driver/tr/-';
    const res = NextResponse.rewrite(url, { status: 404 });
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  }
  const langIn = request.nextUrl.searchParams.get('lang') ?? '';
  const lang = DRIVER_LANGS.has(langIn) ? langIn : 'tr';
  url.pathname = `/driver/${lang}/${m[1]}`;
  const res = NextResponse.rewrite(url);
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function middleware(request: NextRequest) {
  const driver = driverHost(request);
  if (driver) return driver;
  // The driver pages exist only on the transfer host.
  if (request.nextUrl.pathname === '/driver' || request.nextUrl.pathname.startsWith('/driver/')) {
    return new NextResponse('Not found', { status: 404 });
  }

  // Run next-intl locale detection/redirect first
  const response = intlMiddleware(request);

  // ── The saving: anonymous requests pay nothing for auth ────────────────────
  // getUser() is a network round-trip to Supabase Auth, and the old middleware
  // ran it on EVERY request — including the anonymous, public, first-load
  // traffic that is the whole point of the speed complaint. An anonymous
  // request carries no Supabase auth cookie, so there is no session to refresh
  // and nothing to do. Skip all Supabase work in that case.
  //
  // This changes NO auth ENFORCEMENT: protected routes gate themselves in
  // requireConfirmedUser (server-side, unchanged). The middleware only refreshes
  // sessions — so skipping it for users who have no session cannot lock anyone
  // out, and authenticated users still get their refresh below.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'));

  if (!hasAuthCookie) return response;

  // ── Authenticated request: refresh the session (@supabase/ssr contract) ────
  // Deliberately kept as getUser(), NOT getClaims(): getClaims validates the
  // JWT locally but does not refresh an expiring token, and dropping the
  // refresh would log users out when their token rotates — the exact lockout to
  // avoid. Only signed-in users (a small minority of traffic) pay this trip.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Exclusions, each load-bearing:
  //  - `api`: next-intl otherwise 307-redirects /api/* to /en/api/*, dropping
  //    the body of the Kuveyt Türk 3DS callback (a cross-site POST) so a paid
  //    booking looks failed.
  //  - `icon`, `apple-icon`, `opengraph-image`, `twitter-image`: App Router
  //    metadata routes, dotless so NOT caught by the .*\..* rule. Without this
  //    the <link rel="icon" href="/icon"> in every page 307-redirects to
  //    /en/icon and the favicon never loads — the browser tab stays blank.
  //  - Dotted metadata files (favicon.ico, manifest.webmanifest, sitemap.xml,
  //    robots.txt) are already excluded by the .*\..* segment.
  matcher: [
    '/((?!api|_next|_vercel|icon|apple-icon|opengraph-image|twitter-image|.*\\..*).*)',
  ],
};
