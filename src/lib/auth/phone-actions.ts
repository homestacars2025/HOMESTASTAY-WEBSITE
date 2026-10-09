'use server';

import { headers } from 'next/headers';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { allow, clientIp, ipForLog } from '@/lib/security/rate-limit';
import { TURNSTILE_ACTION_PHONE, verifyTurnstile } from '@/lib/security/turnstile';

/**
 * Every SMS the website causes goes through these two actions — never from
 * the browser straight to Supabase — so each one is gated, in this order:
 *
 *   1. the number is a real E.164 number;
 *   2. a Cloudflare Turnstile token, verified server-side (single-use);
 *   3. rate limits per IP and per number (3 / 10 min and 10 / day per
 *      number; 10 / 10 min and 30 / day per IP — in memory, per instance,
 *      in front of Supabase's own project-wide SMS limit);
 *   4. phone_account_check(): who, if anyone, owns the number.
 *
 * Only then is an SMS sent. A number that belongs to an EMAIL account gets no
 * SMS at all — the guest is pointed to email sign-in instead — and a new
 * number creates an account only on the sign-up path or after the guest
 * confirms "create an account with this number".
 *
 * Logs carry the last 4 digits only.
 */

export type PhoneCodeResult =
  | { ok: true }
  | { ok: false; error: 'invalid' }
  | { ok: false; error: 'new_account' }
  | { ok: false; error: 'email_account'; emailHint: string | null }
  | { ok: false; error: 'captcha' | 'rate_limited' | 'sms_rate_limited' | 'send_failed' | 'unavailable' | 'error' };

export type PhoneChangeResult =
  | { ok: true }
  | { ok: false; error: 'invalid' | 'phone_exists' | 'signed_out' }
  | { ok: false; error: 'captcha' | 'rate_limited' | 'sms_rate_limited' | 'send_failed' | 'unavailable' | 'error' };

const E164_RE = /^\+[1-9][0-9]{6,14}$/;
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const tail = (phone: string) => `…${phone.slice(-4)}`;

/**
 * E.164 shape here; the deeper "is this a real number for its country" check
 * is phone_account_check's ('invalid'), and the browser already ran
 * libphonenumber's for instant feedback.
 */
function validPhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const phone = raw.replace(/[^\d+]/g, '');
  return E164_RE.test(phone) ? phone : null;
}

/** Captcha + limits, shared by both actions. Null when the request may go on. */
async function gate(phone: string, captchaToken: unknown): Promise<'captcha' | 'rate_limited' | 'unavailable' | null> {
  if (!process.env.TURNSTILE_SECRET_KEY) return 'unavailable';
  const ip = clientIp(await headers());
  if (!(await verifyTurnstile(typeof captchaToken === 'string' ? captchaToken : null, ip, TURNSTILE_ACTION_PHONE))) {
    return 'captcha';
  }
  const ok =
    allow(`sms:n10:${phone}`, 3, 10 * MIN) &&
    allow(`sms:nday:${phone}`, 10, DAY) &&
    allow(`sms:i10:${ip}`, 10, 10 * MIN) &&
    allow(`sms:iday:${ip}`, 30, DAY);
  if (!ok) {
    console.warn('[phone-auth] rate limited', { phone: tail(phone), ip: ipForLog(ip) });
    return 'rate_limited';
  }
  return null;
}

type AccountCheck =
  | { status: 'new' }
  | { status: 'phone_account'; role: string | null }
  | { status: 'email_account'; role: string | null; emailHint: string | null }
  | { status: 'invalid' };

async function checkAccount(phone: string): Promise<AccountCheck | null> {
  const { data, error } = await createAdminClient().rpc('phone_account_check', { p_phone: phone });
  if (error) {
    console.error('[phone-auth] phone_account_check failed', { code: error.code });
    return null;
  }
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  switch (r?.status) {
    case 'new':           return { status: 'new' };
    case 'invalid':       return { status: 'invalid' };
    case 'phone_account': return { status: 'phone_account', role: typeof r.role === 'string' ? r.role : null };
    case 'email_account': return {
      status: 'email_account',
      role: typeof r.role === 'string' ? r.role : null,
      emailHint: typeof r.email_hint === 'string' ? r.email_hint : null,
    };
    default: return null;
  }
}

