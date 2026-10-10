import 'server-only';
import { createPublicClient } from '@/lib/supabase/public';
import { unstable_cache } from 'next/cache';
import { pickLocalizedName } from '@/lib/geo/localize';
import { countryNamesByIso, localizedCountryName } from '@/lib/geo/countries';
import type { SupabaseClient } from '@supabase/supabase-js';
import { approximateCoords } from '@/lib/geo/approximate';
import {
  AMENITY_FILTERS,
  DEFAULT_SORT,
  STAY_TYPES,
  type AmenityFilter,
  type SortKey,
  type StayType,
  type StaysFilters,
} from '@/lib/stays/filters';
import { CATEGORY_TYPES, categoryOf, type Category } from '@/lib/stays/categories';
import { distanceKm, rankUnits, type QualitySignals, type RankRequest } from '@/lib/stays/ranking';
import type {
  UnitCardData,
  UnitListing,
  UnitMediaItem,
  UnitPricing,
  UnitSpecifications,
  UnitAmenities,
  UnitRules,
  UnitCancellationPolicy,
  UnitTypeEnum,
  UnitStyleEnum,
  BusinessModelEnum,
} from '@/lib/types/unit';

// ─────────────────────────────────────────────────────────────────────────────
// Public listing queries — guest-facing /stays index and /stays/[id] detail.
//
// Single source of truth: the live Homesta Stay Supabase project. Reads only
// public, guest-facing tables via the anon key (RLS enforced). Never returns
// owner_profile_id, financial fields, or any host-private data.
//
// STRICT public-visibility filter (a unit appears ONLY when ALL hold):
//   units.status = 'available'
//   units.archived_at IS NULL            — exclude HP-ADMIN unit-level soft-archive
//   unit_info.ad_title present (non-empty after trim)
//   properties.archived_at IS NULL       — exclude HP-ADMIN property-level soft-archive
//
// As more hosts fill in ad_title, more units surface automatically — no code
// change needed.
// ─────────────────────────────────────────────────────────────────────────────

// Columns selected for every listing. Embedded one-to-one tables come back from
// PostgREST as single-element arrays (no unique constraint on their unit_id FK),
// so the mapper reads element [0]. properties resolves to an object (units.property_id FK).
const LISTING_SELECT = [
  // base_nightly_price is deliberately NOT selected — it is a deprecated cache
  // of cost x (1 + commission) and goes stale whenever the owner changes a
  // commission. Prices come from the quote_units RPC instead (see fetchQuotes).
  'id,slug,unit_type,unit_name,status,unit_style,business_model,min_nights,currency,cancellation_policy_id',
  // Payment terms the owner set. Customer-facing (they decide what the guest
  // is asked to pay now), and granted to anon — no cost or commission here.
  'allow_full_prepay,allow_deposit,allow_pay_at_arrival',
  // full_address and google_maps_url are deliberately not selected: both pin the
  // exact property, and anything selected here reaches the browser in the RSC
  // payload. Public surfaces get the blurred point from approximateCoords only.
  'unit_info!inner(ad_title,ad_description,city,region,municipality,latitude,longitude)',
  'unit_specifications(bedrooms,beds,bathrooms,max_guests,size_sqm,floor,balconies,kitchens,distance_to_mall,distance_to_transport)',
  'unit_amenities(tv,wifi,air_conditioning,heating,kitchen,dishwasher,washing_machine,hot_water,hair_dryer,iron,extra_bed,parking,elevator,pool,gym,self_check_in)',
  'unit_rules(allow_parties,allow_pets,allow_smoking,quiet_hours_enabled,quiet_hours_from,quiet_hours_to,allow_unregistered_guests,family_friendly,id_required,additional_rules)',
  'unit_media(id,unit_id,media_type,file_path,public_url,is_cover,sort_order)',
  // The geo embeds carry every language column, not just `name`: mapRow picks
  // one per visitor locale (see lib/geo/localize). `name` stays selected as the
  // last fallback AND as the canonical value the city filter matches on.
  // geo_countries has no FK to the translated `countries` table, so only its
  // iso_code comes back here and the name is resolved in lib/geo/countries.
  'properties!inner(name,property_type,cover_photo_url,geo_cities:city_id(id,name,name_ar,name_en,name_tr),geo_districts:district_id(id,name,name_ar,name_en,name_tr),geo_countries:country_id(id,name,iso_code))',
  // Locale-aware marketing copy. All non-Turkish rows are AI translations of the
  // Turkish source. Resolved per visitor locale in mapRow (see resolveTranslation).
  'unit_translations(language_code,ad_title,ad_description)',
].join(',');

// A listing CARD renders only: cover image, title, city/region, price. It never
// shows amenities, rules, specs, description, or the gallery — those load on the
// unit detail page (which keeps LISTING_SELECT). This trimmed select is why the
// homepage/listing payload drops ~90%: no amenities/rules/specs joins, ONE cover
// photo (via the embedded order+limit below), and the visitor's locale + Turkish
// source only (via the embedded language filter), not all four locales.
const CARD_SELECT = [
  'id,slug,unit_type,unit_name,status,min_nights,currency,cancellation_policy_id',
  'allow_full_prepay,allow_deposit,allow_pay_at_arrival',
  // ad_description + latitude/longitude dropped: the card shows neither.
  'unit_info!inner(ad_title,city,region,municipality)',
  // FOUR of the ten spec columns, for the card's "2 bedrooms · 2 beds · 1 bath"
  // line. The other six (size, floor, balconies, kitchens, the two distances)
  // stay on the detail page — this is four small integers per card, not the
  // whole join the trim above was written to avoid. max_guests rides along so
  // the guests filter can reuse this embed instead of adding a second one.
  'unit_specifications(bedrooms,beds,bathrooms,max_guests)',
  // name + property_type dropped.
  'properties!inner(cover_photo_url,geo_cities:city_id(id,name,name_ar,name_en,name_tr),geo_districts:district_id(id,name,name_ar,name_en,name_tr),geo_countries:country_id(id,name,iso_code))',
  // Trimmed to one row per unit by the embedded order+limit in cardTrims().
  'unit_media(public_url,is_cover,sort_order,media_type)',
  // ad_description dropped; rows narrowed to [locale, tr] by cardTrims().
  'unit_translations(language_code,ad_title)',
].join(',');

/**
 * Apply the card-specific trims to a units query: one cover photo per unit
 * (is_cover first, then sort_order — so a unit with no flagged cover still gets
 * its first photo), and only the visitor's locale + the Turkish source rows.
 * Neither filter uses !inner, so a unit with no cover / no translation is kept
 * and falls back (property cover_photo_url / Turkish source) in mapRow.
 */
