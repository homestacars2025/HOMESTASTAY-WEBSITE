// ─────────────────────────────────────────────────────────────────────────────
// Unit types — mirrors the Supabase DB schema for guest-facing listing data.
// Field names match DB column names exactly so a Supabase query maps in with
// zero renaming (see src/lib/queries/stays.ts).
// ─────────────────────────────────────────────────────────────────────────────

/** Exact values from unit_type_enum in the live DB. */
export type UnitTypeEnum =
  | 'apartment'
  | 'room'
  | 'suite'
  | 'studio'
  | 'villa'
  | 'cabin'
  | 'farm'
  | 'bed'
  | 'other';

/** Exact values from unit_style_enum. */
export type UnitStyleEnum = 'practical' | 'standard' | 'luxury' | 'super_luxury' | 'other';

/** Exact values from business_model_enum. */
export type BusinessModelEnum =
  | 'full_management'
  | 'profile_management'
  | 'brokerage'
  | 'ownership'
  | 'other';

/** Exact values from unit_status_enum. */
export type UnitStatusEnum = 'available' | 'unavailable' | 'blocked' | 'other';

/** Mirrors a row in the unit_media table. Always use public_url for display. */
export interface UnitMediaItem {
  id: string;
  unit_id: string;
  media_type: string;
  file_path: string;      // Supabase Storage path — not for direct display
  public_url: string;     // use this for <Image src>
  is_cover: boolean;
  sort_order: number;
}

/**
 * Mirrors unit_specifications columns.
 * All nullable — some units may not have every field filled.
 * bathrooms is numeric in the DB (allows 1.5 baths); represented as number here.
 */
export interface UnitSpecifications {
  // Primary — most important for guests
  bedrooms: number | null;
  beds: number | null;
  bathrooms: number | null;
  max_guests: number | null;
  // Secondary
  size_sqm: number | null;
  floor: number | null;
  balconies: number | null;
  kitchens: number | null;
  distance_to_mall: string | null;
  distance_to_transport: string | null;
}

/**
 * Mirrors the boolean columns of unit_amenities (all 16 from the live schema).
 * Grouped here by display category — same order as the admin form and the
 * UnitAmenitiesSection component.
 */
export interface UnitAmenities {
  // Connectivity & Entertainment
  tv: boolean;
  wifi: boolean;
  // Climate
  air_conditioning: boolean;
  heating: boolean;
  // Kitchen & Laundry
  kitchen: boolean;
  dishwasher: boolean;
  washing_machine: boolean;
  // Bathroom & Comfort
  hot_water: boolean;
  hair_dryer: boolean;
  iron: boolean;
  extra_bed: boolean;
  // Building & Access
  parking: boolean;
  elevator: boolean;
  pool: boolean;
  gym: boolean;
  self_check_in: boolean;
}

/**
 * Mirrors unit_rules columns.
 * quiet_hours_from / quiet_hours_to are stored as time ("HH:MM") in the DB.
 */
export interface UnitRules {
  allow_parties: boolean;
  allow_pets: boolean;
  allow_smoking: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_from: string | null;   // "HH:MM"
  quiet_hours_to: string | null;     // "HH:MM"
  allow_unregistered_guests: boolean;
  family_friendly: boolean;
  id_required: boolean;
  additional_rules: string | null;
}

/**
 * Mirrors unit_cancellation_policy (lookup table).
 * Joined via units.cancellation_policy_id.
 */
export interface UnitCancellationPolicy {
  id: string;
  name: string;
  description: string;
}

/**
 * Guest-facing unit listing — composite of:
 *   units + unit_info + unit_specifications + unit_amenities
 *   + unit_media + unit_rules + unit_cancellation_policy
 *
 * All field names match the corresponding DB columns exactly.
 * When the Supabase query is wired in, this type maps directly — no renames needed.
 */
export interface UnitListing {
  // ── units table ─────────────────────────────────────────────────────────
  id: string;
  unit_type: UnitTypeEnum;
  unit_name: string | null;
  status: UnitStatusEnum;
  unit_style: UnitStyleEnum | null;
  business_model: BusinessModelEnum | null;
  min_nights: number;
  base_nightly_price: number | null;   // always USD (DB currency default = 'USD'); null when the host hasn't set a nightly price
  currency: 'USD';

  // ── unit_info table (one-to-one with units) ──────────────────────────────
  ad_title: string | null;       // marketing title shown to guests
  ad_description: string | null; // full description shown on detail page
  country: string | null;        // plain text per schema — not a FK
  city: string | null;
  region: string | null;         // neighbourhood / district (plain text)
  municipality: string | null;
  full_address: string | null;
  google_maps_url: string | null;

  // ── unit_specifications table (one-to-one) ───────────────────────────────
  specifications: UnitSpecifications;

  // ── unit_amenities table (one-to-one) ────────────────────────────────────
  amenities: UnitAmenities;

  // ── unit_rules table (one-to-one) ────────────────────────────────────────
  rules: UnitRules | null;

  // ── unit_cancellation_policy (joined via cancellation_policy_id) ──────────
  cancellation_policy: UnitCancellationPolicy | null;

  // ── unit_media table — sorted: is_cover first, then sort_order asc ───────
  media: UnitMediaItem[];

  // ── Derived at query time (reviews aggregate — null until reviews are built)
  rating: number | null;
  review_count: number | null;

  // ── Locale-aware content (resolved from unit_translations) ─────────────────
  // Language the ad_description text is actually in ('en'|'ar'|'tr'|'ru'), or
  // null when it came from the legacy unit_info fallback. Drives text direction
  // (Arabic → rtl) independently of the visitor's UI locale.
  content_language: string | null;
  // True when a non-Turkish machine translation is being shown to the visitor,
  // so the UI can display the "auto-translated" disclaimer. False for Turkish
  // (the source) and for legacy/fallback content.
  is_machine_translated: boolean;
}

// ── UI filter categories ─────────────────────────────────────────────────────

/** Display filter categories for the /stays gallery. Not stored in DB. */
export type FilterCategory = 'all' | 'apartment' | 'villa' | 'cabin' | 'hotel' | 'farm';

/** Maps each display category to the unit_type_enum values it includes. */
export const FILTER_CATEGORY_UNIT_TYPES: Record<
  Exclude<FilterCategory, 'all'>,
  UnitTypeEnum[]
> = {
  apartment: ['apartment', 'studio'],
  villa:     ['villa'],
  cabin:     ['cabin'],
  hotel:     ['room', 'suite', 'bed'],
  farm:      ['farm'],
};