/** A Supabase client that persists nothing: it only asks GoTrue to send. */
function senderClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function smsError(code: string | undefined, status: number | undefined): 'sms_rate_limited' | 'send_failed' | 'error' {
  if (code === 'over_sms_send_rate_limit' || code === 'over_request_rate_limit' || status === 429) return 'sms_rate_limited';
  if (code === 'sms_send_failed') return 'send_failed';
  return 'error';
}

/**
 * Sign-in or sign-up by phone: send the 6-digit SMS (Twilio Verify via
 * Supabase) after every gate above. The code itself is verified in the
 * browser (verifyOtp type 'sms'), which is what creates the session.
 */
export async function requestPhoneCode(input: {
  phone: string;
  intent: 'sign-in' | 'sign-up';
  /** The guest confirmed "create an account with this number". */
  createAccount?: boolean;
  captchaToken: string | null;
}): Promise<PhoneCodeResult> {
  const phone = validPhone(input.phone);
  if (!phone) return { ok: false, error: 'invalid' };

  const blocked = await gate(phone, input.captchaToken);
  if (blocked) return { ok: false, error: blocked };

  const account = await checkAccount(phone);
  if (!account) return { ok: false, error: 'error' };
  if (account.status === 'invalid') return { ok: false, error: 'invalid' };

  // The number is on an account that signs in with EMAIL. No SMS: sending one
  // would either fail or start a second, parallel account for the same person.
  if (account.status === 'email_account') {
    console.info('[phone-auth] email account — no SMS sent', { phone: tail(phone) });
    return { ok: false, error: 'email_account', emailHint: account.emailHint };
  }

  const create = account.status === 'new';
  if (create && input.intent !== 'sign-up' && !input.createAccount) {
    return { ok: false, error: 'new_account' };
  }

  const { error } = await senderClient().auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: create, channel: 'sms' },
  });
  if (error) {
    // shouldCreateUser:false on a number GoTrue does not know: treat as new.
    if (!create && (error.code === 'otp_disabled' || /signups? not allowed|user not found/i.test(error.message))) {
      return { ok: false, error: 'new_account' };
    }
    console.warn('[phone-auth] SMS not sent', { phone: tail(phone), code: error.code, status: error.status });
    return { ok: false, error: smsError(error.code, error.status) };
  }

  console.info('[phone-auth] SMS sent', { phone: tail(phone), create, intent: input.intent });
  return { ok: true };
}

/**
 * "Add & verify phone" for a signed-in guest: updateUser({ phone }) on the
 * guest's OWN session, which makes GoTrue text a phone_change code. Same
 * gates as above; a number already on another account is refused up front.
 */
export async function requestPhoneChange(input: { phone: string; captchaToken: string | null }): Promise<PhoneChangeResult> {
  const phone = validPhone(input.phone);
  if (!phone) return { ok: false, error: 'invalid' };

  const supabase = await createSessionClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'signed_out' };

  const blocked = await gate(phone, input.captchaToken);
  if (blocked) return { ok: false, error: blocked };

  const own = user.phone ? `+${user.phone.replace(/\D/g, '')}` : null;
  if (own !== phone) {
    const account = await checkAccount(phone);
    if (!account) return { ok: false, error: 'error' };
    if (account.status === 'invalid') return { ok: false, error: 'invalid' };
    if (account.status !== 'new') return { ok: false, error: 'phone_exists' };
  }

  const { error } = await supabase.auth.updateUser({ phone });
  if (error) {
    if (error.code === 'phone_exists') return { ok: false, error: 'phone_exists' };
    console.warn('[phone-auth] phone_change SMS not sent', { userId: user.id, phone: tail(phone), code: error.code, status: error.status });
    return { ok: false, error: smsError(error.code, error.status) };
  }
  console.info('[phone-auth] phone_change SMS sent', { userId: user.id, phone: tail(phone) });
  return { ok: true };
}
