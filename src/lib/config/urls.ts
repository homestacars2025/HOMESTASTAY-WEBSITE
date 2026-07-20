/**
 * The canonical site origin — ONE definition, used everywhere.
 *
 * This is ALWAYS the production host, on every deployment including previews.
 * Canonical URLs, hreflang alternates and OG URLs must point at production
 * even when served from a preview: if they tracked the deployment URL, every
 * preview would advertise itself as canonical and invite Google to index it.
 * That is a Law 3 failure, not a cosmetic one.
 *
 * ⚠️ DO NOT USE THIS FOR THE PAYMENT CALLBACK.
 * The 3D Secure callback must be the origin the bank can actually reach for
 * THIS deployment, and it is hashed into HashData. It lives in
 * PAYMENT_CALLBACK_ORIGIN (server-only) — see src/lib/payment/urls.ts. The two
 * values are identical in production and must differ on preview, so one
 * variable cannot serve both.
 *
 * ⚠️ THE www HOST IS LOAD-BEARING.
 * homestastay.com 307-redirects to www.homestastay.com. Anywhere a redirect
 * sits between a URL we generate and the URL actually served, we get a
 * mismatch — harmless for a canonical, fatal for a hashed callback. Both
 * variables pin the www host so the two can never drift apart on that point.
 */

const FALLBACK = 'https://www.homestastay.com';

/** No trailing slash, ever — '/x' and '/x/' are different URLs to a crawler. */
export const CANONICAL_URL: string = (
  process.env.NEXT_PUBLIC_CANONICAL_URL || FALLBACK
).replace(/\/+$/, '');

/** Absolute canonical URL for a locale-prefixed path. `path` starts with '/'. */
export function canonical(locale: string, path: string): string {
  return `${CANONICAL_URL}/${locale}${path}`;
}

/**
 * The four hreflang alternates plus x-default, for a locale-prefixed path.
 * Centralised because getting one locale wrong in one file is invisible in
 * review and silently wrong in Search Console.
 */
export function hreflangAlternates(
  path: string,
  xDefaultLocale: 'en' | 'tr' = 'en',
): Record<string, string> {
  return {
    en: `${CANONICAL_URL}/en${path}`,
    ar: `${CANONICAL_URL}/ar${path}`,
    tr: `${CANONICAL_URL}/tr${path}`,
    ru: `${CANONICAL_URL}/ru${path}`,
    'x-default': `${CANONICAL_URL}/${xDefaultLocale}${path}`,
  };
}
