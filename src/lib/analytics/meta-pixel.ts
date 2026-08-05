/**
 * Meta Pixel — the ONE place `fbq` is ever called from.
 *
 * Nothing outside this module should touch window.fbq. Scattering raw fbq
 * calls through components is how a tracking setup becomes impossible to audit:
 * you can no longer answer "what do we send Meta, and does any of it identify a
 * guest?" without reading every file.
 *
 * SAFE BY DEFAULT
 *   Every helper takes a typed, closed set of parameters. There is no
 *   pass-through for arbitrary objects, so a caller cannot casually hand Meta an
 *   email, a phone number, a card field or a password — the shape simply does
 *   not allow it. Free-text search terms are scrubbed before they leave (see
 *   sanitiseSearchTerm), because a guest typing "villa for ahmed@gmail.com" must
 *   not turn into a PII leak.
 *
 * NEVER SEND: names, emails, phones, addresses, card data, passwords, booking
 * references tied to a person, or raw text a guest typed that was not scrubbed.
 * Meta's own terms prohibit it and KVKK/GDPR make it our problem, not theirs.
 */

/**
 * The Pixel ID from Meta Events Manager.
 *
 * Overridable by env so a staging property can point elsewhere, but it defaults
 * to the real ID — a public identifier, not a secret; it ships in the page
 * source by definition.
 */
export const META_PIXEL_ID =
  process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || '1372467604832106';

/** Standard Meta events we actually use. Deliberately not `string`. */
export type MetaStandardEvent =
  | 'PageView'
  | 'ViewContent'
  | 'Search'
  | 'Lead'
  | 'InitiateCheckout'
  | 'Purchase';

type FbqParams = Record<string, string | number | string[] | undefined>;

type Fbq = {
  (method: 'init', pixelId: string): void;
  (method: 'track', event: MetaStandardEvent, params?: FbqParams, options?: { eventID?: string }): void;
  (method: 'trackCustom', event: string, params?: FbqParams, options?: { eventID?: string }): void;
  (method: 'consent', action: 'grant' | 'revoke'): void;
  queue?: unknown[];
  loaded?: boolean;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

/**
 * True when the pixel can actually fire.
 *
 * ⚠️ THIS IS THE CONSENT GATE. The project has no cookie-consent system today,
 * so it returns true once the script has loaded. When a banner is added, gate
 * it here — one function, one edit, and every event in the app respects it,
 * because nothing else calls fbq. The Meta-native alternative is
 * `fbq('consent', 'revoke')` before init and `'grant'` on acceptance; both hang
 * off this same point.
 */
export function isPixelReady(): boolean {
  return typeof window !== 'undefined' && typeof window.fbq === 'function';
}

/**
 * The single low-level send. Silent no-op on the server, before the script
 * loads, or if Meta is blocked by an ad blocker — analytics must never throw
 * into a booking flow.
 */
function send(
  event: MetaStandardEvent,
  params?: FbqParams,
  eventId?: string,
): void {
  if (!isPixelReady()) return;

  try {
    // Undefined keys are dropped so we never send `"value": undefined`.
    const clean = params
      ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined))
      : undefined;

    window.fbq?.('track', event, clean, eventId ? { eventID: eventId } : undefined);
  } catch (err) {
    // Deliberately swallowed and quiet: a tracking failure is not a user-facing
    // failure, and a noisy console on every blocked pixel helps nobody.
    if (process.env.NODE_ENV === 'development') {
      console.warn('[meta-pixel] track failed', { event, err });
    }
  }
}

/**
 * PageView.
 *
 * The base snippet fires the FIRST one itself. This exists for client-side
 * route changes only — see components/analytics/MetaPixel, which is careful not
 * to double-count the initial load.
 */
export function trackPageView(): void {
  send('PageView');
}

// ── Content ───────────────────────────────────────────────────────────────────

export interface ViewContentInput {
  /** Unit slug or id — an inventory identifier, never a guest identifier. */
  contentId: string;
  /** The listing's public title. Safe: it is already public marketing copy. */
  contentName?: string;
  /** Nightly or total price, in the currency below. */
  value?: number;
  currency?: string;
  city?: string;
}

