import 'server-only';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { citySlug } from '@/lib/geo/city-slug';
import { routing, type Locale } from '@/i18n/routing';

// ─────────────────────────────────────────────────────────────────────────────
// /destinations/[city] — the data layer.
//
// Two independent sources, joined on city_id:
//
//   public.city_content     editorial copy, one row per (city, language),
//                           published/draft. Owns the CANONICAL SLUG.
//   public.v_city_live_stats  live counts and prices, one row per city.
//                           Numbers only — never a source of text or of slugs.
//
// Read with the anon client: every field on this page is public by definition,
// and both objects are readable under RLS as anon (verified against the live
// project). No service-role anywhere near a public page.
// ─────────────────────────────────────────────────────────────────────────────

/** Live inventory numbers for one city. Every count can legitimately be 0. */
export interface CityLiveStats {
  cityId: string;
  cityName: string;
  availableUnits: number;
  villas: number;
  apartments: number;
  cabins: number;
  rooms: number;
  /** USD. null when the city has no priced, available unit. */
  minPrice: number | null;
  avgPrice: number | null;
}

export interface CityFaqItem {
  q: string;
  a: string;
}

/** A published city_content row, for one language. */
export interface CityContent {
  slug: string;
  languageCode: string;
  metaTitle: string | null;
  metaDescription: string | null;
  h1: string | null;
  intro: string | null;
  /** Markdown. Rendered by components/destinations/CityBody — never as raw HTML. */
  body: string | null;
  faq: CityFaqItem[];
  highlights: string[];
  updatedAt: string | null;
}

export interface Destination {
  /** The slug this page is served at — curated when published, derived otherwise. */
  slug: string;
  /** geo_cities cover photo, for the social card. null when the city has none. */
  imageUrl: string | null;
  stats: CityLiveStats;
  /** null when nothing is published for this city in this locale (fallback mode). */
  content: CityContent | null;
  /**
   * Locales that have PUBLISHED content for this city. Phase 2 needs it to emit
   * a reciprocal hreflang set — advertising a locale that renders the bare
   * fallback would point Google at a page with no translated content.
   */
  publishedLocales: Locale[];
}

/** A city as it appears in a link list (homepage strip, /stays rail). */
export interface DestinationLink {
  cityId: string;
  cityName: string;
  slug: string;
  availableUnits: number;
  minPrice: number | null;
  /** True when this city has editorial content published in the given locale. */
  hasContent: boolean;
}

// ── Raw row shapes ───────────────────────────────────────────────────────────
// reason: PostgREST returns loosely-typed JSON; a narrow local shape beats
// fighting the client's generics for two small reads.
/* eslint-disable @typescript-eslint/no-explicit-any */
type RawStatsRow = any;
type RawContentRow = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const CONTENT_COLUMNS =
  'city_id,language_code,slug,meta_title,meta_description,h1,intro,body,faq,highlights,updated_at';

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapStats(row: RawStatsRow): CityLiveStats {
  return {
    cityId: String(row.city_id),
    cityName: String(row.city_name ?? '').trim(),
    availableUnits: toNumber(row.available_units),
    villas: toNumber(row.villas),
    apartments: toNumber(row.apartments),
    cabins: toNumber(row.cabins),
    rooms: toNumber(row.rooms),
    minPrice: toNullableNumber(row.min_price),
    avgPrice: toNullableNumber(row.avg_price),
  };
}

/**
 * faq and highlights are jsonb — the database guarantees valid JSON, not a
 * shape. A malformed row must degrade to "no FAQ", never crash a public page.
 */
function mapFaq(value: unknown): CityFaqItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({ q: String(item.q ?? '').trim(), a: String(item.a ?? '').trim() }))
    .filter((item) => item.q !== '' && item.a !== '');
}

function mapHighlights(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? '').trim()).filter((v) => v !== '');
}

function mapContent(row: RawContentRow): CityContent {
  return {
    slug: String(row.slug ?? '').trim().toLowerCase(),
    languageCode: String(row.language_code ?? '').trim(),
    metaTitle: row.meta_title ?? null,
    metaDescription: row.meta_description ?? null,
    h1: row.h1 ?? null,
    intro: row.intro ?? null,
    body: row.body ?? null,
    faq: mapFaq(row.faq),
    highlights: mapHighlights(row.highlights),
    updatedAt: (row.updated_at as string) ?? null,
  };
}

