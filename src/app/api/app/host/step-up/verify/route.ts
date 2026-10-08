import { type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { hostNextPath } from '@/lib/auth/portals';
import { mintHostHandoff, verifyHostOtp } from '@/lib/auth/host-otp';
import { appOwner, body, json } from '../shared';

/**
 * POST /api/app/host/step-up/verify — check the code; on success, the portal.
 *
 * Body: { code: '123456', locale?: 'tr'|'en'|'ar'|'ru', next?: '/units'|… }
 * 200 { ok: true, url }  — the one-time portal handoff (token_hash + grant);
 *                          open it in the system browser, once, promptly.
 * 400 { ok: false, error: 'invalid', attempts_left } | { error: 'expired' | 'malformed' }
 * 423 { ok: false, error: 'locked' } · 429 rate_limited · 401 · 403 not_owner
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCALES = routing.locales as readonly string[];

export async function POST(request: NextRequest) {
  const who = await appOwner(request);
  if ('error' in who) return who.error;

  const b = await body(request);
  const code = typeof b.code === 'string' ? b.code : '';
  const locale = typeof b.locale === 'string' && LOCALES.includes(b.locale) ? b.locale : routing.defaultLocale;
  const next = hostNextPath(typeof b.next === 'string' ? b.next : null);

  const r = await verifyHostOtp({ ...who.owner, code });
  if (!r.ok) {
    if (r.error === 'invalid') return json({ ok: false, error: 'invalid', attempts_left: r.attemptsLeft }, 400);
    if (r.error === 'expired' || r.error === 'malformed') return json({ ok: false, error: r.error }, 400);
    if (r.error === 'locked') return json({ ok: false, error: 'locked' }, 423);
    if (r.error === 'rate_limited') return json({ ok: false, error: 'rate_limited' }, 429);
    return json({ ok: false, error: 'error' }, 500);
  }

  const url = await mintHostHandoff({ userId: who.owner.userId, email: who.owner.email, locale, next, grant: r.grant });
  if (!url) return json({ ok: false, error: 'unavailable' }, 503);
  return json({ ok: true, url }, 200);
}
