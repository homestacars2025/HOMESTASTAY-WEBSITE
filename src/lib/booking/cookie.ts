/**
 * The signed booking cookie — SERVER ONLY.
 *
 * WHY A COOKIE AND NOT A REQUEST BODY
 *   start_payment_attempt takes a booking_id and returns the amount, the FX
 *   rate and the booking reference. If that id arrived in a request body, any
 *   caller could enumerate ids, start a payment against someone else's hold
 *   and read back what that guest is being charged. The id therefore only ever
 *   travels in a cookie this server set itself.
 *
 * WHY SIGNED
 *   httpOnly stops a page script reading it. It does not stop the owner of the
 *   browser editing it by hand. The HMAC is what makes the value unforgeable,
 *   so a tampered id fails to verify instead of reaching the RPC.
 *
 * WHY SameSite=Lax AND NOT Strict
 *   The 3D Secure callback is a top-level cross-site POST from the bank.
 *   Strict withholds cookies on exactly that navigation — the flow would lose
 *   the booking at the one moment it matters. Lax sends them on a top-level
 *   navigation, which is what the bank performs. This is deliberate: the
 *   cookie is a capability scoped to one in-flight booking, not a session.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'hs_booking';

/**
 * Comfortably longer than the 30-minute hold and the 20-minute extension
 * start_payment_attempt applies, so the cookie never expires before the hold
 * it points at. The hold, not the cookie, is the real clock.
 */
const MAX_AGE_SECONDS = 90 * 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret(): string {
  const value = process.env.BOOKING_COOKIE_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      '[booking/cookie] BOOKING_COOKIE_SECRET is missing or too short. ' +
        'Generate one with `openssl rand -base64 32`.'
    );
  }
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/**
 * Constant-time compare. A length mismatch is rejected before timingSafeEqual,
 * which throws on unequal buffer lengths rather than returning false.
 */
function signatureMatches(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Set after a hold is created. The expiry is inside the signed payload as well
 * as on the cookie: a browser can keep sending an expired cookie, but it
 * cannot move the timestamp the signature covers.
 */
export async function setBookingCookie(bookingId: string): Promise<void> {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${bookingId}.${expiresAt}`;
  const store = await cookies();

  store.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

/**
 * The ONLY accepted source of a booking id on the payment path.
 * Returns null on anything unexpected — absent, malformed, expired, or
 * tampered. Callers treat null as "no booking in flight", never as an error
 * worth explaining to the guest in detail.
 */
export async function readBookingCookie(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const parts = raw.split('.');
  if (parts.length !== 3) return null;

  const [bookingId, expiresAtRaw, signature] = parts;
  if (!signatureMatches(sign(`${bookingId}.${expiresAtRaw}`), signature)) {
    return null;
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  if (!UUID_RE.test(bookingId)) return null;

  return bookingId;
}

/** Called once the booking reaches a terminal state, so a stale id cannot be replayed. */
export async function clearBookingCookie(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}