// ── Cached reads ─────────────────────────────────────────────────────────────

/**
 * Every city's live stats.
 *
 * Tagged 'units' so /api/revalidate drops it on the same webhook that already
 * fires for units — the counts on this view ARE unit counts, so they go stale
 * on exactly the same edge as the listing.
 */
const cachedStats = unstable_cache(
  async (): Promise<CityLiveStats[]> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from('v_city_live_stats')
      .select('city_id,city_name,available_units,villas,apartments,cabins,rooms,min_price,avg_price');

    if (error) {
      console.error('[destinations] v_city_live_stats failed', {
        message: error.message, code: error.code,
      });
      return [];
    }
    return (data ?? []).map(mapStats).filter((s) => s.cityName !== '');
  },
  ['destinations-city-stats'],
  { tags: ['units'], revalidate: 600 },
);

/** A published row plus the join key the public shape deliberately omits. */
type PublishedRow = CityContent & { cityId: string; locale: Locale };

/**
 * Every PUBLISHED city_content row, all cities, all languages, in ONE read.
 *
 * The whole set rather than one city at a time, because slug→city resolution
 * needs it: a slug published only in Arabic must still resolve for an English
 * visitor (who then gets the fallback page, not a 404). The table holds a
 * handful of rows, so this is one small query instead of two round trips.
 *
 * Rows in a language we do not serve are dropped here — routing.locales is the
 * only list of languages this site has pages for.
 *
 * Tagged 'city-content'. NOTE: no webhook drops that tag today (the editorial
 * table has no revalidate hook), so a newly published city appears within the
 * revalidate window below rather than instantly. Intended trade: this is copy
 * that changes a few times a month, not inventory.
 */
const cachedPublishedContent = unstable_cache(
  async (): Promise<PublishedRow[]> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from('city_content')
      .select(CONTENT_COLUMNS)
      .eq('status', 'published');

    if (error) {
      console.error('[destinations] city_content failed', {
        message: error.message, code: error.code,
      });
      return [];
    }

    const rows: PublishedRow[] = [];
    for (const row of data ?? []) {
      const mapped = mapContent(row);
      if (!mapped.slug) continue;
      if (!routing.locales.includes(mapped.languageCode as Locale)) continue;
      rows.push({
        ...mapped,
        cityId: String(row.city_id),
        locale: mapped.languageCode as Locale,
      });
    }
    return rows;
  },
  ['destinations-published-content'],
  { tags: ['city-content'], revalidate: 1800 },
);

/**
 * cityId → cover photo URL, from geo_cities.media.
 *
 * Only the social card needs this, so it is a separate read rather than a
 * column on the hot path: the page body renders the same photos through the
 * unit grid and never touches it.
 *
 * ⚠️ RETURNS AN ARRAY OF PAIRS, NOT A Map — AND MUST STAY THAT WAY.
 * unstable_cache serialises its return value to JSON. A Map survives the first
 * (uncached) call intact and comes back as `{}` on every cache HIT, so a Map
 * here fails intermittently: fine on the render that populates the cache, a
 * 500 on the next one. Caught exactly that way — /en and /ar rendered, then
 * /tr threw `images.get is not a function`. Every value crossing this boundary
 * must be plain JSON; the Map is rebuilt by the caller.
 */
const cachedCityImages = unstable_cache(
  async (): Promise<Array<[string, string]>> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from('geo_cities')
      .select('id,media')
      .eq('is_active', true);

    if (error) {
      // A missing OG image is a cosmetic loss, never a reason to fail a page.
      console.error('[destinations] geo_cities media failed', {
        message: error.message, code: error.code,
      });
      return [];
    }

    const pairs: Array<[string, string]> = [];
    for (const row of data ?? []) {
      const media: Array<{ url?: unknown; is_cover?: boolean }> = Array.isArray(row.media)
        ? row.media
        : [];
      const cover = media.find((m) => m?.is_cover) ?? media[0] ?? null;
      const url = cover?.url;
      if (typeof url === 'string' && url.trim() !== '') pairs.push([String(row.id), url]);
    }
    return pairs;
  },
  ['destinations-city-images'],
  { tags: ['city-content'], revalidate: 1800 },
);

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * The canonical slug for every city: the curated city_content.slug when the
 * city has any published row, else derived from the city name.
 *
 * A city's slug is deliberately ONE value across all four locales. Localised
 * slugs would fragment the hreflang cluster and every internal link with it,
 * for no ranking gain that a Latin-script slug does not already have.
 */
