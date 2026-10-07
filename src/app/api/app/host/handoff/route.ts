import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/app/auth';
import { accountKind } from '@/lib/auth/account-role';
import { hostHandoffUrl, hostNextPath } from '@/lib/auth/portals';
import { routing } from '@/i18n/routing';

/**
 * POST /api/app/host/handoff — the app's door into the host portal.
 *
 * Same bearer auth as /api/app/wallet/*. For an ACTIVE owner it mints a
 * one-time magic-link token (auth.admin.generateLink — no email is sent) and
 * returns the portal handoff URL for the app to open in the system browser,
 * where the portal exchanges it for its own session. Anyone else: 403
 * not_owner.
 *
 * Body (optional JSON): { locale?: 'tr'|'en'|'ar'|'ru', next?: '/units'|… }
 * — both validated; unknown values fall back to the defaults.
 *
 * The URL carries a one-time credential: the response is no-store, and the
 * token is never logged.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCALES = routing.locales as readonly string[];

function json(body: unknown, status: number): NextResponse {
  const res = NextResponse.json(body, { status });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function POST(request: NextRequest) {
  const caller = await authenticate(request);
  if (!caller) return json({ ok: false, error: 'unauthorized' }, 401);

  // Active owners only. accountKind() reads role AND status: a suspended host
  // is 'blocked', not 'owner', so they are refused here like everyone else.
  if ((await accountKind(caller.user.id)) !== 'owner' || !caller.user.email) {
    return json({ ok: false, error: 'not_owner' }, 403);
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch { /* no body: defaults */ }

  const locale = typeof body.locale === 'string' && LOCALES.includes(body.locale)
    ? body.locale
    : routing.defaultLocale;
  const next = hostNextPath(typeof body.next === 'string' ? body.next : null);

  const { data, error } = await createAdminClient().auth.admin.generateLink({
    type: 'magiclink',
    email: caller.user.email,
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    console.error('[app/host/handoff] link could not be minted', {
      profileId: caller.user.id, code: error?.code, status: error?.status,
    });
    return json({ ok: false, error: 'unavailable' }, 503);
  }

  console.log('[app/host/handoff] issued', { profileId: caller.user.id });
  return json({ ok: true, url: hostHandoffUrl(tokenHash, locale, next) }, 200);
}
