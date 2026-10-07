import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { routing } from '@/i18n/routing';

/**
 * GET /api/auth/sign-out?returnUrl=&locale=
 *
 * Ends this browser's WEBSITE session (scope 'local' — never the user's other
 * devices) and goes to returnUrl, internal paths only, else /{locale}. The
 * host portal sends the browser here after its own sign-out and idle logout,
 * so a host who signs out there is signed out here too.
 *
 * A GET on purpose: the portal reaches it with a plain top-level redirect,
 * which carries the website's SameSite=Lax cookies. Being linkable means any
 * page could sign a visitor out of the website — an annoyance, not a breach:
 * it grants nothing and reveals nothing.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCALES = routing.locales as readonly string[];

function safeReturnPath(raw: string | null, locale: string): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.startsWith('/api')) {
    return `/${locale}`;
  }
  const first = raw.split(/[/?#]/)[1] ?? '';
  return LOCALES.includes(first) ? raw : `/${locale}${raw === '/' ? '' : raw}`;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const localeParam = params.get('locale') ?? '';
  const locale = LOCALES.includes(localeParam) ? localeParam : routing.defaultLocale;

  const supabase = await createClient();
  // Harmless when there is no session; never fatal either way — the redirect
  // must happen so the portal's sign-out flow completes.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);

  const res = NextResponse.redirect(new URL(safeReturnPath(params.get('returnUrl'), locale), request.nextUrl.origin), 303);
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}
