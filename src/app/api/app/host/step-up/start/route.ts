import { type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { maskEmail, startHostOtp } from '@/lib/auth/host-otp';
import { appOwner, body, json } from '../shared';

/**
 * POST /api/app/host/step-up/start — email a 6-digit code to the owner.
 *
 * Body (optional): { locale?: 'tr'|'en'|'ar'|'ru' }
 * 200 { ok: true, expires_in_seconds, sent_to: 'a***@gmail.com' }
 * 429 { ok: false, error: 'wait', retry_after_seconds } | { error: 'too_many_sends' | 'rate_limited' }
 * 502 { ok: false, error: 'send_failed' } · 401 unauthorized · 403 not_owner
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCALES = routing.locales as readonly string[];

export async function POST(request: NextRequest) {
  const who = await appOwner(request);
  if ('error' in who) return who.error;

  const b = await body(request);
  const locale = typeof b.locale === 'string' && LOCALES.includes(b.locale) ? b.locale : routing.defaultLocale;

  const r = await startHostOtp({ ...who.owner, locale });
  if (r.ok) {
    return json({ ok: true, expires_in_seconds: r.expiresInSeconds, sent_to: maskEmail(who.owner.email) }, 200);
  }
  if (r.error === 'wait') return json({ ok: false, error: 'wait', retry_after_seconds: r.retryAfterSeconds }, 429);
  if (r.error === 'too_many_sends' || r.error === 'rate_limited') return json({ ok: false, error: r.error }, 429);
  if (r.error === 'send_failed') return json({ ok: false, error: 'send_failed' }, 502);
  return json({ ok: false, error: 'error' }, 500);
}
