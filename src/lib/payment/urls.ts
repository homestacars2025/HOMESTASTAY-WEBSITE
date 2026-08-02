/**
 * The 3D Secure callback URL — SERVER ONLY.
 *
 * Lives alone in its own module because it is used in two places that MUST
 * agree byte for byte: the string hashed into HashData, and the <OkUrl> /
 * <FailUrl> XML tags. One function, one value, no second derivation.
 *
 * WHY PAYMENT_CALLBACK_ORIGIN AND NOT THE CANONICAL URL
 *   The canonical origin is always production, even on a preview deployment —
 *   that is what makes canonicals correct. This one must be the origin the
 *   BANK can actually reach for this specific deployment. On production they
 *   are the same string; on preview they must differ.
 *
 *   Deliberately NOT prefixed NEXT_PUBLIC_: it is server-only, has no business
 *   in a browser bundle, and the missing prefix makes it structurally
 *   impossible to reach for by accident when writing a canonical tag.
 *
 * CONSTRAINTS, EACH OF WHICH HAS COST DEBUGGING TIME
 *   - Pin the www host. homestastay.com 307-redirects to www.homestastay.com,
 *     and a redirect between the URL we hash and the URL the bank lands on is
 *     a byte mismatch. It surfaces as HashDataError, which is indistinguishable
 *     from a bad password — hours to diagnose, on Cars, for exactly this.
 *   - On preview use the STABLE BRANCH ALIAS, never the per-deployment URL,
 *     or the hash breaks on the next push.
 *   - NO query string and NO raw '&'. Either changes the bytes.
 *   - No trailing slash.
 *   - OkUrl and FailUrl are the SAME URL. The callback tells success from
 *     failure by ResponseCode, which is the only way to keep both strings
 *     identical without a query parameter.
 */
export function callbackUrl(): string {
  return `${paymentOrigin()}/api/payment/callback`;
}

/**
 * TLYNC's server-to-server callback (backend_url).
 *
 * Shares PAYMENT_CALLBACK_ORIGIN with the bank for one reason: it is defined
 * as "the origin an external payment system can actually reach for THIS
 * deployment", which is exactly what TLYNC needs too.
 *
 * None of the byte-exactness rules above apply here — TLYNC hashes nothing —
 * but the www pin and the stable-preview-alias rule still do, because a 307 in
 * front of a server-to-server POST loses the body.
 */
export function tlyncBackendUrl(): string {
  return `${paymentOrigin()}/api/payment/tlync/callback`;
}

/**
 * Where TLYNC sends the guest's browser afterwards (frontend_url).
 *
 * Carries the locale because a redirect back from an external site has no
 * Accept-Language negotiation left to do, and the ref so the return page can
 * name the booking without depending on a cookie surviving the round trip.
 *
 * This URL can never mark anything paid — see the route.
 */
export function tlyncFrontendUrl(locale: string, customRef: string): string {
  const url = new URL(`${paymentOrigin()}/api/payment/tlync/return`);
  url.searchParams.set('locale', locale);
  url.searchParams.set('ref', customRef);
  return url.toString();
}

function paymentOrigin(): string {
  const origin = process.env.PAYMENT_CALLBACK_ORIGIN;

  if (!origin) {
    throw new Error(
      '[payment/urls] PAYMENT_CALLBACK_ORIGIN is not set. The 3DS callback ' +
        'URL is hashed into HashData and cannot be inferred from the request ' +
        '— a wrong value fails at the bank as HashDataError. Set it to the ' +
        'stable origin for this deployment, with the www host and no ' +
        'trailing slash.'
    );
  }

  if (!/^https?:\/\//.test(origin)) {
    throw new Error(
      `[payment/urls] PAYMENT_CALLBACK_ORIGIN must include the scheme; got "${origin}".`
    );
  }

  // Guard the exact mistake that produces HashDataError: the apex host
  // redirects to www, so hashing the apex can never match where the bank lands.
  if (/^https?:\/\/homestastay\.com/.test(origin)) {
    throw new Error(
      '[payment/urls] PAYMENT_CALLBACK_ORIGIN is the apex host. ' +
        'homestastay.com 307-redirects to www.homestastay.com, so the hashed ' +
        'URL would not match the URL the bank reaches. Use ' +
        'https://www.homestastay.com.'
    );
  }

  return origin.replace(/\/+$/, '');
}
