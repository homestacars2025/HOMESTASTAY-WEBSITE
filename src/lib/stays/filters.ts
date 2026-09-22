import type { UnitTypeEnum } from '@/lib/types/unit';

/**
 * The /stays filter vocabulary — mirrors the mobile app's search filters.
 *
 * Client-safe on purpose: the filter sheet, the sort menu, the URL parser and
 * the server query all import from here, so a column name, a price bound or a
 * sort key can only ever be spelled one way.
 */

// ── Unit types ───────────────────────────────────────────────────────────────

/**
 * Every unit_type the enum holds, in chip order.
 *
 * Raw types, not folded categories: a guest filtering for studios gets studios.
 * The chip row still hides any type with zero visible units (farm and bed
 * today), so listing one here costs nothing until the first one is added —
 * then its chip appears without a deploy.
 */
export const STAY_TYPES = [
  'apartment', 'villa', 'studio', 'suite', 'room', 'cabin', 'farm', 'bed', 'other',
] as const satisfies readonly UnitTypeEnum[];

export type StayType = (typeof STAY_TYPES)[number];

export function isStayType(value: string): value is StayType {
  return (STAY_TYPES as readonly string[]).includes(value);
}

/**
 * The folded category keys the chips used to write (?type=apartments).
 *
 * Shared links and indexed URLs still carry them, so they are read back as the
 * types they meant rather than dropped — the page a link promised still opens.
 */
export const LEGACY_CATEGORY_TYPES: Record<string, readonly StayType[]> = {
  apartments: ['apartment', 'studio'],
  villas: ['villa'],
  cabins: ['cabin'],
  rooms: ['room', 'suite'],
};

// ── Amenities ────────────────────────────────────────────────────────────────

/**
 * The seven filterable amenities — the exact unit_amenities column names
 * (washing_machine, self_check_in — not washer/self_checkin). Order is the
 * app's. Icons are built by scripts/build-amenity-icons.mjs, named by column.
 */
export const AMENITY_FILTERS = [
  'parking', 'pool', 'elevator', 'self_check_in', 'washing_machine', 'gym', 'extra_bed',
] as const;

export type AmenityFilter = (typeof AMENITY_FILTERS)[number];

export function isAmenityFilter(value: string): value is AmenityFilter {
  return (AMENITY_FILTERS as readonly string[]).includes(value);
}

export function amenityIconSrc(amenity: AmenityFilter): string {
  return `/icons/amenities/${amenity}.webp`;
}

// ── Price ────────────────────────────────────────────────────────────────────

/**
 * Nightly price bounds in USD. Resting on either end means "no limit on this
 * side": 40 applies no minimum, 1000 applies no maximum — so a 1,200 USD villa
 * is still found by a slider left at its top.
 */
export const PRICE_MIN = 40;
export const PRICE_MAX = 1000;
export const PRICE_STEP = 10;

// ── Sort ─────────────────────────────────────────────────────────────────────

export const SORT_KEYS = ['recommended', 'price_asc', 'price_desc', 'newest'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const DEFAULT_SORT: SortKey = 'recommended';

export function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

// ── Guests ───────────────────────────────────────────────────────────────────

/** Same range as the app's stepper. */
export const MIN_GUESTS = 1;
export const MAX_GUESTS = 16;

// ── The filter set ───────────────────────────────────────────────────────────

/** Search filters for the /stays index. Every field is optional. */
export interface StaysFilters {
  /** unit_type values, OR-ed together. */
  types?: StayType[];
  /** geo_cities.name, case-insensitive (e.g. "istanbul"). */
  city?: string;
  /**
   * geo_districts.name_en, lowercased (e.g. "sisli") — ASCII so the URL stays
   * readable. Only meaningful with a city; resolved to properties.district_id
   * server-side. Never filtered through unit_info.region, which is filled on a
   * handful of units only.
   */
  district?: string;
  /** Minimum sleeping capacity — matches units with max_guests >= this. */
  guests?: number;
  /** ISO YYYY-MM-DD. Both dates are required for the availability filter to apply. */
  checkIn?: string;
  checkOut?: string;
  /** Nightly USD. Absent = no bound on that side (see PRICE_MIN / PRICE_MAX). */
  priceMin?: number;
  priceMax?: number;
  /** Every one must be true on the unit (AND). */
  amenities?: AmenityFilter[];
  /** Absent = recommended. */
  sort?: SortKey;
}

/** How many refinements the filter sheet holds — the badge on its button. */
export function countSheetFilters(filters: StaysFilters): number {
  return (
    (filters.priceMin !== undefined || filters.priceMax !== undefined ? 1 : 0) +
    (filters.amenities?.length ?? 0) +
    (filters.district ? 1 : 0)
  );
}