/** A guest opened a unit detail page. */
export function trackViewContent(input: ViewContentInput): void {
  send('ViewContent', {
    content_type: 'product',
    content_ids: [input.contentId],
    content_name: input.contentName,
    content_category: input.city,
    value: input.value,
    currency: input.value !== undefined ? input.currency ?? 'USD' : undefined,
  });
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Strip anything that could identify a person out of a free-text search term.
 *
 * Guests type all sorts into a search box. An email, a phone number, or a long
 * digit run (which could be an ID or a card) must never reach Meta, so this
 * removes them rather than trying to detect "is this PII?" — and if what
 * remains is too short to be a real query, nothing is sent at all.
 */
export function sanitiseSearchTerm(raw: string): string | undefined {
  const cleaned = raw
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, ' ')       // emails
    .replace(/\+?\d[\d\s()-]{5,}\d/g, ' ')            // phone-ish runs
    .replace(/\d{5,}/g, ' ')                          // long digit runs (ids, cards)
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length < 2 || cleaned.length > 80) return undefined;
  return cleaned;
}

export interface SearchInput {
  /** City name from the search bar — a place, not a person. */
  city?: string;
  /** YYYY-MM-DD. Dates are not personal data on their own. */
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  /** Any free-text term. Scrubbed by sanitiseSearchTerm before sending. */
  term?: string;
}

/** A guest ran a search. Structured fields preferred; free text is scrubbed. */
export function trackSearch(input: SearchInput): void {
  const term = input.term ? sanitiseSearchTerm(input.term) : undefined;

  send('Search', {
    search_string: term ?? input.city,
    content_category: input.city,
    checkin_date: input.checkIn,
    checkout_date: input.checkOut,
    num_guests: input.guests,
  });
}

// ── Funnel ────────────────────────────────────────────────────────────────────

export interface CheckoutInput {
  /** Unit slug or id. */
  contentId: string;
  value: number;
  currency?: string;
  numItems?: number;
}

/** A guest started the booking flow. NOT wired up yet — see the report. */
export function trackInitiateCheckout(input: CheckoutInput): void {
  send('InitiateCheckout', {
    content_type: 'product',
    content_ids: [input.contentId],
    value: input.value,
    currency: input.currency ?? 'USD',
    num_items: input.numItems ?? 1,
  });
}

export interface LeadInput {
  /** Which form produced the lead: 'contact' | 'host' | … Not who filled it. */
  source: string;
  value?: number;
  currency?: string;
}

/**
 * A guest or prospective host gave us their details.
 *
 * ⚠️ NOT CALLED ANYWHERE YET, by instruction. Wire it only once the firing
 * point is agreed — a Lead fired on form *render* instead of successful submit
 * quietly ruins the campaign data it exists to produce.
 */
export function trackLead(input: LeadInput): void {
  send('Lead', {
    content_category: input.source,
    value: input.value,
    currency: input.value !== undefined ? input.currency ?? 'USD' : undefined,
  });
}

export interface PurchaseInput {
  /** Unit slug or id. */
  contentId: string;
  value: number;
  currency?: string;
  /**
   * Booking reference, for deduplication against a future Conversions API
   * send. It identifies an ORDER, not a person, and carries no contact detail.
   */
  eventId?: string;
}

/**
 * A booking was paid for.
 *
 * ⚠️ NOT CALLED ANYWHERE YET, by instruction. The correct firing point is the
 * confirmed-paid surface the guest lands on — never the payment start, and
 * never a page a guest can refresh into a second Purchase. Pass eventId
 * (the booking reference) so a refresh and any future server-side send collapse
 * into one event instead of inflating revenue.
 */
export function trackPurchase(input: PurchaseInput): void {
  send(
    'Purchase',
    {
      content_type: 'product',
      content_ids: [input.contentId],
      value: input.value,
      currency: input.currency ?? 'USD',
    },
    input.eventId,
  );
}
