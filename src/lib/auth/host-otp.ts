import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendHostOtpEmail } from '@/lib/email/host-otp-email';
import { allow, ipForLog } from '@/lib/security/rate-limit';
import { hostHandoffUrl, type HostNextPath } from '@/lib/auth/portals';

/**
 * The host portal's second step: a 6-digit email code before every handoff.
 *
 * Shared by the website (/[locale]/host-verify) and the app
 * (/api/app/host/step-up/*), so both enforce the same rules:
 *
 *   start   host_otp_start(user, session)  → a fresh code, emailed via Resend
 *   verify  host_otp_verify(user, session, code) → a one-time GRANT
 *   handoff generateLink(magiclink) + &grant= → the portal, which consumes the
 *           grant (host_step_up_grant) to mark ITS new session as verified
 *
 * `session` is the caller's own auth session id (the JWT's session_id), so a
 * code proves possession of the inbox FOR THIS SIGN-IN, not for the account
 * in general. The database owns the real limits (60 s between sends, 5 an
 * hour, 5 wrong tries → 15-minute lock); this module adds per-user and per-IP
 * limits in front of it.
 *
 * NEVER LOGGED, NEVER RETURNED: the code. The grant and the magic-link token
 * only ever leave inside the handoff URL.
 */

export type StartResult =
  | { ok: true; expiresInSeconds: number }
  | { ok: false; error: 'wait'; retryAfterSeconds: number }
  | { ok: false; error: 'too_many_sends' | 'rate_limited' | 'send_failed' | 'error' };

export type VerifyResult =
  | { ok: true; grant: string }
  | { ok: false; error: 'invalid'; attemptsLeft: number | null }
  | { ok: false; error: 'expired' | 'locked' | 'rate_limited' | 'malformed' | 'error' };

interface Who {
  userId: string;
  sessionId: string;
  ip: string;
}

const MINUTE = 60_000;

function log(event: string, who: Who, result: string, extra: Record<string, unknown> = {}) {
  // Structured, one line, no secrets: user, session, a truncated IP, outcome.
  console.info('[host-otp]', JSON.stringify({ event, userId: who.userId, sessionId: who.sessionId, ip: ipForLog(who.ip), result, ...extra }));
}

/** The RPCs return a single json object; PostgREST may wrap it in an array. */
function row(data: unknown): Record<string, unknown> | null {
  const r = Array.isArray(data) ? data[0] : data;
  return r && typeof r === 'object' ? (r as Record<string, unknown>) : null;
}

export async function startHostOtp(who: Who & { email: string; locale: string }): Promise<StartResult> {
  if (!allow(`otp-start:u:${who.userId}`, 6, 10 * MINUTE) || !allow(`otp-start:ip:${who.ip}`, 30, 10 * MINUTE)) {
    log('start', who, 'rate_limited');
    return { ok: false, error: 'rate_limited' };
  }

  const { data, error } = await createAdminClient().rpc('host_otp_start', {
    p_user_id: who.userId,
    p_session_id: who.sessionId,
  });
  if (error) {
    log('start', who, 'rpc_error', { code: error.code });
    return { ok: false, error: 'error' };
  }

  const r = row(data);
  if (!r?.ok) {
    if (r?.error === 'wait') {
      const retry = Number(r.retry_after_seconds);
      log('start', who, 'wait');
      return { ok: false, error: 'wait', retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : 60 };
    }
    log('start', who, String(r?.error ?? 'unknown'));
    return { ok: false, error: r?.error === 'too_many_sends' ? 'too_many_sends' : 'error' };
  }

  const code = typeof r.code === 'string' ? r.code : '';
  // Only ever six digits go into the email's HTML.
  if (!/^\d{6}$/.test(code)) {
    log('start', who, 'bad_code_shape');
    return { ok: false, error: 'error' };
  }

  const sent = await sendHostOtpEmail({ to: who.email, code, locale: who.locale });
  log('start', who, sent ? 'sent' : 'send_failed');
  if (!sent) return { ok: false, error: 'send_failed' };

  const expires = Number(r.expires_in_seconds);
  return { ok: true, expiresInSeconds: Number.isFinite(expires) && expires > 0 ? expires : 600 };
}

export async function verifyHostOtp(who: Who & { code: string }): Promise<VerifyResult> {
  const code = who.code.replace(/\D/g, '');
  if (code.length !== 6) return { ok: false, error: 'malformed' };

  if (!allow(`otp-verify:u:${who.userId}`, 10, 10 * MINUTE) || !allow(`otp-verify:ip:${who.ip}`, 40, 10 * MINUTE)) {
    log('verify', who, 'rate_limited');
    return { ok: false, error: 'rate_limited' };
  }

  const { data, error } = await createAdminClient().rpc('host_otp_verify', {
    p_user_id: who.userId,
    p_session_id: who.sessionId,
    p_code: code,
  });
  if (error) {
    log('verify', who, 'rpc_error', { code: error.code });
    return { ok: false, error: 'error' };
  }

  const r = row(data);
  if (r?.ok && typeof r.grant === 'string' && r.grant.length > 0) {
    log('verify', who, 'ok');
    return { ok: true, grant: r.grant };
  }

  const reason = String(r?.error ?? 'unknown');
  log('verify', who, reason);
  if (reason === 'invalid') {
    const left = Number(r?.attempts_left);
    return { ok: false, error: 'invalid', attemptsLeft: Number.isFinite(left) ? left : null };
  }
  if (reason === 'expired' || reason === 'locked') return { ok: false, error: reason };
  return { ok: false, error: 'error' };
}

/**
 * Whether hosts must pass the email code before the portal handoff — the
 * database switch host_login_otp_required(). Off today (product decision); the
 * whole OTP flow stays in place for the day it is turned on.
 *
 * FAILS CLOSED: if the switch cannot be read, the code is required. An outage
 * must never quietly turn a security step off; at worst a host types a code
 * they did not strictly need.
 */
export async function isHostOtpRequired(): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc('host_login_otp_required');
  if (error) {
    console.error('[host-otp] switch unreadable — requiring the code', { code: error.code });
    return true;
  }
  return data !== false;
}

/**
 * The handoff. With the switch on, only ever called with the grant from a
 * successful verify; with it off, with grant: null. Returns null when the
 * magic link could not be generated (logged, without the token).
 */
export async function mintHostHandoff({
  userId, email, locale, next, grant,
}: {
  userId: string; email: string; locale: string; next: HostNextPath | null; grant: string | null;
}): Promise<string | null> {
  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    console.error('[host-otp] handoff link could not be minted', { userId, code: error?.code, status: error?.status });
    return null;
  }
  return hostHandoffUrl(tokenHash, locale, next, grant);
}

/** a***@gmail.com — enough to recognise the inbox, not enough to harvest it. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local[0]}***@${domain}`;
}
