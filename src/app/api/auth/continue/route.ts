import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { routing } from '@/i18n/routing';
import { accountKind } from '@/lib/auth/account-role';
import { hostHandoffUrl } from '@/lib/auth/portals';

/**
 * Where a just-signed-in account belongs. Every sign-in on the site ends here
 * with a full page load — password, email code, Google, phone — so the rule
 * lives in one place:
 *
 *   customer → returnUrl (internal paths only) or the home page
 *   owner    → a one-time magic-link token (auth.admin.generateLink, no email
 *              sent), the website session signed out LOCALLY, then the host
 *              portal's /api/auth/handoff, which exchanges the token for the
 *              portal's own session. Two independent sessions: signing out of
 *              one never signs the user out of the other.
 *   team / admin → signed out locally, told where their sign-in is
 *   blocked  → signed out locally, told plainly
 *
 * Under /api so the locale middleware leaves it alone (see middleware.ts).
 * Every response is no-store and no-referrer: the host redirect carries a
 * one-time credential in its URL, and nothing here may be cached.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCALES = routing.locales as readonly string[];

/** Pages a return trip must never land on — they would only loop back here. */
const NO_RETURN = ['/sign-in', '/sign-up', '/verify-email', '/complete-profile', '/forgot-password', '/reset-password', '/account-notice'];

function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}

/**
 * An internal, locale-prefixed path, or the home page. Absolute URLs,
 * protocol-relative ones and backslash tricks are refused: an open redirect at
 * the end of a sign-in is a phishing primitive.
 */
function safeReturnPath(raw: string | null, locale: string): string {
  const home = `/${locale}`;
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return home;

  // Already prefixed (/en/stays/…) or not (/stays/…) — both are accepted.
  const firstSegment = raw.split(/[/?#]/)[1] ?? '';
  const prefixed = LOCALES.includes(firstSegment);
  const path = prefixed ? raw : `${home}${raw === '/' ? '' : raw}`;
  const bare = prefixed ? raw.slice(firstSegment.length + 1) || '/' : raw;

  if (bare.startsWith('/api') || NO_RETURN.some((p) => bare === p || bare.startsWith(`${p}?`) || bare.startsWith(`${p}/`))) {
    return home;
  }
  return path;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const localeParam = params.get('locale') ?? '';
  const locale = LOCALES.includes(localeParam) ? localeParam : routing.defaultLocale;
  const origin = request.nextUrl.origin;

  const to = (path: string) => noStore(NextResponse.redirect(new URL(path, origin), 303));
  const notice = (reason: 'team' | 'admin' | 'blocked' | 'host') =>
    to(`/${locale}/account-notice?reason=${reason}`);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // No session: the sign-in did not stick (or this was opened directly).
  if (!user) {
    const back = params.get('returnUrl');
    return to(`/${locale}/sign-in${back ? `?returnUrl=${encodeURIComponent(back)}` : ''}`);
  }

  const kind = await accountKind(user.id);

  if (kind === 'customer') {
    return to(safeReturnPath(params.get('returnUrl'), locale));
  }

  // Everyone else leaves the customer site signed out of it. scope 'local':
  // only THIS browser's website session ends — never the user's sessions in
  // the portals or on their other devices.
  const signOutHere = () => supabase.auth.signOut({ scope: 'local' });

  if (kind === 'owner') {
    if (!user.email) {
      // generateLink needs an email. Every owner has one today; if that ever
      // stops being true, send them to the portal's own sign-in, not a 500.
      console.error('[auth/continue] owner without email — cannot hand off', { userId: user.id });
      await signOutHere();
      return notice('host');
    }

    const { data, error } = await createAdminClient().auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
    });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) {
      console.error('[auth/continue] handoff link could not be minted', {
        userId: user.id, code: error?.code, status: error?.status,
      });
      await signOutHere();
      return notice('host');
    }

    await signOutHere();
    // Logged without the token: it is a one-time credential.
    console.log('[auth/continue] owner handed off to the host portal', { userId: user.id });
    return noStore(NextResponse.redirect(hostHandoffUrl(tokenHash, locale), 303));
  }

  await signOutHere();
  return notice(kind);
}
