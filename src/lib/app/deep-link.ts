import 'server-only';

/**
 * Where the mobile app is woken up after a payment settles. SERVER ONLY.
 *
 * ⚠️ THE DEEP LINK IS A DOORBELL, NOT A VERDICT — the same rule TLYNC's return
 * URL already lives under. It closes the system browser and brings the app
 * forward; it proves nothing. The app must call /api/app/wallet/topup/status
 * afterwards, because anyone can type a custom-scheme URL by hand.
 *
 * ⚠️ SO NOTHING SECRET OR AUTHORITATIVE GOES IN IT. Only the order id, which
 * the app already knows from /start, and a coarse hint the app is free to
 * ignore. No token, no balance, no "paid=true".
 *
 * Unset APP_RETURN_URL_BASE means no app deep link exists, and the callback
 * falls back to the web redirect. That is a safe degradation, not an outage:
 * the app still learns the outcome by polling.
 */
export function appReturnUrl(merchantOrderId: string, hint: string): string | null {
  const base = process.env.APP_RETURN_URL_BASE?.trim();
  if (!base) return null;

  try {
    const url = new URL(base);
    url.searchParams.set('order', merchantOrderId);
    url.searchParams.set('r', hint);
    return url.toString();
  } catch {
    console.error('[app/deep-link] APP_RETURN_URL_BASE is not a valid URL', { base });
    return null;
  }
}