// query is typed loosely to sidestep the Supabase builder's deeply-recursive
// generics (they blow TS's instantiation-depth limit); the caller keeps its own
// builder type via the T pass-through.
function cardTrims<T>(query: T, locale: string): T {
  /* eslint-disable @typescript-eslint/no-explicit-any */ // reason: builder chain
  return (query as any)
    .order('is_cover',   { referencedTable: 'unit_media', ascending: false })
    .order('sort_order', { referencedTable: 'unit_media', ascending: true })
    .limit(1, { referencedTable: 'unit_media' })
    .in('unit_translations.language_code', Array.from(new Set([locale, SOURCE_LOCALE]))) as T;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

// Turkish is the source language every listing is authored in; all fallbacks
// end here before dropping to the legacy unit_info free-text.
const SOURCE_LOCALE = 'tr';

// Raw shape returned by Supabase for the select above.
// reason: PostgREST embeds are loosely typed; a narrow local shape is clearer than fighting generics.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawRow = any;

const EMPTY_SPECS: UnitSpecifications = {
  bedrooms: null, beds: null, bathrooms: null, max_guests: null,
  size_sqm: null, floor: null, balconies: null, kitchens: null,
  distance_to_mall: null, distance_to_transport: null,
};

const EMPTY_AMENITIES: UnitAmenities = {
  tv: false, wifi: false, air_conditioning: false, heating: false,
  kitchen: false, dishwasher: false, washing_machine: false, hot_water: false,
  hair_dryer: false, iron: false, extra_bed: false, parking: false,
  elevator: false, pool: false, gym: false, self_check_in: false,
};

const EMPTY_PRICING: UnitPricing = { nightly_usd: null, total_usd: null, nights: null };

/** PostgREST can hand `numeric` back as a string; coerce once, here. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Live prices for a set of units in ONE round trip (the quote_units RPC).
 *
 * With dates, total_usd is the resolver's SUM across the stay — never a nightly
 * rate multiplied by nights, which would ignore seasonal unit_daily_prices rows
 * and every length-of-stay discount. Without dates, nightly_usd is the
 * representative rate: cost_price x (1 + commission_percent), computed live.
 *
 * The RPC is SECURITY DEFINER because anon has no column grant on cost_price;
 * it returns customer-facing figures only, so no owner cost reaches the client.
 *
 * On error this returns an empty map, so the UI hides prices rather than
 * showing a wrong one. Priceless-and-loud beats mispriced-and-quiet.
 */
async function fetchQuotes(
  supabase: SupabaseClient,
  unitIds: string[],
  checkIn?: string,
  checkOut?: string,
): Promise<Map<string, UnitPricing>> {
  const map = new Map<string, UnitPricing>();
  const unique = [...new Set(unitIds.filter(Boolean))];
  if (unique.length === 0) return map;

  const { data, error } = await supabase.rpc('quote_units', {
    p_unit_ids:  unique,
    p_check_in:  checkIn ?? null,
    p_check_out: checkOut ?? null,
  });

  if (error) {
    console.error('[fetchQuotes]', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      units: unique.length,
      dated: !!(checkIn && checkOut),
    });
    return map;
  }

  for (const row of (data ?? []) as RawRow[]) {
    map.set(row.unit_id as string, {
      nightly_usd: num(row.nightly_usd),
      total_usd:   num(row.total_usd),
      nights:      num(row.nights),
    });
  }
  return map;
}

/** Read the single row of a one-to-one embed (PostgREST returns [row] or []). */
function one<T>(embed: T[] | T | null | undefined): T | null {
  if (Array.isArray(embed)) return embed[0] ?? null;
  return embed ?? null;
}

/**
 * Media sorted the way the UI expects: cover first, then sort_order ascending.
 * Falls back to properties.cover_photo_url when the unit has no media rows, so a
 * card/gallery still has an image. Returns [] when nothing is available (the UI
 * then renders its own empty slot — no broken placeholder).
 */
