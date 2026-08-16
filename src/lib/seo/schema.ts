import { CANONICAL_URL, canonical } from '@/lib/config/urls';
import { COMPANY } from '@/lib/config/company';
import { SOCIAL_LINKS, CONTACT_EMAIL } from '@/lib/config/social';
import { SITE_NAME } from '@/lib/config/seo';
import type { UnitListing, UnitAmenities } from '@/lib/types/unit';

// ─────────────────────────────────────────────────────────────────────────────
// JSON-LD builders.
//
// TWO RULES GOVERN EVERY FUNCTION HERE.
//
// 1. NO EMPTY VALUES. Google treats a property present-but-null as malformed,
//    not as absent, and one invalid property can invalidate the whole item. So
//    nothing is assigned conditionally-maybe-undefined and left in — `prune()`
//    strips it, and every optional block is spread in only when it has content.
//
// 2. EVERY URL IS ABSOLUTE AND LOCALE-PREFIXED, via lib/config/urls. A relative
//    @id or url in JSON-LD is resolved against the page, which works until the
//    same graph is emitted from another path — and a bare /stays would name the
//    307 redirect, the exact defect fixed on the canonical in phase 2.
// ─────────────────────────────────────────────────────────────────────────────

/** Anything JSON-LD can hold. */
type JsonValue = string | number | boolean | null | undefined | JsonValue[] | { [k: string]: JsonValue };

/**
 * Recursively drop null, undefined, empty strings, empty arrays and empty
 * objects. Applied at the end of every builder so a missing database column
 * simply removes its property rather than emitting `"geo": null`.
 *
 * `false` and `0` are KEPT — both are meaningful values (petsAllowed: false,
 * a zero fee), and dropping them would state the opposite of the truth.
 */
export function prune<T extends JsonValue>(value: T): T {
  if (Array.isArray(value)) {
    const arr = value.map(prune).filter((v) => v !== undefined && v !== null);
    return arr as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(value)) {
      const cleaned = prune(v as JsonValue);
      if (cleaned === undefined || cleaned === null) continue;
      if (typeof cleaned === 'string' && cleaned.trim() === '') continue;
      if (Array.isArray(cleaned) && cleaned.length === 0) continue;
      if (
        typeof cleaned === 'object' &&
        !Array.isArray(cleaned) &&
        Object.keys(cleaned).length === 0
      ) continue;
      out[k] = cleaned;
    }
    return out as T;
  }
  return value;
}

// ── Stable @id anchors ───────────────────────────────────────────────────────
// Named nodes so items on other pages can reference the organisation by @id
// instead of restating it — which is how Google merges the entity across a site.
export const ORG_ID = `${CANONICAL_URL}/#organization`;
export const WEBSITE_ID = `${CANONICAL_URL}/#website`;

/**
 * The publisher entity. Emitted once per page from the locale layout.
 *
 * The legal identifiers come from lib/config/company — the same block the
 * footer and both Turkish distance-selling contracts render, so the entity
 * Google reads can never disagree with the entity the law requires us to show.
 *
 * `sameAs` lists only LIVE profiles: SOCIAL_LINKS carries a WhatsApp entry
 * flagged isPlaceholder with href '#', and a sameAs of '#' is a broken claim of
 * identity. mailto: is excluded too — sameAs is for profile pages, and the
 * email belongs in contactPoint, where it is below.
 */
export function organizationSchema(locale: string) {
  const sameAs = SOCIAL_LINKS
    .filter((l) => !l.isPlaceholder && !l.isEmail && l.href.startsWith('https://'))
    .map((l) => l.href);

  return prune({
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE_NAME,
    legalName: COMPANY.legalName,
    url: canonical(locale, ''),
    logo: {
      '@type': 'ImageObject',
      // The generated brand card doubles as the logo image: it is the only
      // raster the site owns, it is on-brand, and it beats naming an SVG that
      // Google's logo extractor will not read.
      url: `${CANONICAL_URL}/opengraph-image`,
      width: 1200,
      height: 630,
    },
    // taxID + vatID are the Turkish tax number; identifier carries MERSIS,
    // which is the registry key a Turkish entity is actually looked up by.
    taxID: COMPANY.taxNo,
    identifier: COMPANY.mersis,
    address: {
      '@type': 'PostalAddress',
      streetAddress: COMPANY.address,
      addressLocality: 'İstanbul',
      addressCountry: 'TR',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: CONTACT_EMAIL,
      telephone: COMPANY.phone,
      availableLanguage: ['ar', 'en', 'tr', 'ru'],
    },
    sameAs,
  });
}

