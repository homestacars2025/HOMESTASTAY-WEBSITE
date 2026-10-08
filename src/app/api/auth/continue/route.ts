import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { routing } from '@/i18n/routing';
import { accountKind } from '@/lib/auth/account-role';
import { hostNextPath, portalPathOf } from '@/lib/auth/portals';
import { isHostOtpRequired, mintHostHandoff } from '@/lib/auth/host-otp';

/**
 * Where a just-signed-in account belongs. Every sign-in on the site ends here
 * with a full page load — password, email code, Google, phone — so the rule
 * lives in one place:
 *
 *   customer → returnUrl (internal paths only) or the home page
 *   owner    → /{locale}/host-verify: a 6-digit email code first. Only a
 *              successful code there mints the one-time magic link (with a
 *              grant) and hands off to the host portal's /api/auth/handoff,
 *              signing the website session out LOCALLY at that moment. Two independent sessions: signing out of
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
  // A host-portal page (/units, /en/bookings, …) is not a website page: it
  // would 404 here. Guests go home; owners never reach this function.
  if (portalPathOf(raw, LOCALES)) return home;
  return path;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const localeParam = params.get('locale') ?? '';
  const locale = LOCALES.includes(localeParam) ? localeParam : routing.defaultLocale;
  const origin = request.nextUrl.origin;

  const to = (path: string) => noStore(NextResponse.redirect(new URL(path, origin), 303));
  // The portal page a host asked for (sign-in?portal=host&next=…), allow-listed.
  // A portal path that arrived as returnUrl instead (/units, /en/bookings) is
  // read as that request too — never used as a website address.
  const next = hostNextPath(params.get('next')) ?? portalPathOf(params.get('returnUrl'), LOCALES);
  const notice = (reason: 'team' | 'admin' | 'blocked' | 'host') =>
    to(`/${locale}/account-notice?reason=${reason}`);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // No session: the sign-in did not stick (or this was opened directly).
  if (!user) {
    const query = new URLSearchParams();
    const back = params.get('returnUrl');
    if (back) query.set('returnUrl', back);
    if (next) { query.set('portal', 'host'); query.set('next', next); }
    const qs = query.toString();
    return to(`/${locale}/sign-in${qs ? `?${qs}` : ''}`);
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

    // The second step is behind a database switch (host_login_otp_required).
    // OFF: hand off straight away, as before — no grant; the portal accepts
    // that while the switch is off.
    if (!(await isHostOtpRequired())) {
      const url = await mintHostHandoff({ userId: user.id, email: user.email, locale, next, grant: null });
      if (!url) {
        await signOutHere();
        return notice('host');
      }
      await signOutHere();
      console.log('[auth/continue] owner handed off to the host portal (code not required)', { userId: user.id });
      return noStore(NextResponse.redirect(url, 303));
    }

    // ON: no handoff is minted here. The host proves the inbox with a 6-digit
    // code on /host-verify first, and only a successful verify there mints the
    // magic link (with its one-time grant). The website session stays signed
    // in until then — the code is bound to it — and is signed out locally at
    // the moment of the handoff.
    const query = new URLSearchParams({ portal: 'host' });
    if (next) query.set('next', next);
    return to(`/${locale}/host-verify?${query.toString()}`);
  }

  await signOutHere();
  return notice(kind);
}
