import { type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { hostNextPath } from '@/lib/auth/portals';
import { isHostOtpRequired, mintHostHandoff } from '@/lib/auth/host-otp';
import { appOwner, body, json } from '../step-up/shared';

/**
 * POST /api/app/host/handoff — the app's door into the host portal.
 *
 * Behind the database switch host_login_otp_required():
 *   OFF (today): an active owner gets the handoff URL straight away, no grant
 *                — the portal accepts that while the switch is off.
 *   ON:          403 step_up_required — run /step-up/start, then /verify,
 *                which returns the URL with its grant.
 *
 * Body (optional JSON): { locale?: 'tr'|'en'|'ar'|'ru', next?: '/units'|… }
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCALES = routing.locales as readonly string[];

export async function POST(request: NextRequest) {
  const who = await appOwner(request);
  if ('error' in who) return who.error;

  if (await isHostOtpRequired()) return json({ ok: false, error: 'step_up_required' }, 403);

  const b = await body(request);
  const locale = typeof b.locale === 'string' && LOCALES.includes(b.locale) ? b.locale : routing.defaultLocale;
  const next = hostNextPath(typeof b.next === 'string' ? b.next : null);

  const url = await mintHostHandoff({ userId: who.owner.userId, email: who.owner.email, locale, next, grant: null });
  if (!url) return json({ ok: false, error: 'unavailable' }, 503);
  console.log('[app/host/handoff] issued (code not required)', { profileId: who.owner.userId });
  return json({ ok: true, url }, 200);
}
