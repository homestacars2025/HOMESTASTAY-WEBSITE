/**
 * Ad attribution that survives sign-up: a first-party cookie, 30 days.
 * Client-safe (no secrets) — written in the browser on landing
 * (lib/analytics/events captureLanding), read on the server when an account
 * becomes a host (become_host p_meta).
 *
 * Last click wins, but only a click: a visit WITH tags overwrites the cookie,
 * a direct visit (no tags) never erases it.
 */

export const ATTRIBUTION_COOKIE = 'hs_attr';
export const ATTRIBUTION_MAX_AGE_S = 30 * 24 * 3600;

/** What become_host stores — exactly these keys, nothing else. */
export const ATTRIBUTION_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid'] as const;
export type Attribution = Partial<Record<(typeof ATTRIBUTION_KEYS)[number], string>>;

const MAX_LEN = 200;

/** The tags in a landing URL's query, or null when it carries none. */
export function attributionFromSearch(search: string): Attribution | null {
  const params = new URLSearchParams(search);
  const out: Attribution = {};
  for (const k of ATTRIBUTION_KEYS) {
    const v = params.get(k)?.trim();
    if (v) out[k] = v.slice(0, MAX_LEN);
  }
  return Object.keys(out).length ? out : null;
}

/** Cookie value → a clean Attribution (only known keys, short strings), or null. */
export function parseAttribution(raw: string | undefined | null): Attribution | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(decodeURIComponent(raw));
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const out: Attribution = {};
    for (const k of ATTRIBUTION_KEYS) {
      const x = (v as Record<string, unknown>)[k];
      if (typeof x === 'string' && x.trim()) out[k] = x.trim().slice(0, MAX_LEN);
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** Browser only: remember this landing's tags for 30 days (if it has any). */
export function saveAttributionCookie(): void {
  try {
    const found = attributionFromSearch(window.location.search);
    if (!found) return;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(found))}; Max-Age=${ATTRIBUTION_MAX_AGE_S}; Path=/; SameSite=Lax${secure}`;
  } catch { /* cookies blocked — attribution is best effort */ }
}
