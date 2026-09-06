import 'server-only';

/**
 * Where the mobile app is woken up after a payment settles. SERVER ONLY.
 *
 * ⚠️ THE DEEP LINK IS A DOORBELL, NOT A VERDICT — the same rule TLYNC's return
 * URL already lives under. It closes the system browser and brings the app
 * forward; it proves nothing. The app must call
 * /api/app/wallet/topup/status afterwards, because anyone can type a
 * custom-scheme URL by hand.
 *
 * ⚠️ SO NOTHING SECRET OR AUTHORITATIVE GOES IN IT. Only the order id, which
 * the app already knows, and a coarse hint the app is free to ignore. No
 * token, no balance, no "paid=true".
 *
 * TWO SOURCES, IN THIS ORDER
 *   1. A returnUrl the app supplied at /start. Needed because Expo's dev
 *      scheme (exp://192.168.x.x:8081/--/…) changes with the machine and the
 *      session — no environment variable can track that.
 *   2. APP_RETURN_URL_BASE, the fixed production scheme.
 * Neither present means no app deep link exists, and the caller falls back to
 * the web redirect. Safe degradation, not an outage: the app still learns the
 * outcome by polling.
 */

/**
 * ⚠️ http AND https ARE REFUSED EXPLICITLY, and that refusal is the security
 * boundary — not the allow-list beside it.
 *
 * On the TLYNC path this value travels out to a third party and comes back as
 * a query parameter, so anyone can craft
 *   /api/payment/tlync/return?ref=…&app=https://evil.example
 * and hand it to a guest. Redirecting to an arbitrary https origin from our
 * own domain is a textbook open redirect — it borrows our name to launch a
 * phishing page, on the screen where a guest has just paid.
 *
 * A custom scheme cannot do that: the OS either has an app registered for it
 * or nothing happens. That is why the list is schemes an app owns, and why
 * anything web-shaped is rejected rather than merely absent from the list.
 */
const ALLOWED_SCHEMES = new Set(['homesta:', 'exp:']);

/**
 * Validate an app-supplied return URL.
 *
 * Returns the normalised URL, or null for absent, unparseable, or any scheme
 * that is not an app's own. Called TWICE on the TLYNC path — once at /start
 * where a bad value can still be answered with a field error, and again at the
 * return route before the redirect, because between those two points the
 * string has been out of our hands.
 */
export function parseAppReturnUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    // Logged, because a rejected returnUrl is either a misconfigured app build
    // or somebody probing for an open redirect, and the two look identical
    // from here. The value is included: it is not a secret, and it is the only
    // thing that tells them apart.
    console.warn('[app/deep-link] returnUrl rejected — scheme not allowed', {
      scheme: url.protocol,
    });
    return null;
  }

  return url.toString();
}

/**
 * Build the wake-up URL for one order.
 *
 * @param overrideBase a returnUrl the app supplied, ALREADY validated by
 *   parseAppReturnUrl. Passing an unvalidated string here is the one way to
 *   reintroduce the open redirect, so callers validate first and pass the
 *   result — never the raw input.
 */
export function appReturnUrl(
  merchantOrderId: string,
  hint: string,
  overrideBase?: string | null,
): string | null {
  const base = overrideBase?.trim() || process.env.APP_RETURN_URL_BASE?.trim();
  if (!base) return null;

  try {
    const url = new URL(base);
    // Re-checked even for the env value: a typo there would otherwise make
    // every deployment redirect somewhere unintended, and this costs nothing.
    if (!ALLOWED_SCHEMES.has(url.protocol)) {
      console.error('[app/deep-link] base URL has a disallowed scheme', {
        scheme: url.protocol,
      });
      return null;
    }
    url.searchParams.set('order', merchantOrderId);
    url.searchParams.set('r', hint);
    return url.toString();
  } catch {
    console.error('[app/deep-link] base URL is not a valid URL', { base });
    return null;
  }
}