function resolveMedia(row: RawRow): UnitMediaItem[] {
  const media: UnitMediaItem[] = Array.isArray(row.unit_media) ? [...row.unit_media] : [];
  if (media.length > 0) {
    media.sort((a, b) => {
      if (a.is_cover !== b.is_cover) return a.is_cover ? -1 : 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    return media;
  }
  const propCover: string | null = row.properties?.cover_photo_url ?? null;
  if (propCover) {
    return [{
      id: `prop-cover-${row.id}`,
      unit_id: row.id,
      media_type: 'image',
      file_path: '',
      public_url: propCover,
      is_cover: true,
      sort_order: 0,
    }];
  }
  return [];
}

type TranslationRow = {
  language_code: string;
  ad_title: string | null;
  ad_description: string | null;
};

type ResolvedContent = {
  ad_title: string | null;
  ad_description: string | null;
  content_language: string | null;
  is_machine_translated: boolean;
};

/**
 * Resolve marketing copy for the visitor's locale with a 3-step fallback chain:
 *   1. unit_translations row matching the visitor locale
 *   2. Turkish (source) row
 *   3. legacy unit_info free-text
 * Title and description fall back independently (field-level). content_language
 * tracks the language the description text is actually in (for text direction);
 * is_machine_translated is true only when a non-Turkish translation is served.
 */
function resolveTranslation(
  translations: TranslationRow[] | null | undefined,
  locale: string,
  legacyTitle: string | null,
  legacyDescription: string | null,
): ResolvedContent {
  const rows = Array.isArray(translations) ? translations : [];
  const match = rows.find((t) => t.language_code === locale) ?? null;
  const source = rows.find((t) => t.language_code === SOURCE_LOCALE) ?? null;

  const ad_title = match?.ad_title || source?.ad_title || legacyTitle || null;

  let ad_description: string | null;
  let content_language: string | null;
  if (match?.ad_description) {
    ad_description = match.ad_description;
    content_language = match.language_code;
  } else if (source?.ad_description) {
    ad_description = source.ad_description;
    content_language = SOURCE_LOCALE;
  } else {
    // Legacy unit_info text is authored in Turkish (the source language).
    ad_description = legacyDescription ?? null;
    content_language = legacyDescription ? SOURCE_LOCALE : null;
  }

  const is_machine_translated =
    locale !== SOURCE_LOCALE && !!match && (!!match.ad_title || !!match.ad_description);

  return { ad_title, ad_description, content_language, is_machine_translated };
}

/** Map one raw DB row into the guest-facing UnitListing shape the UI consumes. */
function mapRow(
  row: RawRow,
  policy: UnitCancellationPolicy | null,
  locale: string,
  pricing: UnitPricing,
  /** ISO → translated country names. See lib/geo/countries for why it is passed
   *  in rather than joined: the two country tables have no foreign key. */
  countryNames: Map<string, { name_en?: string | null; name_tr?: string | null; name_ar?: string | null }>,
): UnitListing {
  const info = one<RawRow>(row.unit_info);
  const specsRow = one<RawRow>(row.unit_specifications);
  const amenitiesRow = one<RawRow>(row.unit_amenities);
  const rulesRow = one<RawRow>(row.unit_rules);
  const props = row.properties ?? null;

  // Locale-aware title/description (unit_translations → Turkish → legacy unit_info).
  const content = resolveTranslation(
    row.unit_translations,
    locale,
    info?.ad_title ?? null,
    info?.ad_description ?? null,
  );

  // Location: prefer the canonical geo lookup (via property FKs); fall back to
  // the free-text values a host typed on unit_info.
  //
  // Localised HERE, at the one point where a DB row becomes a UnitListing, so
  // every surface downstream — card, detail page, breadcrumb, JSON-LD, share
  // card — reads the same name in the same language without asking. The rows
  // carry name_ar/name_en/name_tr; pickLocalizedName falls back through English
  // to the canonical `name`, so a missing translation degrades to a spelling
  // rather than to a blank.
  const cityRow = props?.geo_cities ?? null;
  const districtRow = props?.geo_districts ?? null;
  const countryRow = props?.geo_countries ?? null;

  const geoCity: string | null = pickLocalizedName(locale, cityRow);
  const geoDistrict: string | null = pickLocalizedName(locale, districtRow);

  const specifications: UnitSpecifications = specsRow
    ? {
        bedrooms: specsRow.bedrooms ?? null,
        beds: specsRow.beds ?? null,
        bathrooms: specsRow.bathrooms ?? null,
        max_guests: specsRow.max_guests ?? null,
        size_sqm: specsRow.size_sqm ?? null,
        floor: specsRow.floor ?? null,
        balconies: specsRow.balconies ?? null,
        kitchens: specsRow.kitchens ?? null,
        distance_to_mall: specsRow.distance_to_mall ?? null,
        distance_to_transport: specsRow.distance_to_transport ?? null,
      }
    : { ...EMPTY_SPECS };

  const amenities: UnitAmenities = amenitiesRow
    ? {
        tv: !!amenitiesRow.tv,
        wifi: !!amenitiesRow.wifi,
        air_conditioning: !!amenitiesRow.air_conditioning,
        heating: !!amenitiesRow.heating,
        kitchen: !!amenitiesRow.kitchen,
        dishwasher: !!amenitiesRow.dishwasher,
        washing_machine: !!amenitiesRow.washing_machine,
        hot_water: !!amenitiesRow.hot_water,
        hair_dryer: !!amenitiesRow.hair_dryer,
        iron: !!amenitiesRow.iron,
        extra_bed: !!amenitiesRow.extra_bed,
        parking: !!amenitiesRow.parking,
        elevator: !!amenitiesRow.elevator,
        pool: !!amenitiesRow.pool,
        gym: !!amenitiesRow.gym,
        self_check_in: !!amenitiesRow.self_check_in,
      }
    : { ...EMPTY_AMENITIES };

  const rules: UnitRules | null = rulesRow
    ? {
        allow_parties: !!rulesRow.allow_parties,
        allow_pets: !!rulesRow.allow_pets,
        allow_smoking: !!rulesRow.allow_smoking,
        quiet_hours_enabled: !!rulesRow.quiet_hours_enabled,
        quiet_hours_from: rulesRow.quiet_hours_from ?? null,
        quiet_hours_to: rulesRow.quiet_hours_to ?? null,
        allow_unregistered_guests: !!rulesRow.allow_unregistered_guests,
        family_friendly: !!rulesRow.family_friendly,
        id_required: !!rulesRow.id_required,
        additional_rules: rulesRow.additional_rules ?? null,
      }
    : null;

  return {
    id: row.id,
    unit_type: (row.unit_type ?? 'other') as UnitTypeEnum,
    unit_name: row.unit_name ?? null,
    slug: row.slug ?? null,
    status: row.status,
    unit_style: (row.unit_style ?? null) as UnitStyleEnum | null,
    business_model: (row.business_model ?? null) as BusinessModelEnum | null,
    min_nights: typeof row.min_nights === 'number' ? row.min_nights : 1,
    // Defaults match the database's: prepayment always available unless the
    // owner turned it off, deposit only where it was turned on.
    allow_full_prepay: row.allow_full_prepay !== false,
    allow_deposit: row.allow_deposit === true,
    allow_pay_at_arrival: row.allow_pay_at_arrival === true,
    currency: 'USD',
    pricing,

    ad_title: content.ad_title,
    ad_description: content.ad_description,
    country: localizedCountryName(locale, countryRow?.iso_code, countryRow?.name, countryNames),
    city: geoCity ?? info?.city ?? null,
    region: geoDistrict ?? info?.region ?? null,
    municipality: info?.municipality ?? null,
    // The ids travel with the names so a caller can link, filter or group by
    // place without re-deriving it from a translated string. district_id is
    // null for most units — only Istanbul has districts recorded so far.
    city_id: cityRow?.id ?? null,
    district_id: districtRow?.id ?? null,
    country_id: countryRow?.id ?? null,
    // Blurred here, at the single point where DB rows become public listings, so
    // no caller can accidentally publish the real address.
    ...approximateCoords(
      row.id,
      typeof info?.latitude === 'number' ? info.latitude : null,
      typeof info?.longitude === 'number' ? info.longitude : null,
    ),

    specifications,
    amenities,
    rules,
    cancellation_policy: policy,
    media: resolveMedia(row),

    // Reviews aggregate not built yet.
    rating: null,
    review_count: null,

    content_language: content.content_language,
    is_machine_translated: content.is_machine_translated,
  };
}

/**
 * Fetch cancellation policies for a set of ids in one query and index them by id,
 * resolving name/description for the visitor locale (locale → Turkish → legacy
 * base row). units.cancellation_policy_id has no FK constraint, so PostgREST
 * can't embed it — we resolve it with a small companion query instead.
 */
async function fetchPolicies(
  supabase: SupabaseClient,
  ids: string[],
  locale: string,
): Promise<Map<string, UnitCancellationPolicy>> {
  const map = new Map<string, UnitCancellationPolicy>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;

  const { data, error } = await supabase
    .from('unit_cancellation_policy')
    .select('id, name, description, cancellation_policy_translations(language_code, name, description)')
    .in('id', unique);

  if (error) {
    console.error('[getPublicUnits] cancellation policies:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return map;
  }

  for (const p of (data ?? []) as RawRow[]) {
    const trans: RawRow[] = Array.isArray(p.cancellation_policy_translations)
      ? p.cancellation_policy_translations
      : [];
    const match = trans.find((t) => t.language_code === locale) ?? null;
    const source = trans.find((t) => t.language_code === SOURCE_LOCALE) ?? null;
    map.set(p.id as string, {
      id: p.id as string,
      name: match?.name || source?.name || p.name || '',
      description: match?.description || source?.description || p.description || '',
    });
  }
  return map;
}

/** True when a raw row carries a usable (non-empty) ad_title. */
function hasAdTitle(row: RawRow): boolean {
  const title = one<RawRow>(row.unit_info)?.ad_title;
  return typeof title === 'string' && title.trim() !== '';
}

// The filter shape lives with the rest of the filter vocabulary (client-safe);
// re-exported so existing imports from this module keep working.
export type { StaysFilters };

/**
 * unit_ids with a calendar block overlapping [checkIn, checkOut).
 *
 * Half-open overlap: `start < checkOut AND end > checkIn`. A block ending on the
 * requested check-in date does not collide, because calendar.end_date is the
 * checkout day rather than the last occupied night — the same convention the
 * bookings table uses (check_in 06-19, check_out 06-21 => nights = 2).
 *
 * Runs server-side and returns ids only: calendar rows carry `reason` and
 * `notes` (e.g. "Technician scheduled for full HVAC replacement"), which are
 * internal and must never reach a guest.
 */
async function blockedUnitIds(
  supabase: SupabaseClient,
  checkIn: string,
  checkOut: string,
): Promise<string[] | null> {
  const { data, error } = await supabase
    .from('calendar')
    .select('unit_id')
    .lt('start_date', checkOut)
    .gt('end_date', checkIn);

  if (error) {
    // Fail closed: returning [] here would silently advertise blocked units as
    // free, which risks a double booking. The caller aborts instead.
    console.error('[blockedUnitIds]', { message: error.message, code: error.code });
    return null;
  }

  return [...new Set((data ?? []).map((r) => r.unit_id as string))];
}

/**
 * All publicly visible units for the /stays index, mapped to UnitListing with
 * title/description resolved for `locale` (defaults to Turkish, the source).
 * Optionally narrowed by `filters`. Returns [] on error (logged) — the page then
 * renders its empty state.
 */
/**
 * Attach live prices + cancellation policies to raw card rows and map them to
 * UnitListing. Shared by the paged listing and the random-featured path. The
 * two lookups are independent, so they run concurrently — the added price
 * lookup costs the slower of the two, not the sum.
 */
async function mapCardRows(
  supabase: SupabaseClient,
  data: RawRow[],
  locale: string,
  checkIn?: string,
  checkOut?: string,
  /** Quotes the caller already holds (the price filter/sort fetched them) — skips a second RPC. */
  prefetchedQuotes?: Map<string, UnitPricing>,
  /** False for lean cards, which never show the policy — saves a round trip. */
  withPolicies = true,
): Promise<UnitListing[]> {
  const rows = data.filter(hasAdTitle);
  const [policies, quotes, countryNames] = await Promise.all([
    withPolicies
      ? fetchPolicies(supabase, rows.map((r) => r.cancellation_policy_id), locale)
      : Promise.resolve(new Map<string, UnitCancellationPolicy>()),
    prefetchedQuotes ?? fetchQuotes(supabase, rows.map((r) => r.id as string), checkIn, checkOut),
    // One cached lookup for the whole page, not one per unit.
    countryNamesByIso(),
  ]);
  return rows.map((r) =>
    mapRow(
      r,
      policies.get(r.cancellation_policy_id) ?? null,
      locale,
      quotes.get(r.id as string) ?? EMPTY_PRICING,
      countryNames,
    ),
  );
}

export const LISTING_PAGE_SIZE = 24;

/** A listing page, plus what the filter sheet needs to say about it. */
export interface StaysPage {
  units: UnitListing[];
  total: number;
  /**
   * For each filterable amenity, how many of THIS search's results have it —
   * i.e. how many results adding that amenity would leave. Drives the live
   * counts on the amenity chips (gym is on 23 units; the guest sees that
   * before tapping it, not after an empty page).
   */
  amenityCounts: Record<AmenityFilter, number>;
}

const ZERO_AMENITY_COUNTS = Object.fromEntries(
  AMENITY_FILTERS.map((a) => [a, 0]),
) as Record<AmenityFilter, number>;

const EMPTY_PAGE: StaysPage = { units: [], total: 0, amenityCounts: ZERO_AMENITY_COUNTS };

/**
 * Public listing.
 *
 * The UNFILTERED first page is cached and tagged 'units' — it is identical for
 * every visitor and is the transcontinental query we most want to skip. Any
 * filter (city / guests / DATES / price / amenities / sort) goes straight to
 * the DB: availability MUST be live, or a guest could be shown a unit that is
 * already booked. So only the plain /stays index is cached; every search is fresh.
 */
export async function getPublicUnits(
  locale: string = SOURCE_LOCALE,
  filters: StaysFilters = {},
  page = 1,
  pageSize = LISTING_PAGE_SIZE,
): Promise<StaysPage> {
  const unfiltered = Object.values(filters).every((v) => v === undefined);

  if (unfiltered && page === 1 && pageSize === LISTING_PAGE_SIZE) {
    return unstable_cache(
      () => queryPublicUnits(locale, {}, 1, LISTING_PAGE_SIZE),
      ['stays-unfiltered-v2', locale],
      { tags: ['units'], revalidate: 600 },
    )();
  }
  return queryPublicUnits(locale, filters, page, pageSize);
}

/** One row of the narrow candidate query — enough to filter, count, rank and sort. */
interface Candidate {
  id: string;
  created_at: string;
  unit_type: string;
  /** unit_info.ad_title — the Turkish source title. */
  title: string;
  amenities: Record<AmenityFilter, boolean>;
  maxGuests: number | null;
  minNights: number;
  propertyId: string | null;
  districtId: string | null;
  /** geo_cities.name — the canonical city, for "nearby cities" suggestions. */
  city: string | null;
  /** Set by the recommended ranking (see lib/stays/ranking). */
  score?: number;
  longStay?: boolean;
  reasons?: string[];
}

/** Whole nights between two ISO dates (both already validated as real dates). */
function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** PostgREST ilike treats % and _ as wildcards; a city name is a literal. */
function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * The per-night figure the price filter and sort compare.
 *
 * With dates it is the stay's real average — the resolver's total over the
 * nights, so seasonal overrides and length-of-stay discounts count. Without
 * dates it is the representative nightly rate. Both are live customer prices
 * from quote_units, never the deprecated base_nightly_price cache.
 */
function comparablePrice(quote: UnitPricing | undefined): number | null {
  if (!quote) return null;
  if (quote.total_usd !== null && quote.nights) return quote.total_usd / quote.nights;
  return quote.nightly_usd;
}

/**
 * The listing, in five steps:
 *
 *   1. Dates → the ids of units blocked for the stay (fail closed).
 *   2. District → its id, from the cached catalogue facets.
 *   3. ONE narrow query over the whole visible catalogue with every structural
 *      filter applied in the database: city, district, type, guests,
 *      min_nights, amenities (inner join on unit_amenities, each column = true)
 *      and not-blocked. Filtering here — not over a loaded page, which is what
 *      the app does with its 100 rows — is what makes the counts and the
 *      results exact across all ~260 units.
 *   4. Live prices from quote_units when the price filter or a price sort
 *      needs them; then sort with an id tiebreak, then page.
 *   5. Full card rows for that page's ids only.
 *
 * No precise location leaves this function: the candidate query selects no
 * coordinates at all, and the cards use CARD_SELECT (no address, no maps URL,
 * no lat/long).
 */
async function queryPublicUnits(
  locale: string = SOURCE_LOCALE,
  filters: StaysFilters = {},
  page = 1,
  pageSize = LISTING_PAGE_SIZE,
): Promise<StaysPage> {
  const supabase = createPublicClient();
  const resolved = await resolveCandidates(supabase, filters);
  if (!resolved) return EMPTY_PAGE;

  const { candidates, quotes, amenityCounts } = resolved;
  const total = candidates.length;
  const pageIds = candidates
    .slice((page - 1) * pageSize, page * pageSize)
    .map((c) => c.id);
  if (pageIds.length === 0) return { units: [], total, amenityCounts };

  // 5 ── Cards for this page only.
  let cardQuery = supabase.from('units').select(CARD_SELECT).in('id', pageIds);
  cardQuery = cardTrims(cardQuery, locale);
  const { data: cards, error: cardError } = await cardQuery;

  if (cardError) {
    console.error('[getPublicUnits] cards', {
      message: cardError.message,
      code: cardError.code,
      details: cardError.details,
      hint: cardError.hint,
    });
    return EMPTY_PAGE;
  }

  const order = new Map(pageIds.map((id, i) => [id, i]));
  const rows = ((cards ?? []) as RawRow[]).sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );

  const longStay = new Map(candidates.map((c) => [c.id, c.longStay ? c.minNights : null]));
  const units = (await mapCardRows(supabase, rows, locale, filters.checkIn, filters.checkOut, quotes))
    .map((u) => ({ ...u, long_stay_min: longStay.get(u.id) ?? null }));
  return { units, total, amenityCounts };
}

/** One /stays card plus what the client needs to filter and count it. */
export interface StayCard extends UnitCardData {
  /** The chip it falls under; null → shown under All only. */
  category: Category | null;
  /**
   * Where to pin it on the results map: the SAME blurred point the unit page
   * draws (approximateCoords, offset server-side and rounded) — never the real
   * address. Null when the unit has no coordinates.
   */
  geo: { lat: number; lng: number } | null;
  /** max_guests, for the map's mini card. */
  guests: number | null;
  /** The filterable amenities it has, for the filter sheet's live counts. */
  amenities: AmenityFilter[];
}

/**
 * EVERY unit matching the search, as lean cards, in the search's sort order —
 * for the /stays browser, which filters by category and pages ON THE CLIENT so
 * a chip tap is instant (no request, no skeleton).
 *
 * The category is deliberately NOT applied here: one load serves all chips.
 * Dates, guests, city, price and sort still are — availability must stay live.
 * The no-filter catalogue (the plain /stays index) is identical for everyone,
 * so it is cached and tagged 'units' like the rest of the inventory; every
 * other search is fresh.
 *
 * Card rows are fetched in parallel batches of 100 ids, keeping each request
 * URL well within limits for the whole ~340-unit catalogue.
 */
export async function getStaysCatalogue(locale: string, filters: StaysFilters): Promise<StayCard[]> {
  const { category: _category, ...rest } = filters; // eslint-disable-line @typescript-eslint/no-unused-vars
  const unfiltered = Object.values(rest).every((v) => v === undefined);
  if (unfiltered) {
    return unstable_cache(
      () => queryStaysCatalogue(locale, {}),
      ['stays-catalogue-v1', locale],
      { tags: ['units'], revalidate: 600 },
    )();
  }
  return queryStaysCatalogue(locale, rest);
}

async function queryStaysCatalogue(locale: string, filters: StaysFilters): Promise<StayCard[]> {
  const supabase = createPublicClient();
  const resolved = await resolveCandidates(supabase, filters);
  if (!resolved || resolved.candidates.length === 0) return [];
  return leanCards(supabase, resolved.candidates, locale, filters.checkIn, filters.checkOut, resolved.quotes);
}

/**
 * Lean cards for candidates, in the candidates' order. Card rows in parallel
 * batches of 100 ids; prices alongside them (not after), unless the caller
 * already holds them.
 */
async function leanCards(
  supabase: SupabaseClient,
  candidates: Candidate[],
  locale: string,
  checkIn?: string,
  checkOut?: string,
  quotes?: Map<string, UnitPricing>,
): Promise<StayCard[]> {
  const ids = candidates.map((c) => c.id);
  if (!ids.length) return [];
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));

  const [results, prices, index] = await Promise.all([
    Promise.all(
      batches.map((batch) => cardTrims(supabase.from('units').select(CARD_SELECT).in('id', batch), locale)),
    ),
    quotes ?? fetchQuotes(supabase, ids, checkIn, checkOut),
    getRankingIndex(),
  ]);
  const rows: RawRow[] = [];
  for (const r of results) {
    if (r.error) {
      console.error('[leanCards] cards', { message: r.error.message, code: r.error.code });
      return [];
    }
    rows.push(...((r.data ?? []) as RawRow[]));
  }

  const listings = await mapCardRows(supabase, rows, locale, checkIn, checkOut, prices, false);
  const byId = new Map(listings.map((u) => [u.id, u]));

  const cards: StayCard[] = [];
  for (const c of candidates) {
    const u = byId.get(c.id);
    if (!u) continue;
    const cover = u.media.find((m) => m.is_cover) ?? u.media[0];
    cards.push({
      id: u.id,
      slug: u.slug,
      ad_title: u.ad_title,
      unit_name: u.unit_name,
      city: u.city,
      region: u.region,
      municipality: u.municipality,
      pricing: u.pricing,
      rating: u.rating,
      allow_deposit: u.allow_deposit,
      allow_pay_at_arrival: u.allow_pay_at_arrival,
      media: cover ? [cover] : [],
      specifications: {
        bedrooms: u.specifications.bedrooms,
        beds: u.specifications.beds,
        bathrooms: u.specifications.bathrooms,
      },
      long_stay_min: c.longStay ? c.minNights : null,
      category: categoryOf(c.unit_type),
      geo: mapPoint(c.id, index.units[c.id]),
      guests: c.maxGuests,
      amenities: AMENITY_FILTERS.filter((a) => c.amenities[a]),
    });
  }
  return cards;
}