/**
 * cityId → destination slug, for EVERY city the stats view knows about.
 *
 * Exported because the homepage city strip renders from geo_cities (it needs
 * the cover images, which live there) and still has to link at the same slug
 * this route resolves. Two independent slug derivations would drift, and the
 * drift would show up as 404s on the most prominent links on the site.
 */
export async function getCitySlugMap(): Promise<Map<string, string>> {
  const [stats, published] = await Promise.all([cachedStats(), cachedPublishedContent()]);
  return slugsByCityId(stats, published);
}

function slugsByCityId(stats: CityLiveStats[], published: PublishedRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of stats) map.set(s.cityId, citySlug(s.cityName));
  // Curated slugs overwrite derived ones — never the reverse.
  for (const row of published) map.set(row.cityId, row.slug);
  return map;
}

/**
 * Cities worth linking to, most inventory first.
 *
 * Cities with zero available units are excluded: a link promising stays that
 * leads to an empty grid is a bad link for a guest and a thin page for Google.
 * They are equally absent from the sitemap (v_sitemap_cities lists published
 * content only), so nothing here contradicts what we advertise.
 */
export async function listDestinations(locale: string): Promise<DestinationLink[]> {
  const [stats, published] = await Promise.all([cachedStats(), cachedPublishedContent()]);
  const slugs = slugsByCityId(stats, published);

  const withContent = new Set(
    published.filter((r) => r.locale === locale).map((r) => r.cityId),
  );

  return stats
    .filter((s) => s.availableUnits > 0)
    .map((s) => ({
      cityId: s.cityId,
      cityName: s.cityName,
      slug: slugs.get(s.cityId) ?? citySlug(s.cityName),
      availableUnits: s.availableUnits,
      minPrice: s.minPrice,
      hasContent: withContent.has(s.cityId),
    }))
    .filter((d) => d.slug !== '')
    .sort((a, b) => b.availableUnits - a.availableUnits || a.cityName.localeCompare(b.cityName));
}

/**
 * Resolve a URL slug to a destination, for `locale`.
 *
 * Resolution order, and why:
 *   1. A published city_content row whose slug matches — in ANY language. The
 *      slug is one value per city, so an Arabic-only publication still owns it
 *      for an English visitor; that visitor gets `content: null` (fallback
 *      mode), not a 404.
 *   2. A derived slug matching a city that has stats. Covers every city with
 *      units but no editorial page — the homepage strip links to all of them.
 *
 * Returns null only when the slug matches no city at all. A city that resolves
 * but has neither content nor units still renders: it is a real place with a
 * real (if empty) page, and 404-ing it would break a link we published.
 */
export async function resolveDestination(
  slug: string,
  locale: string,
): Promise<Destination | null> {
  const wanted = slug.trim().toLowerCase();
  if (!wanted) return null;

  const [stats, published, imagePairs] = await Promise.all([
    cachedStats(),
    cachedPublishedContent(),
    cachedCityImages(),
  ]);
  // Rebuilt here, not inside the cache — see the warning on cachedCityImages.
  const images = new Map(imagePairs);

  // 1 — curated slug
  let cityId = published.find((r) => r.slug === wanted)?.cityId ?? null;

  // 2 — derived slug
  if (!cityId) {
    cityId = stats.find((s) => citySlug(s.cityName) === wanted)?.cityId ?? null;
  }
  if (!cityId) return null;

  const cityStats = stats.find((s) => s.cityId === cityId);
  if (!cityStats) return null;

  const cityRows = published.filter((r) => r.cityId === cityId);
  const publishedLocales = [...new Set(cityRows.map((r) => r.locale))];
  const canonicalSlug = cityRows[0]?.slug ?? citySlug(cityStats.cityName);

  // The content row for THIS locale, if it is published. Deliberately no
  // cross-locale fallback: showing English prose under an Arabic <html lang="ar">
  // is worse for both a reader and a crawler than showing the units alone.
  const content = cityRows.find((c) => c.locale === locale) ?? null;

  return {
    slug: canonicalSlug,
    imageUrl: images.get(cityId) ?? null,
    stats: cityStats,
    content,
    publishedLocales,
  };
}
