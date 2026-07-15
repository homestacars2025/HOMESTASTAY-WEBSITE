import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { approximateCoords } from '@/lib/geo/approximate';
import type {
  UnitListing,
  UnitMediaItem,
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
  'id,slug,unit_type,unit_name,status,unit_style,business_model,min_nights,base_nightly_price,currency,cancellation_policy_id',
  // full_address and google_maps_url are deliberately not selected: both pin the
  // exact property, and anything selected here reaches the browser in the RSC
  // payload. Public surfaces get the blurred point from approximateCoords only.
  'unit_info!inner(ad_title,ad_description,city,region,municipality,latitude,longitude)',
  'unit_specifications(bedrooms,beds,bathrooms,max_guests,size_sqm,floor,balconies,kitchens,distance_to_mall,distance_to_transport)',
  'unit_amenities(tv,wifi,air_conditioning,heating,kitchen,dishwasher,washing_machine,hot_water,hair_dryer,iron,extra_bed,parking,elevator,pool,gym,self_check_in)',
  'unit_rules(allow_parties,allow_pets,allow_smoking,quiet_hours_enabled,quiet_hours_from,quiet_hours_to,allow_unregistered_guests,family_friendly,id_required,additional_rules)',
  'unit_media(id,unit_id,media_type,file_path,public_url,is_cover,sort_order)',
  'properties!inner(name,property_type,cover_photo_url,geo_cities:city_id(name),geo_districts:district_id(name))',
  // Locale-aware marketing copy. All non-Turkish rows are AI translations of the
  // Turkish source. Resolved per visitor locale in mapRow (see resolveTranslation).
  'unit_translations(language_code,ad_title,ad_description)',
].join(',');

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
function mapRow(row: RawRow, policy: UnitCancellationPolicy | null, locale: string): UnitListing {
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
  const geoCity: string | null = props?.geo_cities?.name ?? null;
  const geoDistrict: string | null = props?.geo_districts?.name ?? null;

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
    base_nightly_price:
      typeof row.base_nightly_price === 'number' ? row.base_nightly_price : null,
    currency: 'USD',

    ad_title: content.ad_title,
    ad_description: content.ad_description,
    country: null, // not modelled on unit_info in the live Stay schema
    city: geoCity ?? info?.city ?? null,
    region: geoDistrict ?? info?.region ?? null,
    municipality: info?.municipality ?? null,
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
  supabase: Awaited<ReturnType<typeof createClient>>,
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
  supabase: Awaited<ReturnType<typeof createClient>>,
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
export async function getPublicUnits(
  locale: string = SOURCE_LOCALE,
  filters: StaysFilters = {},
): Promise<UnitListing[]> {
  const supabase = await createClient();

  const { city, guests, checkIn, checkOut } = filters;
  const wantsAvailability = !!checkIn && !!checkOut;

  let blocked: string[] = [];
  if (wantsAvailability) {
    const ids = await blockedUnitIds(supabase, checkIn, checkOut);
    if (ids === null) return []; // fail closed — see blockedUnitIds
    blocked = ids;
  }

  // Filters on an embedded table only drop the parent row when that embed is an
  // inner join; without !inner PostgREST nulls the embed and returns every unit,
  // which reads as a filter that silently does nothing. Verified against the live
  // API: city=istanbul returns 41 rows with !inner, all 141 without.
  // Applied only when the filter is active, so units missing a specifications row
  // still appear in an unfiltered listing.
  let select = LISTING_SELECT;
  if (guests) select = select.replace('unit_specifications(', 'unit_specifications!inner(');
  if (city) select = select.replace('geo_cities:city_id(', 'geo_cities:city_id!inner(');

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
  if (city) query = query.ilike('properties.geo_cities.name', city);
  if (guests) query = query.gte('unit_specifications.max_guests', guests);
  if (blocked.length > 0) query = query.not('id', 'in', `(${blocked.join(',')})`);

  const { data, error } = await query
    .order('property_id', { ascending: true })
    .order('unit_name', { ascending: true });

  if (error) {
    console.error('[getPublicUnits]', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      filters,
    });
    return [];
  }

  const rows = ((data ?? []) as RawRow[]).filter(hasAdTitle);
  const policies = await fetchPolicies(
    supabase,
    rows.map((r) => r.cancellation_policy_id),
    locale,
  );

  return rows.map((r) => mapRow(r, policies.get(r.cancellation_policy_id) ?? null, locale));
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

export async function getPublicUnitBySlug(
  slugOrId: string,
  locale: string = SOURCE_LOCALE,
): Promise<UnitListing | null> {
  const column = UUID_RE.test(slugOrId) ? 'id' : 'slug';

  const supabase = await createClient();

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

  const policies = await fetchPolicies(supabase, [row.cancellation_policy_id], locale);
  return mapRow(row, policies.get(row.cancellation_policy_id) ?? null, locale);
}

/**
 * A random selection of publicly visible units for homepage rails, resolved for
 * `locale`. Reuses the same strict visibility filter as the index (so nothing
 * pending/archived leaks) and the same locale-aware mapping. Shuffled with
 * Fisher-Yates at request time; call twice for two independent rails, or pass a
 * larger limit and slice disjoint halves.
 */
export async function getRandomFeaturedUnits(
  locale: string = SOURCE_LOCALE,
  limit: number = 6,
): Promise<UnitListing[]> {
  const units = await getPublicUnits(locale);

  // Fisher-Yates shuffle (a fresh copy — never mutate the source array).
  const shuffled = [...units];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, limit);
}