/** The public map point: the unit page's blurred offset, rounded to ~10 m. */
function mapPoint(id: string, facts: RankingFacts | undefined): StayCard['geo'] {
  if (!facts || facts.lat === null || facts.lng === null) return null;
  const p = approximateCoords(id, facts.lat, facts.lng);
  if (p.latitude === null || p.longitude === null) return null;
  return { lat: Math.round(p.latitude * 1e4) / 1e4, lng: Math.round(p.longitude * 1e4) / 1e4 };
}

// ── Similar places ───────────────────────────────────────────────────────────

export interface SimilarRequest {
  /** From the visitor's URL: the same hard filters as the search they came from. */
  checkIn?: string;
  checkOut?: string;
  guests?: number;
}

/** How far a similar unit's price may be from this one's. */
const SIMILAR_PRICE_BAND = 0.35;
const SIMILAR_CAPACITY_BAND = 2;

/**
 * "Similar places you may like" — the one function the unit page asks.
 *
 *   • same city (the search's hard filters: if the visitor came with dates,
 *     only units free for them; with guests, only units sleeping that many)
 *   • similar size: max_guests within ±2 of this unit (or ≥ the searched guests)
 *   • similar price: within ±35% of this unit's nightly price (the stay's
 *     average when dated)
 *   • same category first, then the same district, then the nearest
 *   • never this unit; at most one other unit of the same property, two of
 *     any other
 *
 * When the strict set is short, units that miss ONE of size/price fill in,
 * then the rest of the city — the hard filters never relax. Cached per unit
 * for 5 minutes without dates; live with dates (availability).
 */
