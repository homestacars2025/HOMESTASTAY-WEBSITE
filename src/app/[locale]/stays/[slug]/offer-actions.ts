'use server';

import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { routing } from '@/i18n/routing';
import { createPublicClient } from '@/lib/supabase/public';
import { TURNSTILE_ACTION_OFFER, isTurnstileConfigured, verifyTurnstile } from '@/lib/security/turnstile';
import { clientIp, ipForLog } from '@/lib/security/rate-limit';

/**
 * "Request an offer" — price-on-request units.
 *
 * Everything that matters is enforced by public.create_offer_request in the
 * database: the unit really is on request and available, the dates and guests
 * are valid, one open request per phone + unit + dates ('duplicate'), and the
 * daily limit per phone / IP. It notifies the host, the account manager and
 * the guest, opens the CRM lead and the inbox card — none of that lives here.
 *
 * This action only adds what the database cannot: the human check
 * (Turnstile, failing CLOSED), the phone normalised to E.164 the same way
 * phone sign-in does it, and the IP — hashed with a server secret, never sent
 * in the clear — for the per-IP limit.
 */

/** The database's error codes, plus the three only this action can raise. */
export type OfferError =
  | 'unit_not_available'
  | 'unit_not_on_request'
  | 'invalid_dates'
  | 'invalid_guests'
  | 'too_many_guests'
  | 'invalid_phone'
  | 'consent_required'
  | 'rate_limited'
  | 'invalid_email'
  | 'captcha'
  | 'unavailable';

const DB_ERRORS = new Set<OfferError>([
  'unit_not_available',
  'unit_not_on_request',
  'invalid_dates',
  'invalid_guests',
  'too_many_guests',
  'invalid_phone',
  'consent_required',
  'rate_limited',
]);

export type OfferResult =
  | { ok: true; status: 'created' | 'duplicate'; reference: string; whatsappNumber: string }
  | { ok: false; error: OfferError };

export interface OfferInput {
  unitId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  phone: string;
  email: string;
  locale: string;
  captchaToken: string | null;
}

/** Bumped whenever the consent sentence changes, so each request records which one the guest saw. */
const CONSENT_VERSION = 'v1';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Deliberately loose — the address is a second channel, not an identity.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** E.164 or null — the same rules as phone sign-in (trunk 0, 00 prefix, spaces, brackets). */
function e164(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/^00/, '+').replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+')) return null;
  const parsed = parsePhoneNumberFromString(cleaned);
  return parsed && parsed.isValid() ? parsed.number : null;
}

/**
 * The visitor's IP as an opaque hash: sha256(ip + secret). The secret keeps it
 * from being reversed by hashing every IPv4 address. IP_HASH_SECRET when set,
 * else the booking-cookie secret (server-only, always present in production).
 */
function ipHash(ip: string): string {
  const secret = process.env.IP_HASH_SECRET || process.env.BOOKING_COOKIE_SECRET || '';
  return createHash('sha256').update(`${ip}${secret}`).digest('hex');
}

const int = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isInteger(v) ? v : fallback);

export async function requestOffer(input: OfferInput): Promise<OfferResult> {
  const unitId = typeof input?.unitId === 'string' ? input.unitId : '';
  const checkIn = typeof input?.checkIn === 'string' ? input.checkIn : '';
  const checkOut = typeof input?.checkOut === 'string' ? input.checkOut : '';
  if (!UUID_RE.test(unitId)) return { ok: false, error: 'unavailable' };
  if (!DATE_RE.test(checkIn) || !DATE_RE.test(checkOut) || checkIn >= checkOut) {
    return { ok: false, error: 'invalid_dates' };
  }
  const adults = int(input.adults, 0);
  const children = int(input.children, 0);
  if (adults < 1 || children < 0) return { ok: false, error: 'invalid_guests' };

  const phone = e164(input.phone);
  if (!phone) return { ok: false, error: 'invalid_phone' };
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, error: 'invalid_email' };
  const locale = (routing.locales as readonly string[]).includes(input.locale) ? input.locale : routing.defaultLocale;

  // The human check, failing closed: without the keys nothing is sent.
  const ip = clientIp(await headers());
  if (!isTurnstileConfigured() || !(await verifyTurnstile(input.captchaToken, ip, TURNSTILE_ACTION_OFFER))) {
    return { ok: false, error: 'captcha' };
  }

  // Anon is enough: the function is SECURITY DEFINER and validates everything.
  const { data, error } = await createPublicClient().rpc('create_offer_request', {
    p_unit_id: unitId,
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_adults: adults,
    p_children: children,
    p_phone_e164: phone,
    p_email: email,
    p_locale: locale,
    p_source: 'website',
    p_consent_version: CONSENT_VERSION,
    p_ip_hash: ipHash(ip),
  });

  if (error) {
    const code = (error.message ?? '').trim() as OfferError;
    if (DB_ERRORS.has(code)) return { ok: false, error: code };
    console.error('[offer] create_offer_request failed', { code: error.code, message: error.message, ip: ipForLog(ip) });
    return { ok: false, error: 'unavailable' };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { status?: string; reference?: string; whatsapp_number?: string }
    | null;
  const status = row?.status === 'duplicate' ? 'duplicate' : row?.status === 'created' ? 'created' : null;
  const whatsappNumber = (row?.whatsapp_number ?? '').replace(/\D/g, '');
  if (!status || !row?.reference || !whatsappNumber) {
    console.error('[offer] unexpected create_offer_request result', { status: row?.status, hasRef: !!row?.reference });
    return { ok: false, error: 'unavailable' };
  }
  return { ok: true, status, reference: row.reference, whatsappNumber };
}
