'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { accountKind } from '@/lib/auth/account-role';
import { currentSessionId } from '@/lib/auth/session-id';
import { clientIp } from '@/lib/security/rate-limit';
import { hostNextPath } from '@/lib/auth/portals';
import { mintHostHandoff, startHostOtp, verifyHostOtp } from '@/lib/auth/host-otp';
import { routing } from '@/i18n/routing';

/**
 * The website side of the host's second step. Both actions re-derive WHO is
 * asking from the session cookie on every call — user, role, session id — so
 * nothing the browser sends can name another account or session.
 */

export type SendCodeResult =
  | { ok: true }
  | { ok: false; error: 'wait'; retryAfterSeconds: number }
  | { ok: false; error: 'too_many_sends' | 'rate_limited' | 'send_failed' | 'signed_out' | 'error' };

export type VerifyCodeResult =
  | { ok: true; url: string }
  | { ok: false; error: 'invalid'; attemptsLeft: number | null }
  | { ok: false; error: 'expired' | 'locked' | 'rate_limited' | 'malformed' | 'signed_out' | 'error' };

const LOCALES = routing.locales as readonly string[];

async function owner() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  if ((await accountKind(user.id)) !== 'owner') return null;
  const sessionId = await currentSessionId(supabase);
  if (!sessionId) return null;
  const ip = clientIp(await headers());
  return { supabase, user, email: user.email, sessionId, ip };
}

export async function sendHostCode(locale: string): Promise<SendCodeResult> {
  const who = await owner();
  if (!who) return { ok: false, error: 'signed_out' };

  const r = await startHostOtp({
    userId: who.user.id,
    sessionId: who.sessionId,
    ip: who.ip,
    email: who.email,
    locale: LOCALES.includes(locale) ? locale : routing.defaultLocale,
  });
  if (r.ok) return { ok: true };
  if (r.error === 'wait') return { ok: false, error: 'wait', retryAfterSeconds: r.retryAfterSeconds };
  return { ok: false, error: r.error };
}

export async function verifyHostCode(code: string, locale: string, next: string | null): Promise<VerifyCodeResult> {
  if (typeof code !== 'string') return { ok: false, error: 'malformed' };
  const who = await owner();
  if (!who) return { ok: false, error: 'signed_out' };

  const r = await verifyHostOtp({ userId: who.user.id, sessionId: who.sessionId, ip: who.ip, code });
  if (!r.ok) {
    if (r.error === 'invalid') return { ok: false, error: 'invalid', attemptsLeft: r.attemptsLeft };
    return { ok: false, error: r.error };
  }

  const safeLocale = LOCALES.includes(locale) ? locale : routing.defaultLocale;
  const url = await mintHostHandoff({
    userId: who.user.id,
    email: who.email,
    locale: safeLocale,
    next: hostNextPath(next),
    grant: r.grant,
  });
  if (!url) return { ok: false, error: 'error' };

  // The portal gets its own session from the handoff; this one is done.
  await who.supabase.auth.signOut({ scope: 'local' });
  console.log('[host-verify] owner handed off to the host portal', { userId: who.user.id });
  return { ok: true, url };
}
