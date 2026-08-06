/**
 * Microsoft Clarity — the ONE place `window.clarity` is ever called from.
 *
 * Same rule as the Meta Pixel module next door: nothing outside this file
 * touches the global, so "what do we send Clarity, and can it identify a
 * guest?" stays a question with one place to look.
 *
 * ⚠️ CLARITY IS NOT AN EVENT TRACKER — IT IS A SESSION RECORDER.
 *   It replays what a visitor saw and did, including form interaction. That
 *   makes it far more sensitive than a pixel, and it is why:
 *     - the card form is masked explicitly (see CardPaymentForm), on top of
 *       Clarity's own default input masking. Card data must never be
 *       recoverable from a replay, and "the vendor masks it by default" is a
 *       setting someone can change, not a guarantee we control.
 *     - identify() is deliberately NOT wrapped here. It exists in Clarity's
 *       API and takes a user id / email — exactly the payload that must never
 *       leave this site. Adding it later needs a deliberate decision, not an
 *       autocomplete.
 */

type ClarityFn = {
  (method: 'event', name: string): void;
  (method: 'set', key: string, value: string): void;
  (method: 'consent', granted?: boolean): void;
  (method: 'start' | 'stop' | 'upgrade', reason?: string): void;
  q?: unknown[];
};

declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

/**
 * The Clarity project id. Public by nature — it ships in the page source —
 * but overridable so a staging deployment can record somewhere else instead of
 * polluting the real project's heatmaps with test clicks.
 */
export const CLARITY_PROJECT_ID =
  process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim() || 'xy76vfzufo';

/**
 * ⚠️ THE CONSENT GATE, same as isPixelReady() for Meta.
 *
 * Returns true once the tag has loaded. The project still has no cookie-consent
 * system; when one lands, gate it here and every call in the app follows,
 * because nothing else reaches the global. Clarity also has a native
 * `clarity('consent', false)` for the same purpose.
 */
export function isClarityReady(): boolean {
  return typeof window !== 'undefined' && typeof window.clarity === 'function';
}

/**
 * Never throw into a page over analytics.
 *
 * Loosely typed on purpose: Parameters<ClarityFn> collapses an overloaded type
 * to its LAST signature, so a typed tuple here rejects every call but one. The
 * type safety that matters lives in the exported helpers below — this is the
 * single unchecked seam, and it is three lines long.
 */
function call(...args: unknown[]): void {
  if (!isClarityReady()) return;
  try {
    // reason: window.clarity is an overloaded signature; a variadic call needs
    // the widened form. Guarded by isClarityReady above.
    (window.clarity as unknown as (...a: unknown[]) => void)(...args);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[clarity] call failed', { args, err });
    }
  }
}

/**
 * A named custom event, for filtering replays ("show me sessions that hit
 * payment-failed"). The NAME only — Clarity takes no parameters here, so
 * there is nowhere for personal data to hide.
 */
export function clarityEvent(name: string): void {
  call('event', name);
}

/**
 * A session tag, for segmenting replays (e.g. 'locale' → 'ar').
 *
 * Tag DIMENSIONS, never people: locale, gateway, category. Never an email,
 * phone, name, booking reference or anything that resolves to one guest.
 */
export function claritySetTag(key: string, value: string): void {
  call('set', key, value);
}

/**
 * Stop recording for the rest of this page.
 *
 * The escape hatch for a surface that should never be replayed at all. Masking
 * covers field VALUES; this covers everything, and it is the stronger tool if a
 * payment surface ever needs it.
 */
export function clarityStopRecording(): void {
  call('stop');
}
