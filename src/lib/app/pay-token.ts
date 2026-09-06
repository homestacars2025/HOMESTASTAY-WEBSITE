import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The hosted-payment capability token. SERVER ONLY.
 *
 * WHY IT EXISTS
 *   The app opens the card page in the SYSTEM BROWSER, which is a different
 *   cookie jar from the app and holds no Supabase session. The page therefore
 *   cannot ask "who is signed in?" the way /wallet/top-up/pay does. This token
 *   carries the answer instead: it is minted server-side after the caller has
 *   already been authenticated by their bearer token, and it authorises
 *   exactly one top-up intent for a short window.
 *
 *   Same idea as the booking cookie (lib/booking/cookie.ts) — a capability
 *   scoped to one in-flight transaction, not a session — with the transport
 *   changed from a cookie to a URL parameter, because a redirect into a
 *   foreign browser is the only channel available.
 *
 * ⚠️ IT IS A URL PARAMETER, SO IT IS SHORT-LIVED BY DESIGN. A URL lands in
 * browser history and, on some platforms, in a Referer header. Fifteen minutes
 * is long enough to type a card and short enough that a leaked link is inert
 * by the time anyone reads a log. The intent's own 'pending' status is the
 * second gate: once a payment starts, replaying this token buys nothing.
 *
 * ⚠️ SEPARATE SECRET FROM THE BOOKING COOKIE, on purpose. Two capabilities
 * with different lifetimes and blast radii should not share a key, and
 * rotating one must not invalidate the other.
 */

const MAX_AGE_SECONDS = 15 * 60;

/** Bound into the signature so a token minted here can never be replayed elsewhere. */
const PURPOSE = 'app-topup-pay:v1';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret(): string {
  const value = process.env.APP_PAY_TOKEN_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      '[app/pay-token] APP_PAY_TOKEN_SECRET is missing or too short. ' +
        'Generate one with `openssl rand -base64 32`.',
    );
  }
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** Constant-time compare; a length mismatch is rejected before timingSafeEqual throws. */
function signatureMatches(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface PayTokenClaims {
  intentId: string;
  profileId: string;
}

/**
 * Mint a token for one intent.
 *
 * profileId is bound in as well as intentId: the page re-checks intent
 * ownership against it, so a token cannot be pointed at somebody else's intent
 * even if an id were guessed.
 */
export function mintPayToken({ intentId, profileId }: PayTokenClaims): string {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${PURPOSE}.${intentId}.${profileId}.${expiresAt}`;
  return `${intentId}.${profileId}.${expiresAt}.${sign(payload)}`;
}

/**
 * Verify and unpack. Returns null for absent, malformed, expired or tampered —
 * deliberately indistinguishable, so this cannot be used to probe which ids or
 * profiles are real.
 */
export function readPayToken(raw: string | null | undefined): PayTokenClaims | null {
  if (!raw) return null;

  const parts = raw.split('.');
  if (parts.length !== 4) return null;

  const [intentId, profileId, expiresAtRaw, signature] = parts;

  const payload = `${PURPOSE}.${intentId}.${profileId}.${expiresAtRaw}`;
  if (!signatureMatches(sign(payload), signature)) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  if (!UUID_RE.test(intentId) || !UUID_RE.test(profileId)) return null;

  return { intentId, profileId };
}