/**
 * The site entity.
 *
 * NO potentialAction / SearchAction, deliberately — see the note handed back
 * with this phase. /stays has no free-text search: `?city=` is an exact
 * case-insensitive match against geo_cities.name (queries/stays), so an
 * arbitrary query string returns an empty page. Declaring a SearchAction that
 * points at it would advertise a search box that does not work, and Google
 * drops sitelinks searchbox markup it cannot verify. It goes in the day a real
 * query endpoint exists.
 */
export function websiteSchema(locale: string) {
  return prune({
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE_NAME,
    url: canonical(locale, ''),
    inLanguage: locale,
    publisher: { '@id': ORG_ID },
  });
}

/** A trail of {name, url} — url absolute, already locale-prefixed. */
export function breadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return prune({
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  });
}

/**
 * FAQPage from editorial Q&A.
 *
 * Returns null when there is nothing to describe. An FAQPage with an empty
 * mainEntity is invalid, and — more to the point — every question here must be
 * VISIBLE on the page (components/destinations/CityFaq renders exactly this
 * array). Markup without an on-page counterpart is a structured-data violation,
 * not a bonus.
 */
export function faqSchema(items: Array<{ q: string; a: string }>) {
  const entities = items.filter((i) => i.q.trim() !== '' && i.a.trim() !== '');
  if (entities.length === 0) return null;

  return prune({
    '@type': 'FAQPage',
    mainEntity: entities.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  });
}

/** A list of listings, in the order the page shows them. */
export function itemListSchema(
  items: Array<{ name: string; url: string; image?: string | null; price?: number | null }>,
) {
  if (items.length === 0) return null;

  return prune({
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      // The nested item is a real node, not a bare url: it lets each entry
      // carry its own name, image and price, which is what turns an ItemList
      // into a carousel-eligible result instead of a list of links.
      item: prune({
        '@type': 'Accommodation',
        name: item.name,
        url: item.url,
        image: item.image ?? undefined,
        // A nightly rate with no dates is a "from" price, so it is expressed as
        // priceSpecification rather than a firm offer price.
        ...(typeof item.price === 'number' && item.price > 0
          ? {
              priceRange: `$${Math.round(item.price)}`,
            }
          : {}),
      }),
    })),
  });
}

/**
 * A single listing.
 *
 * WHY VacationRental
 *   schema.org defines it as a LodgingBusiness "that focuses on renting single
 *   properties for limited time" — which is precisely what every unit here is,
 *   whether it is a villa, an apartment or a single room. Plain LodgingBusiness
 *   would describe a hotel operator, which a one-apartment listing is not, and
 *   the bare Accommodation types are places with no offer or rating surface.
 *   Being a LodgingBusiness subtype, VacationRental still inherits address,
 *   geo, amenityFeature, priceRange and aggregateRating.
 *
 * WHY THE PRICE IS NOT units.base_nightly_price
 *   That column is a DEPRECATED cache of cost x (1 + commission) and goes stale
 *   the moment the owner changes a commission (CLAUDE.md §9). Nothing in this
 *   codebase reads it, and publishing a stale price as structured data is worse
 *   than publishing none — Google penalises markup that disagrees with the
 *   page. The figure here is `pricing.nightly_usd`, resolved live by the
 *   quote_units RPC, and is the same number the booking card shows.
 *
 * WHY THE COORDINATES ARE THE BLURRED ONES
 *   `unit.latitude/longitude` are already offset 300–500 m by approximateCoords
 *   before they leave the query layer; the exact address is withheld until a
 *   booking is confirmed. This emits the same approximate point the public map
 *   already shows — it never has access to the precise one.
 */
