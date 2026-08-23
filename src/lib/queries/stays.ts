import 'server-only';
import { createPublicClient } from '@/lib/supabase/public';
import { unstable_cache } from 'next/cache';
import { pickLocalizedName } from '@/lib/geo/localize';
import { countryNamesByIso, localizedCountryName } from '@/lib/geo/countries';
import type { SupabaseClient } from '@supabase/supabase-js';
import { approximateCoords } from '@/lib/geo/approximate';
import {
  STAY_CATEGORIES, categoryTypes, type StayCategoryKey,
} from '@/lib/stays/categories';
import type {
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

/** Search filters for the /stays index. Every field is optional. */
export interface StaysFilters {
  /** Category chip — resolves to a set of unit_type values. See lib/stays/categories. */
  category?: StayCategoryKey;
  /** geo_cities.name, case-insensitive (e.g. "istanbul"). */
  city?: string;
  /** Minimum sleeping capacity — matches units with max_guests >= this. */
  guests?: number;
  /** ISO YYYY-MM-DD. Both dates are required for the availability filter to apply. */
  checkIn?: string;
  checkOut?: string;
}

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
): Promise<UnitListing[]> {
  const rows = data.filter(hasAdTitle);
  const [policies, quotes, countryNames] = await Promise.all([
    fetchPolicies(supabase, rows.map((r) => r.cancellation_policy_id), locale),
    fetchQuotes(supabase, rows.map((r) => r.id as string), checkIn, checkOut),
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

/**
 * Public listing.
 *
 * The UNFILTERED first page is cached and tagged 'units' — it is identical for
 * every visitor and is the transcontinental query we most want to skip. Any
 * filter (city / guests / DATES) goes straight to the DB: availability MUST be
 * live, or a guest could be shown a unit that is already booked. So only the
 * plain /stays index is cached; every search is fresh.
 */
export async function getPublicUnits(
  locale: string = SOURCE_LOCALE,
  filters: StaysFilters = {},
  page = 1,
  pageSize = LISTING_PAGE_SIZE,
): Promise<{ units: UnitListing[]; total: number }> {
  const unfiltered =
    !filters.category && !filters.city && !filters.guests &&
    !filters.checkIn && !filters.checkOut;

  if (unfiltered && page === 1 && pageSize === LISTING_PAGE_SIZE) {
    return unstable_cache(
      () => queryPublicUnits(locale, {}, 1, LISTING_PAGE_SIZE),
      ['stays-unfiltered', locale],
      { tags: ['units'], revalidate: 600 },
    )();
  }
  return queryPublicUnits(locale, filters, page, pageSize);
}

async function queryPublicUnits(
  locale: string = SOURCE_LOCALE,
  filters: StaysFilters = {},
  page = 1,
  pageSize = LISTING_PAGE_SIZE,
): Promise<{ units: UnitListing[]; total: number }> {
  const supabase = createPublicClient();

  const { category, city, guests, checkIn, checkOut } = filters;
  const wantsAvailability = !!checkIn && !!checkOut;

  let blocked: string[] = [];
  if (wantsAvailability) {
    const ids = await blockedUnitIds(supabase, checkIn, checkOut);
    if (ids === null) return { units: [], total: 0 }; // fail closed — see blockedUnitIds
    blocked = ids;
  }

  // Both filters work by making an embed INNER so it filters the parent —
  // without !inner PostgREST nulls the embed and the filter silently does
  // nothing (the note that was here before this).
  //
  // unit_specifications is FLIPPED, not appended: CARD_SELECT now carries it
  // for the card's specs line, and naming the same table twice in one select
  // is ambiguous. Flipping also keeps the old behaviour exactly — a unit with
  // no specs row is excluded when filtering by guests, kept otherwise.
  let select = CARD_SELECT;
  if (guests) select = select.replace('unit_specifications(', 'unit_specifications!inner(');
  if (city) select = select.replace('geo_cities:city_id(', 'geo_cities:city_id!inner(');

  let query = supabase
    .from('units')
    .select(select, { count: 'exact' }) // count drives pagination (1ب)
    .eq('status', 'available')
    .is('archived_at', null)
    .not('unit_info.ad_title', 'is', null)
    .is('properties.archived_at', null);

  query = cardTrims(query, locale);

  // City comes from properties.geo_cities — the normalised lookup the search
  // dropdown and the unit card both read. unit_info.city is free text and
  // disagrees with it (casing, and at least one unit filed under the wrong city).
  if (city) query = query.ilike('properties.geo_cities.name', city);
  if (guests) query = query.gte('unit_specifications.max_guests', guests);
  // Category is one more AND on the same query — it composes with city, dates
  // and guests rather than replacing them, and the `count` above stays exact so
  // pagination reflects the filtered set.
  if (category) {
    const types = categoryTypes(category);
    if (types.length > 0) query = query.in('unit_type', [...types]);
  }
  if (blocked.length > 0) query = query.not('id', 'in', `(${blocked.join(',')})`);

  const { data, error, count } = await query
    .order('property_id', { ascending: true })
    .order('unit_name', { ascending: true })
    // LIMIT so the listing stops fetching the whole catalogue. The pagination
    // UI (page param, prev/next) is 1ب; this cap already delivers the payload win.
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) {
    console.error('[getPublicUnits]', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      filters,
    });
    return { units: [], total: 0 };
  }

  const units = await mapCardRows(supabase, (data ?? []) as RawRow[], locale, checkIn, checkOut);
  return { units, total: count ?? units.length };
}

/**
 * How many publicly visible units each category holds.
 *
 * Drives which chips render at all: a category with zero units is a dead
 * filter, and offering one is how HOTELS and FARMS came to sit on the homepage
 * pointing at nothing. Because this counts the live catalogue rather than a
 * hardcoded list, the chip row stays correct on its own as inventory changes —
 * the first villa added brings the Villas chip back without a deploy.
 *
 * Deliberately reuses the EXACT visibility filter the listing applies,
 * including the ad_title trim. A chip that renders must lead to results, so a
 * looser count here would put back the same bug in a subtler form.
 *
 * Cached and tagged 'units', so /api/revalidate drops it whenever a unit
 * changes — the same freshness path the listing itself uses.
 */
export function getCategoryCounts(): Promise<Record<StayCategoryKey, number>> {
  return unstable_cache(
    queryCategoryCounts,
    ['stays-category-counts'],
    { tags: ['units'], revalidate: 600 },
  )();
}

async function queryCategoryCounts(): Promise<Record<StayCategoryKey, number>> {
  const empty = Object.fromEntries(
    STAY_CATEGORIES.map((c) => [c.key, 0]),
  ) as Record<StayCategoryKey, number>;

  const supabase = createPublicClient();

  // One column plus the two join predicates. The whole catalogue is a couple of
  // hundred rows at this width, so counting in memory beats one round trip per
  // category — and keeps the ad_title trim identical to hasAdTitle().
  const { data, error } = await supabase
    .from('units')
    .select('unit_type,unit_info!inner(ad_title),properties!inner(archived_at)')
    .eq('status', 'available')
    .is('archived_at', null)
    .not('unit_info.ad_title', 'is', null)
    .is('properties.archived_at', null);

  if (error) {
    // Fail OPEN: every count zero would hide every chip. Losing the filter row
    // is a smaller failure than a homepage that looks broken.
    console.error('[getCategoryCounts]', { message: error.message, code: error.code });
    return empty;
  }

  const byType = new Map<string, number>();
  for (const row of (data ?? []) as RawRow[]) {
    if (!hasAdTitle(row)) continue;
    const type = String(row.unit_type ?? 'other');
    byType.set(type, (byType.get(type) ?? 0) + 1);
  }

  const counts = { ...empty };
  for (const { key, types } of STAY_CATEGORIES) {
    counts[key as StayCategoryKey] = types.reduce(
      (sum, type) => sum + (byType.get(type) ?? 0),
      0,
    );
  }
  return counts;
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
 */
export async function getPublicUnitBySlug(
  slugOrId: string,
  locale: string = SOURCE_LOCALE,
): Promise<UnitListing | null> {
  return unstable_cache(
    () => queryPublicUnitBySlug(slugOrId, locale),
    ['unit-by-slug', slugOrId, locale],
    { tags: ['units'], revalidate: 300 },
  )();
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

/**
 * A random selection of publicly visible units for homepage rails, resolved for
 * `locale`. Reuses the same strict visibility filter as the index (so nothing
 * pending/archived leaks) and the same locale-aware mapping. Shuffled with
 * Fisher-Yates at request time; call twice for two independent rails, or pass a
 * larger limit and slice disjoint halves.
 */
/** All publicly-visible units as trimmed cards — no limit, no dates. The
 *  homepage's random pool. Cached (see getRandomFeaturedUnits): the whole set
 *  is small once trimmed, and caching it means the intercontinental fetch
 *  happens once per window, not per visitor. */
async function queryAllAvailableCards(locale: string): Promise<UnitListing[]> {
  const supabase = createPublicClient();
  let query = supabase
    .from('units')
    .select(CARD_SELECT)
    .eq('status', 'available')
    .is('archived_at', null)
    .not('unit_info.ad_title', 'is', null)
    .is('properties.archived_at', null);

  query = cardTrims(query, locale);

  const { data, error } = await query
    .order('property_id', { ascending: true })
    .order('unit_name', { ascending: true });

  if (error) {
    console.error('[queryAllAvailableCards]', { message: error.message, code: error.code });
    return [];
  }
  return mapCardRows(supabase, (data ?? []) as RawRow[], locale);
}

/** The pool, cached and tagged so /api/revalidate can drop it on any unit edit. */
function getPoolCached(locale: string): Promise<UnitListing[]> {
  return unstable_cache(
    () => queryAllAvailableCards(locale),
    ['stays-pool', locale],
    { tags: ['units'], revalidate: 600 },
  )();
}

/**
 * Random featured units for the homepage rails. Shuffles a CACHED pool, so the
 * transcontinental fetch is amortised across a whole revalidation window while
 * each visitor still gets a fresh random order (the shuffle is per-request,
 * over cached data — no query cost).
 */
export async function getRandomFeaturedUnits(
  locale: string = SOURCE_LOCALE,
  limit: number = 12,
): Promise<UnitListing[]> {
  const pool = [...(await getPoolCached(locale))];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, limit);
}
