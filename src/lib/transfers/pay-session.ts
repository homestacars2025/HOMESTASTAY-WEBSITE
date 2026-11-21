import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { UUID_RE, isTransferOrder } from '@/lib/transfers/model';

/**
 * The three short-lived capabilities of a transfer payment. SERVER ONLY.
 *
 *   1. APP PAY TOKEN (?t= on /transfers/pay/[id], 15 min). The app opens the
 *      page in the phone's browser, which holds no website session — the same
 *      problem, and the same answer, as wallet top-ups (lib/app/pay-token):
 *      /api/app/transfers/pay-link checks the app's bearer token AS THE USER
 *      (transfer_get), then mints this. Bound to one transfer + one account.
 *
 *   2. ATTEMPT TOKEN (hidden field of the card form, 30 min). The page created
 *      the attempt (transfer_payment_init); the card POST must pay exactly that
 *      attempt, for exactly that account. The AMOUNT is never in it — the
 *      start route reads it from transfer_payments.
 *
 *   3. RETURN COOKIE (hs_trf_pay, same value as 2). Set when the card goes to
 *      the bank; read on the result page after the callback's redirect (a
 *      top-level GET, so a Lax cookie arrives). It says which transfer came
 *      back and whether to wake the app — the callback itself knows neither.
 *
 * All three are HMAC-SHA256 with APP_PAY_TOKEN_SECRET and a PURPOSE bound
 * into the signature, so none can be replayed as another (or as a top-up
 * token, which uses the same key with its own purpose).
 */

const APP_TOKEN_PURPOSE = 'app-transfer-pay:v1';
const ATTEMPT_PURPOSE = 'transfer-attempt:v1';
const APP_TOKEN_TTL_MS = 15 * 60 * 1000;
const ATTEMPT_TTL_MS = 30 * 60 * 1000;

export const TRANSFER_RETURN_COOKIE = 'hs_trf_pay';
export const TRANSFER_RETURN_COOKIE_MAX_AGE_S = 30 * 60;

function secret(): string {
  const value = process.env.APP_PAY_TOKEN_SECRET;
  if (!value || value.length < 16) throw new Error('[transfers/pay-session] APP_PAY_TOKEN_SECRET is missing or too short.');
  return value;
}

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ── 1. App pay token ─────────────────────────────────────────────────────────

export interface AppPayClaims { transferId: string; profileId: string }

export function mintAppTransferToken({ transferId, profileId }: AppPayClaims): string {
  const exp = Date.now() + APP_TOKEN_TTL_MS;
  return `${transferId}.${profileId}.${exp}.${sign(`${APP_TOKEN_PURPOSE}.${transferId}.${profileId}.${exp}`)}`;
}

export function readAppTransferToken(raw: string | null | undefined): AppPayClaims | null {
  try {
    const parts = (raw ?? '').split('.');
    if (parts.length !== 4) return null;
    const [transferId, profileId, exp, sig] = parts;
    if (!same(sign(`${APP_TOKEN_PURPOSE}.${transferId}.${profileId}.${exp}`), sig)) return null;
    if (!(Number(exp) > Date.now())) return null;
    if (!UUID_RE.test(transferId) || !UUID_RE.test(profileId)) return null;
    return { transferId, profileId };
  } catch {
    return null;
  }
}

// ── 2/3. Attempt token / return cookie ───────────────────────────────────────

export interface AttemptClaims {
  transferId: string;
  merchantOrderId: string;
  profileId: string;
  /** Opened from the app: the result goes back to it by deep link. */
  app: boolean;
}

export function mintAttemptToken(c: AttemptClaims): string {
  const exp = Date.now() + ATTEMPT_TTL_MS;
  const body = `${c.transferId}.${c.merchantOrderId}.${c.profileId}.${c.app ? 1 : 0}.${exp}`;
  return `${body}.${sign(`${ATTEMPT_PURPOSE}.${body}`)}`;
}

export function readAttemptToken(raw: string | null | undefined): AttemptClaims | null {
  try {
    const parts = (raw ?? '').split('.');
    if (parts.length !== 6) return null;
    const [transferId, merchantOrderId, profileId, app, exp, sig] = parts;
    const body = `${transferId}.${merchantOrderId}.${profileId}.${app}.${exp}`;
    if (!same(sign(`${ATTEMPT_PURPOSE}.${body}`), sig)) return null;
    if (!(Number(exp) > Date.now())) return null;
    if (!UUID_RE.test(transferId) || !UUID_RE.test(profileId) || !isTransferOrder(merchantOrderId)) return null;
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(merchantOrderId)) return null;
    return { transferId, merchantOrderId, profileId, app: app === '1' };
  } catch {
    return null;
  }
}

// ── Ownership with the service role ──────────────────────────────────────────

/**
 * Does this account own this transfer? For the app-token path only, where no
 * user session exists to ask transfer_get as the user. The website path asks
 * transfer_get with the cookie client instead (the database's own check).
 */
export async function ownsTransfer(admin: SupabaseClient, transferId: string, profileId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('transfer_bookings')
    .select('id')
    .eq('id', transferId)
    .eq('customer_profile_id', profileId)
    .maybeSingle();
  if (error) {
    console.error('[transfers/pay-session] ownership read failed', { code: error.code, message: error.message });
    return false;
  }
  return Boolean(data);
}

// ── The app's return deep link ───────────────────────────────────────────────

const ALLOWED_SCHEMES = new Set(['homesta:', 'exp:']);

/**
 * homesta://transfers/pay/return?transfer=<id>&r=<hint> — APP_TRANSFER_RETURN_URL
 * when set, else the scheme of APP_RETURN_URL_BASE (the wallet's) with this
 * path. Carries no secret and no verdict: the app re-reads transfer_get.
 * Null when neither is configured → the web result page instead.
 */
export function appTransferReturnUrl(transferId: string, hint: string): string | null {
  const explicit = process.env.APP_TRANSFER_RETURN_URL?.trim();
  let base = explicit;
  if (!base) {
    const wallet = process.env.APP_RETURN_URL_BASE?.trim();
    if (!wallet) return null;
    try {
      base = `${new URL(wallet).protocol}//transfers/pay/return`;
    } catch {
      return null;
    }
  }
  try {
    const url = new URL(base);
    if (!ALLOWED_SCHEMES.has(url.protocol)) return null;
    url.searchParams.set('transfer', transferId);
    url.searchParams.set('r', hint);
    return url.toString();
  } catch {
    return null;
  }
}
