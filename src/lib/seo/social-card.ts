import { CANONICAL_URL } from '@/lib/config/urls';
import type { UnitTypeEnum } from '@/lib/types/unit';

/**
 * The share card for a unit — the line of copy and the image URL.
 *
 * Both halves live here rather than in the page because the OG image route
 * renders the SAME facts onto the photograph that generateMetadata writes into
 * og:description. Two copies of "city · price · type" that drift apart would
 * show a guest one price in the WhatsApp preview text and another burnt into
 * the picture next to it.
 */

/**
 * "Beşiktaş, Istanbul · from $85/night · Apartment"
 *
 * WHY THIS AND NOT THE LISTING DESCRIPTION
 *   A social card is read in half a second in a chat thread. The three facts
 *   that decide whether someone taps are where it is, what it costs and what
 *   kind of place it is — not the first 160 characters of the owner's prose,
 *   which routinely open with a greeting. The prose stays in <meta
 *   description>, where search engines want it.
 *
 * Any part can be missing (a unit with no city, or no resolvable rate) and the
 * separator collapses with it rather than leaving a dangling "·".
 */
export function socialCardDescription(parts: {
  place: string | null;
  /** Already localised, e.g. "from $85/night" — see unit.social.fromPerNight. */
  price: string | null;
  unitTypeLabel: string | null;
}): string {
  return [parts.place, parts.price, parts.unitTypeLabel].filter(Boolean).join(' · ');
}

/**
 * The nightly rate exactly as the booking card prints it.
 *
 * §9 forbids a second price path: this takes the number the page already
 * resolved through quote_units() and formats it the one way BookingCard does
 * (`$` + the raw USD figure). No Intl currency formatting here on purpose —
 * that would render "US$85" or "٨٥ US$" in some locales and no longer match
 * the figure printed on the page, which the card must agree with.
 */
export function formatCardPrice(nightlyUsd: number | null): string | null {
  return nightlyUsd === null ? null : `$${nightlyUsd}`;
}

/** Region and city, in the order the page header shows them. */
export function cardPlace(region: string | null, city: string | null): string | null {
  const parts = [region, city].filter(Boolean) as string[];
  // A unit whose district is recorded as its city ("Istanbul, Istanbul").
  const unique = parts.filter((p, i) => parts.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i);
  return unique.length ? unique.join(', ') : null;
}

/**
 * The unit-type label, for the two surfaces that need it outside the page
 * itself (og:description and the composited card).
 *
 * Typed against the `unit` namespace's own keys so a renamed message breaks the
 * build rather than printing "unitTypes.villa" into a WhatsApp preview.
 */
export function unitTypeLabelFor(
  t: (key: `unitTypes.${UnitTypeEnum}`) => string,
  type: UnitTypeEnum,
): string {
  return t(`unitTypes.${type}`);
}

/**
 * The generated share card for a unit — the cover photograph with the title,
 * place and price composited onto it.
 *
 * Absolute, on the production origin, and public: WhatsApp, Facebook and
 * Telegram fetch og:image from their own servers with no cookies, so a relative
 * URL or a preview-deployment host yields a card with no picture.
 *
 * The locale rides in the query string because the composited text is
 * translated; one card per language, cached separately by each platform.
 */
export function unitOgImageUrl(slug: string, locale: string): string {
  return `${CANONICAL_URL}/opengraph-image/stays/${encodeURIComponent(slug)}?locale=${locale}`;
}