export function vacationRentalSchema(input: {
  unit: UnitListing;
  url: string;
  locale: string;
  /** Amenity key → label in the visitor's language. Only present keys are used. */
  amenityLabels: Partial<Record<keyof UnitAmenities, string>>;
  unitTypeLabel?: string;
}) {
  const { unit, url, locale, amenityLabels, unitTypeLabel } = input;

  const name = unit.ad_title ?? unit.unit_name ?? undefined;
  const spec = unit.specifications;

  const images = unit.media
    .filter((m) => m.media_type !== 'video' && !!m.public_url)
    .slice(0, 12)
    .map((m) => m.public_url);

  const amenityFeature = (Object.keys(amenityLabels) as Array<keyof UnitAmenities>)
    .filter((key) => unit.amenities[key] === true && amenityLabels[key])
    .map((key) => ({
      '@type': 'LocationFeatureSpecification',
      name: amenityLabels[key],
      value: true,
    }));

  const nightly = unit.pricing.nightly_usd;

  // ── The ratings hook ───────────────────────────────────────────────────────
  // There are no reviews yet, so rating and review_count are null on every unit
  // and this block emits NOTHING. It is written as a guard rather than left out
  // so the day the reviews table lands, the markup follows with no edit here.
  //
  // The guard is deliberately strict: Google requires ratingValue AND a nonzero
  // reviewCount, and an aggregateRating with reviewCount 0 is a hard error that
  // invalidates the whole item — a real risk if a units row ever carries a
  // rating with no reviews behind it.
  const aggregateRating =
    typeof unit.rating === 'number' &&
    typeof unit.review_count === 'number' &&
    unit.review_count > 0
      ? {
          '@type': 'AggregateRating',
          ratingValue: unit.rating,
          reviewCount: unit.review_count,
          bestRating: 5,
          worstRating: 1,
        }
      : undefined;

  return prune({
    '@type': 'VacationRental',
    '@id': `${url}#listing`,
    name,
    description: unit.ad_description ?? undefined,
    url,
    image: images,
    inLanguage: locale,
    // The brokerage, not the owner — we are the party a guest transacts with.
    provider: { '@id': ORG_ID },

    address: {
      '@type': 'PostalAddress',
      // region is the neighbourhood/district; city is the locality. The exact
      // street address is deliberately never published.
      addressLocality: unit.city ?? undefined,
      addressRegion: unit.region ?? unit.municipality ?? undefined,
      addressCountry: unit.country ?? 'TR',
    },
    geo:
      typeof unit.latitude === 'number' && typeof unit.longitude === 'number'
        ? { '@type': 'GeoCoordinates', latitude: unit.latitude, longitude: unit.longitude }
        : undefined,

    // The rented thing itself, distinct from the rental business node above.
    containsPlace: prune({
      '@type': 'Accommodation',
      name,
      additionalType: unitTypeLabel,
      numberOfBedrooms: spec.bedrooms ?? undefined,
      numberOfBathroomsTotal: spec.bathrooms ?? undefined,
      numberOfRooms: spec.bedrooms ?? undefined,
      occupancy:
        typeof spec.max_guests === 'number' && spec.max_guests > 0
          ? {
              '@type': 'QuantitativeValue',
              maxValue: spec.max_guests,
              unitCode: 'C62', // UN/CEFACT for "one" — i.e. a count of people
            }
          : undefined,
      floorSize:
        typeof spec.size_sqm === 'number' && spec.size_sqm > 0
          ? { '@type': 'QuantitativeValue', value: spec.size_sqm, unitCode: 'MTK' } // m²
          : undefined,
      amenityFeature,
    }),

    // Repeated from containsPlace on purpose: consumers split on which node
    // they read amenities from, and schema.org defines the property on both
    // LodgingBusiness and Accommodation. The duplication is a few hundred bytes.
    amenityFeature,

    // numberOfRooms is deliberately NOT set on this node. On a LodgingBusiness
    // it means the number of LETTABLE rooms the business has — for a
    // three-bedroom villa rented whole, "3" would claim three separately
    // bookable rooms. On containsPlace (an Accommodation) the same property
    // correctly means rooms within the place, which is where it is set.

    // Booleans, so they must survive prune() — false is a real answer here
    // ("pets not allowed"), not a missing value.
    petsAllowed: unit.rules ? unit.rules.allow_pets : undefined,
    smokingAllowed: unit.rules ? unit.rules.allow_smoking : undefined,

    priceRange: typeof nightly === 'number' && nightly > 0 ? `$${nightly}` : undefined,
    // An Offer needs a firm price, and a nightly rate resolved without dates is
    // a starting price, not a quote for a specific stay. priceSpecification
    // says exactly that; a bare `price` would claim a total we cannot honour.
    makesOffer:
      typeof nightly === 'number' && nightly > 0
        ? {
            '@type': 'Offer',
            availability: 'https://schema.org/InStock',
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: nightly,
              priceCurrency: 'USD',
              unitCode: 'DAY',
              referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'DAY' },
            },
          }
        : undefined,

    aggregateRating,
  });
}

/** Wraps one or more schema nodes into a single @graph document. */
export function graph(...nodes: Array<object | null>) {
  return {
    '@context': 'https://schema.org',
    '@graph': nodes.filter((n): n is object => n !== null),
  };
}