export async function getSimilarUnits(
  unitId: string,
  locale: string,
  req: SimilarRequest = {},
  limit = 8,
): Promise<StayCard[]> {
  const dated = !!(req.checkIn && req.checkOut);
  try {
    if (!dated) {
      return await unstable_cache(
        () => querySimilarUnits(unitId, locale, { guests: req.guests }, limit),
        ['similar-units-v1', unitId, locale, String(req.guests ?? ''), String(limit)],
        { tags: ['units'], revalidate: 300 },
      )();
    }
    return await querySimilarUnits(unitId, locale, req, limit);
  } catch (err) {
    console.error('[getSimilarUnits]', { unitId, message: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

async function querySimilarUnits(unitId: string, locale: string, req: SimilarRequest, limit: number): Promise<StayCard[]> {
  const supabase = createPublicClient();
  // This unit's facts come from the cached index — no query of their own.
  const index = await getRankingIndex();
  const b = index.units[unitId];
  const city = b?.city;
  if (!b || !city) return [];

  // Prices for every unit of the city, fetched beside the search rather than
  // after it — the city's members are known from the index already.
  const cityIds = Object.keys(index.units).filter((id) => index.units[id].city === city);
  const [resolved, quotes] = await Promise.all([
    resolveCandidates(
      supabase,
      { city, guests: req.guests, checkIn: req.checkIn, checkOut: req.checkOut },
      { rank: false },
    ),
    fetchQuotes(supabase, cityIds, req.checkIn, req.checkOut),
  ]);
  if (!resolved) return [];
  const pool = resolved.candidates.filter((c) => c.id !== unitId);
  if (!pool.length) return [];

  const basePrice = comparablePrice(quotes.get(unitId));
  const baseGuests = b.maxGuests;
  const baseCategory = categoryOf(b.unitType);
  const baseDistrict = b.districtId;
  const herePoint = b.lat !== null && b.lng !== null ? { lat: b.lat, lng: b.lng } : null;

  const scored = pool.map((c) => {
    const capacityOk = req.guests
      ? true // already ≥ the searched guests (hard filter)
      : baseGuests !== null && c.maxGuests !== null && Math.abs(c.maxGuests - baseGuests) <= SIMILAR_CAPACITY_BAND;
    const p = comparablePrice(quotes.get(c.id));
    const priceOk = basePrice === null || (p !== null && Math.abs(p - basePrice) <= SIMILAR_PRICE_BAND * basePrice);
    const f = index.units[c.id];
    const km = herePoint && f && f.lat !== null && f.lng !== null ? distanceKm(herePoint, { lat: f.lat, lng: f.lng }) : null;
    return {
      c,
      tier: capacityOk && priceOk ? 0 : capacityOk || priceOk ? 1 : 2,
      sameCategory: baseCategory !== null && categoryOf(c.unit_type) === baseCategory,
      sameDistrict: baseDistrict !== null && c.districtId === baseDistrict,
      km,
    };
  });
  scored.sort((x, y) =>
    x.tier - y.tier ||
    Number(y.sameCategory) - Number(x.sameCategory) ||
    Number(y.sameDistrict) - Number(x.sameDistrict) ||
    (x.km ?? 1e9) - (y.km ?? 1e9) ||
    (x.c.id < y.c.id ? -1 : x.c.id > y.c.id ? 1 : 0),
  );

  const perProperty = new Map<string, number>();
  const picked: Candidate[] = [];
  for (const s of scored) {
    if (picked.length >= limit) break;
    const prop = s.c.propertyId ?? s.c.id;
    const cap = prop === b.propertyId ? 1 : 2;
    const n = perProperty.get(prop) ?? 0;
    if (n >= cap) continue;
    perProperty.set(prop, n + 1);
    picked.push(s.c);
  }
  return leanCards(supabase, picked.map((c) => ({ ...c, longStay: false })), locale, req.checkIn, req.checkOut, quotes);
}

/**
 * How many units a search matches, and the amenity counts inside it — the
 * filter sheet's live "Show 42 stays" while a guest is still adjusting.
 * Steps 1–4 of the listing without the cards, so the number on the button is
 * the number the page will show.
 */
export async function countPublicUnits(
  filters: StaysFilters,
): Promise<Pick<StaysPage, 'total' | 'amenityCounts'>> {
  // Counting only: no order needed, so the ranking is skipped.
  const resolved = await resolveCandidates(createPublicClient(), filters, { rank: false });
  if (!resolved) return { total: 0, amenityCounts: ZERO_AMENITY_COUNTS };
  return { total: resolved.candidates.length, amenityCounts: resolved.amenityCounts };
}

/**
 * The bare match list for a search — no cards, no order. For the empty-search
 * suggestions, which only need to know what WOULD match a looser search.
 */
export async function matchUnits(
  filters: StaysFilters,
): Promise<{ id: string; city: string | null; maxGuests: number | null }[] | null> {
  const resolved = await resolveCandidates(createPublicClient(), filters, { rank: false });
  return resolved ? resolved.candidates.map((c) => ({ id: c.id, city: c.city, maxGuests: c.maxGuests })) : null;
}

/**
 * Steps 1–4: every unit matching `filters`, sorted, with the amenity counts
 * and any quotes fetched on the way. Null when the search must fail closed or
 * errored (logged) — the caller shows nothing rather than something wrong.
 *
 * The availability lookup, the candidate query and the (cached) ranking index
 * run AT ONCE: blocked units and the district are filtered here in code rather
 * than in the candidate query, so neither waits on the other.
 */
async function resolveCandidates(
  supabase: SupabaseClient,
  filters: StaysFilters,
  { rank = true }: { rank?: boolean } = {},
): Promise<{
  candidates: Candidate[];
  quotes: Map<string, UnitPricing> | undefined;
  amenityCounts: Record<AmenityFilter, number>;
} | null> {
  const { city, district, area, guests, checkIn, checkOut, priceMin, priceMax } = filters;
  // The category chip is a set of unit types (see lib/stays/categories).
  const types = filters.category ? CATEGORY_TYPES[filters.category] : undefined;
  const amenities = filters.amenities ?? [];
  const sort: SortKey = filters.sort ?? DEFAULT_SORT;
  const wantsAvailability = !!checkIn && !!checkOut;
  const wantsRank = rank && sort === 'recommended';
  const needsIndex = wantsRank || !!(city && district);

  // 3 ── Candidates. Embeds are made INNER exactly when they filter the parent;
  // without !inner PostgREST nulls the embed and the filter silently does
  // nothing. unit_amenities is always selected (for the counts) but only inner
  // when an amenity is required.
  const select = [
    'id,created_at,unit_type,min_nights,property_id',
    'unit_info!inner(ad_title)',
    `properties!inner(archived_at,district_id,geo_cities:city_id${city ? '!inner' : ''}(name))`,
    `unit_amenities${amenities.length ? '!inner' : ''}(${AMENITY_FILTERS.join(',')})`,
    `unit_specifications${guests ? '!inner' : ''}(max_guests)`,
  ].join(',');

  let query = supabase
    .from('units')
    .select(select)
    .eq('status', 'available')
    .is('archived_at', null)
    .not('unit_info.ad_title', 'is', null)
    .is('properties.archived_at', null);

  // City comes from properties.geo_cities — the normalised lookup the search
  // dropdown and the unit card both read. unit_info.city is free text and
  // disagrees with it (casing, and at least one unit filed under the wrong city).
  if (city) query = query.ilike('properties.geo_cities.name', likeLiteral(city));
  if (types?.length) query = query.in('unit_type', [...types]);
  if (guests) query = query.gte('unit_specifications.max_guests', guests);
  for (const a of amenities) query = query.is(`unit_amenities.${a}`, true);
  if (wantsAvailability) {
    // A unit whose minimum stay is longer than the search cannot be booked for
    // it, so it is not a result (same as the app). A null min_nights is 1.
    query = query.or(`min_nights.is.null,min_nights.lte.${nightsBetween(checkIn, checkOut)}`);
  }

  // 1 + 3 (+ the index) together.
  const [blocked, { data, error }, index] = await Promise.all([
    wantsAvailability ? blockedUnitIds(supabase, checkIn, checkOut) : Promise.resolve([] as string[]),
    query,
    needsIndex ? getRankingIndex() : Promise.resolve(EMPTY_INDEX),
  ]);

  if (blocked === null) return null; // fail closed — see blockedUnitIds

  if (error) {
    console.error('[getPublicUnits] candidates', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      filters,
    });
    return null;
  }

  // 2 ── District (a hard filter) and area (soft — ranking only), by key.
  // Read from properties.district_id, never from unit_info.region (filled on
  // a handful of units — filtering on it would hide most of the district). An
  // unknown district, or one with no visible units, can only match nothing.
  const cityKey = city?.toLowerCase() ?? '';
  const districtId = city && district ? index.districtIdByKey[`${cityKey}/${district}`] ?? null : null;
  if (city && district && !districtId) {
    return { candidates: [], quotes: undefined, amenityCounts: { ...ZERO_AMENITY_COUNTS } };
  }
  const areaId = city && area ? index.districtIdByKey[`${cityKey}/${area}`] ?? null : null;

  const blockedSet = new Set(blocked);
  let candidates: Candidate[] = ((data ?? []) as RawRow[])
    .filter(hasAdTitle)
    .filter((row) => !blockedSet.has(row.id as string))
    .filter((row) => !districtId || row.properties?.district_id === districtId)
    .map((row) => {
      const am = one<RawRow>(row.unit_amenities);
      const mg = one<RawRow>(row.unit_specifications)?.max_guests;
      return {
        id: row.id as string,
        created_at: (row.created_at as string) ?? '',
        unit_type: String(row.unit_type ?? 'other'),
        title: String(one<RawRow>(row.unit_info)?.ad_title ?? '').trim(),
        amenities: Object.fromEntries(
          AMENITY_FILTERS.map((a) => [a, !!am?.[a]]),
        ) as Record<AmenityFilter, boolean>,
        maxGuests: typeof mg === 'number' ? mg : null,
        minNights: typeof row.min_nights === 'number' && row.min_nights > 0 ? row.min_nights : 1,
        propertyId: (row.property_id as string) ?? null,
        districtId: (row.properties?.district_id as string) ?? null,
        city: (row.properties?.geo_cities?.name as string) ?? null,
      };
    });

  // 4 ── Prices, only when something reads them. Every candidate is quoted in
  // one RPC (~260 units in ~0.4s), because a bound or an order over a single
  // page would be a bound over that page, not over the catalogue.
  const byPrice = sort === 'price_asc' || sort === 'price_desc';
  const hasPriceBound = priceMin !== undefined || priceMax !== undefined;
  let quotes: Map<string, UnitPricing> | undefined;
  const price = new Map<string, number | null>();

  if ((byPrice || hasPriceBound) && candidates.length > 0) {
    quotes = await fetchQuotes(supabase, candidates.map((c) => c.id), checkIn, checkOut);
    for (const c of candidates) price.set(c.id, comparablePrice(quotes.get(c.id)));

    if (hasPriceBound) {
      // A unit with no quote cannot be shown to be inside the range, so it is
      // not a result — never guessed in. (fetchQuotes returns an empty map on
      // error, which empties a price-bounded search: loud, not mispriced.)
      candidates = candidates.filter((c) => {
        const p = price.get(c.id);
        if (p === null || p === undefined) return false;
        if (priceMin !== undefined && p < priceMin) return false;
        if (priceMax !== undefined && p > priceMax) return false;
        return true;
      });
    }
  }

  const amenityCounts = { ...ZERO_AMENITY_COUNTS };
  for (const c of candidates) {
    for (const a of AMENITY_FILTERS) if (c.amenities[a]) amenityCounts[a] += 1;
  }

  if (wantsRank) {
    const area = areaId ? index.districts[areaId] : null;
    const request: RankRequest = {
      guests,
      nights: wantsAvailability ? nightsBetween(checkIn, checkOut) : null,
      areaDistrictId: areaId,
      areaName: area?.name ?? null,
      areaCenter: area?.center ?? null,
    };
    const byIdMap = new Map(candidates.map((c) => [c.id, c]));
    const ranked = rankUnits(
      candidates.map((c) => {
        const facts = index.units[c.id];
        return {
          id: c.id,
          propertyId: c.propertyId,
          maxGuests: c.maxGuests,
          minNights: c.minNights,
          districtId: c.districtId,
          lat: facts?.lat ?? null,
          lng: facts?.lng ?? null,
          quality: facts?.quality ?? NO_QUALITY,
        };
      }),
      request,
    );
    candidates = ranked.map((r) => ({
      ...byIdMap.get(r.id)!,
      score: r.score,
      longStay: r.longStay,
      reasons: r.reasons,
    }));
    return { candidates, quotes, amenityCounts };
  }

  // Price / newest. Tiebreak on id: ~260 units share ~110 prices; without the
  // tiebreak equal-priced units reshuffle between requests and a guest paging
  // through sees some twice and others never. Missing prices sort last in both
  // directions (nullsFirst: false).
  const byId = (a: Candidate, b: Candidate) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const compare = (a: Candidate, b: Candidate): number => {
    switch (sort) {
      case 'price_asc':
      case 'price_desc': {
        const pa = price.get(a.id) ?? null;
        const pb = price.get(b.id) ?? null;
        if (pa === null || pb === null) {
          if (pa !== pb) return pa === null ? 1 : -1;
          break;
        }
        if (pa !== pb) return sort === 'price_asc' ? pa - pb : pb - pa;
        break;
      }
      case 'newest':
        if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
        break;
      default:
        break;
    }
    return byId(a, b);
  };
  candidates.sort(compare);

  return { candidates, quotes, amenityCounts };
}

// ── Ranking index ────────────────────────────────────────────────────────────

/** Per-unit facts the ranking reads that a search query does not carry. */
export interface RankingFacts {
  /** Exact coordinates — SERVER ONLY (distances); never sent to a browser. */
  lat: number | null;
  lng: number | null;
  quality: QualitySignals;
  /** What "similar places" compares against, without a query of its own. */
  city: string | null;
  unitType: string;
  propertyId: string | null;
  districtId: string | null;
  maxGuests: number | null;
}

export interface IndexDistrict {
  id: string;
  key: string;
  /** geo_cities.name, lowercased. */
  city: string;
  name: string;
  /** Mean of its units' coordinates. */
  center: { lat: number; lng: number } | null;
  count: number;
}

export interface IndexCity {
  /** geo_cities.name — the canonical value ?city= carries. */
  name: string;
  count: number;
  center: { lat: number; lng: number } | null;
}

export interface RankingIndex {
  units: Record<string, RankingFacts>;
  districts: Record<string, IndexDistrict>;
  /** `${city}/${key}` → district id (lowercased city, name_en key). */
  districtIdByKey: Record<string, string>;
  /** Cities that hold visible units, keyed by lowercased name. */
  cities: Record<string, IndexCity>;
}

const NO_QUALITY: QualitySignals = {
  photos: 0, hasDescription: false, amenities: 0, hasRules: false, hasPrice: false, realCover: false,
};

const EMPTY_INDEX: RankingIndex = { units: {}, districts: {}, districtIdByKey: {}, cities: {} };

const ALL_AMENITY_COLUMNS = Object.keys(EMPTY_AMENITIES);

/** The ?district= / ?area= key: name_en lowercased (ASCII, so URLs stay clean). */
export function districtKey(d: { id: string; name?: string | null; name_en?: string | null }): string {
  return String(d.name_en || d.name || d.id).trim().toLowerCase();
}

/**
 * What the ranking and the place search need to know about the visible
 * catalogue: listing quality, where each unit is, and the centre of every
 * city and district that holds units. Identical for every visitor, so it is
 * cached and tagged 'units' like the rest of the inventory (an edit drops
 * it). Exact coordinates live only in this server-side cache.
 *
 * Never throws: a failure gives the empty index, and ranking then falls back
 * to guests and nights fit alone rather than failing the search.
 */
export async function getRankingIndex(): Promise<RankingIndex> {
  try {
    return await unstable_cache(queryRankingIndex, ['stays-ranking-index-v3'], { tags: ['units'], revalidate: 600 })();
  } catch (err) {
    console.error('[getRankingIndex]', { message: err instanceof Error ? err.message : String(err) });
    return EMPTY_INDEX;
  }
}

async function queryRankingIndex(): Promise<RankingIndex> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('units')
    .select(
      'id,unit_type,property_id,unit_specifications(max_guests),' +
        'unit_info!inner(ad_title,latitude,longitude),unit_media(count),unit_rules(id),' +
        // Descriptions are counted, not fetched: only whether one exists matters.
        'unit_translations(count),' +
        `unit_amenities(${ALL_AMENITY_COLUMNS.join(',')}),` +
        'properties!inner(archived_at,geo_cities:city_id(name),geo_districts:district_id(id,name,name_en))',
    )
    .eq('status', 'available')
    .is('archived_at', null)
    .not('unit_info.ad_title', 'is', null)
    .is('properties.archived_at', null)
    .not('unit_translations.ad_description', 'is', null);

  // Thrown, not returned: unstable_cache must not keep a failure for 10 minutes.
  if (error) throw new Error(`ranking index: ${error.message}`);

  const rows = ((data ?? []) as RawRow[]).filter(hasAdTitle);
  const quotes = await fetchQuotes(supabase, rows.map((r) => r.id as string));

  const index: RankingIndex = { units: {}, districts: {}, districtIdByKey: {}, cities: {} };
  // Centres are MEDIANS, not means: one unit with a wrong pin (a Sapanca
  // listing is pinned in Rize, ~900 km off) would drag a mean far enough to
  // break every distance measured from it. A median ignores it.
  const points = new Map<string, { lats: number[]; lngs: number[] }>();
  const addTo = (key: string, lat: number, lng: number) => {
    const p = points.get(key) ?? { lats: [], lngs: [] };
    p.lats.push(lat); p.lngs.push(lng);
    points.set(key, p);
  };
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  for (const r of rows) {
    const info = one<RawRow>(r.unit_info);
    const lat = typeof info?.latitude === 'number' ? info.latitude : null;
    const lng = typeof info?.longitude === 'number' ? info.longitude : null;
    const am = one<RawRow>(r.unit_amenities);
    const photos = Number(one<RawRow>(r.unit_media)?.count ?? 0);
    const quote = quotes.get(r.id as string);

    const spec = one<RawRow>(r.unit_specifications);
    index.units[r.id as string] = {
      lat,
      lng,
      city: r.properties?.geo_cities?.name ?? null,
      unitType: String(r.unit_type ?? 'other'),
      propertyId: (r.property_id as string) ?? null,
      districtId: r.properties?.geo_districts?.id ?? null,
      maxGuests: typeof spec?.max_guests === 'number' ? spec.max_guests : null,
      quality: {
        photos,
        hasDescription: Number(one<RawRow>(r.unit_translations)?.count ?? 0) > 0,
        amenities: am ? ALL_AMENITY_COLUMNS.filter((c) => am[c] === true).length : 0,
        hasRules: !!one<RawRow>(r.unit_rules),
        hasPrice: !!quote && quote.nightly_usd !== null,
        realCover: photos > 0,
      },
    };

    const cityName: string | null = r.properties?.geo_cities?.name ?? null;
    if (cityName) {
      const ck = cityName.toLowerCase();
      const c = (index.cities[ck] ??= { name: cityName, count: 0, center: null });
      c.count += 1;
      if (lat !== null && lng !== null) addTo(`c:${ck}`, lat, lng);

      const d = r.properties?.geo_districts;
      if (d?.id) {
        const entry = (index.districts[d.id] ??= {
          id: d.id, key: districtKey(d), city: ck, name: d.name_en || d.name || '', center: null, count: 0,
        });
        entry.count += 1;
        index.districtIdByKey[`${ck}/${entry.key}`] = d.id;
        if (lat !== null && lng !== null) addTo(`d:${d.id}`, lat, lng);
      }
    }
  }

  for (const [key, p] of points) {
    const center = { lat: median(p.lats), lng: median(p.lngs) };
    if (key.startsWith('c:')) index.cities[key.slice(2)].center = center;
    else index.districts[key.slice(2)].center = center;
  }
  return index;
}

// ── Catalogue facets ─────────────────────────────────────────────────────────

/** A district that holds at least one visible unit. */
export interface FacetDistrict {
  id: string;
  /** name_en lowercased — the ?district= value. ASCII, so the URL stays clean. */
  key: string;
  name: string | null;
  name_ar: string | null;
  name_en: string | null;
  name_tr: string | null;
  count: number;
}

export interface CatalogueFacets {
  /** Visible units per unit_type. Drives which type chips render at all. */
  typeCounts: Record<StayType, number>;
  /**
   * Districts that actually contain visible units, keyed by lowercased
   * geo_cities.name. A city with no key has no districts to offer — only
   * Istanbul today — and draws nothing.
   */
  districtsByCity: Record<string, FacetDistrict[]>;
}

/**
 * What the visible catalogue holds, for the filter UI.
 *
 * A type chip or a district chip is a promise that something is behind it, so
 * both come from the live catalogue rather than a list: HOTELS and FARMS once
 * sat on the homepage pointing at nothing. Uses the EXACT visibility filter
 * the listing applies, including the ad_title trim, so a chip that renders
 * always leads to results.
 *
 * Cached and tagged 'units', so /api/revalidate drops it whenever a unit
 * changes — the same freshness path the listing itself uses.
 */
export function getCatalogueFacets(): Promise<CatalogueFacets> {
  return unstable_cache(
    queryCatalogueFacets,
    ['stays-catalogue-facets'],
    { tags: ['units'], revalidate: 600 },
  )();
}

async function queryCatalogueFacets(): Promise<CatalogueFacets> {
  const typeCounts = Object.fromEntries(STAY_TYPES.map((t) => [t, 0])) as Record<StayType, number>;
  const districtsByCity: Record<string, FacetDistrict[]> = {};

  const supabase = createPublicClient();

  // The whole catalogue is a couple of hundred rows at this width, so one
  // query counted in memory beats a round trip per chip.
  const { data, error } = await supabase
    .from('units')
    .select(
      'unit_type,unit_info!inner(ad_title),' +
        'properties!inner(archived_at,geo_cities:city_id(name),' +
        'geo_districts:district_id(id,name,name_ar,name_en,name_tr,sort_order))',
    )
    .eq('status', 'available')
    .is('archived_at', null)
    .not('unit_info.ad_title', 'is', null)
    .is('properties.archived_at', null);

  if (error) {
    // Fail OPEN on types (the chip row simply hides) and closed on districts
    // (none offered) — neither can advertise a unit that isn't there.
    console.error('[getCatalogueFacets]', { message: error.message, code: error.code });
    return { typeCounts, districtsByCity };
  }

  const districts = new Map<string, FacetDistrict & { city: string; sort: number }>();
  for (const row of (data ?? []) as RawRow[]) {
    if (!hasAdTitle(row)) continue;

    const type = String(row.unit_type ?? 'other') as StayType;
    if (type in typeCounts) typeCounts[type] += 1;

    const cityName: string | undefined = row.properties?.geo_cities?.name;
    const d = row.properties?.geo_districts;
    if (!cityName || !d?.id) continue;

    const existing = districts.get(d.id);
    if (existing) {
      existing.count += 1;
      continue;
    }
    districts.set(d.id, {
      id: d.id,
      key: String(d.name_en || d.name || d.id).trim().toLowerCase(),
      name: d.name ?? null,
      name_ar: d.name_ar ?? null,
      name_en: d.name_en ?? null,
      name_tr: d.name_tr ?? null,
      count: 1,
      city: cityName.toLowerCase(),
      sort: typeof d.sort_order === 'number' ? d.sort_order : 0,
    });
  }

  for (const d of [...districts.values()].sort((a, b) => a.sort - b.sort)) {
    const { city, sort: _sort, ...district } = d; // eslint-disable-line @typescript-eslint/no-unused-vars
    (districtsByCity[city] ??= []).push(district);
  }

  return { typeCounts, districtsByCity };
}

/**
 * A single publicly visible unit for /stays/[slug]. Applies the same strict
 * visibility filter, so direct links to non-public units resolve to null (404).
 * Returns null when not found or on error (logged).
 *
 * Accepts a slug OR a bare unit id: every offer link the sales team has already
 * sent over WhatsApp points at /stays/{uuid}, and those messages can't be
 * recalled. Slugs are never UUID-shaped, so which column to match is unambiguous.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Unit detail. Cached and tagged 'units' — /api/revalidate drops it when the
 * unit's price, photos, availability or content change. The window (300s) is a
 * fallback for a missed webhook; the tag is the real freshness mechanism.
 *
 * A CACHED "NOT FOUND" IS NEVER TRUSTED.
 *   unstable_cache stores whatever the query returns — null included — and
 *   serves it stale-while-revalidate: even after the window, the first request
 *   gets the old answer while the refresh runs behind it. So a lookup made
 *   while a unit was still being created (an early visit, or the share-card
 *   warm-up the revalidate webhook fires, which renders every locale and falls
 *   back to English) stored null for that slug, and a freshly published unit
 *   kept answering 404 until a refresh happened to land. That is the bug of
 *   2026-10-06: fourteen new units, published and readable, 404ing on the site.
 *
 *   So a cached hit is used as-is, and a cached miss is checked again against
 *   the database before anyone is shown a 404. Units that exist stay one cache
 *   read; only genuinely absent slugs pay a query — and those were about to
 *   render a 404 page anyway. A query ERROR also returns null, so this is what
 *   stops one failed read from turning a live unit into a cached 404 too.
 */
export async function getPublicUnitBySlug(
  slugOrId: string,
  locale: string = SOURCE_LOCALE,
): Promise<UnitListing | null> {
  const cached = await unstable_cache(
    () => queryPublicUnitBySlug(slugOrId, locale),
    ['unit-by-slug', slugOrId, locale],
    { tags: ['units'], revalidate: 300 },
  )();
  if (cached) return cached;
  return queryPublicUnitBySlug(slugOrId, locale);
}

async function queryPublicUnitBySlug(
  slugOrId: string,
  locale: string = SOURCE_LOCALE,
): Promise<UnitListing | null> {
  const column = UUID_RE.test(slugOrId) ? 'id' : 'slug';

  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from('units')
    .select(LISTING_SELECT)
    .eq(column, slugOrId)
    .eq('status', 'available')
    .is('archived_at', null)
    .not('unit_info.ad_title', 'is', null)
    .is('properties.archived_at', null)
    .maybeSingle();

  if (error) {
    console.error('[getPublicUnitBySlug]', {
      slugOrId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }

  const row = data as RawRow | null;
  if (!row || !hasAdTitle(row)) return null;

  // No dates here: the detail page re-quotes live once the guest picks them
  // (see quoteStay). This call yields the representative nightly rate only.
  const [policies, quotes, countryNames] = await Promise.all([
    fetchPolicies(supabase, [row.cancellation_policy_id], locale),
    fetchQuotes(supabase, [row.id as string]),
    countryNamesByIso(),
  ]);

  return mapRow(
    row,
    policies.get(row.cancellation_policy_id) ?? null,
    locale,
    quotes.get(row.id as string) ?? EMPTY_PRICING,
    countryNames,
  );
}
