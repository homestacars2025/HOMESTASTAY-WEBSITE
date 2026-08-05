import type { UnitTypeEnum } from '@/lib/types/unit';

/**
 * The category chips, and the unit_type values each one actually means.
 *
 * WHY THIS FILE EXISTS
 *   The chips used to be a hardcoded list of six labels with no connection to
 *   the data: HOTELS and FARMS were offered when the catalogue holds zero of
 *   either, while 7 rooms had no way to be found at all. A chip is a promise
 *   that something is behind it, so the list lives here, mapped to real enum
 *   values, and the counts that decide what renders come from the database.
 *
 * THE FOLDS, AND WHY
 *   studio → Apartments. A studio is an apartment with one room; a guest
 *     filtering for apartments expects to see it.
 *   suite  → Rooms. A suite is a room with more of it. Both are the
 *     single-space, hotel-shaped end of the catalogue.
 *   'other' is deliberately unmapped. Four units whose type nobody could name
 *     do not belong under a label that would misdescribe them — they stay
 *     reachable through ALL, which is honest about being unfiltered.
 *   'farm' and 'bed' exist in the enum with zero units. They are not listed
 *     here, and even if they were, the zero-count rule would hide them.
 *
 * Adding a category is adding a row here plus a `categories.<key>` message and
 * a CategoryIcon path. Nothing else needs to know.
 */
export const STAY_CATEGORIES = [
  { key: 'apartments', types: ['apartment', 'studio'] },
  { key: 'villas',     types: ['villa'] },
  { key: 'cabins',     types: ['cabin'] },
  { key: 'rooms',      types: ['room', 'suite'] },
] as const satisfies ReadonlyArray<{ key: string; types: readonly UnitTypeEnum[] }>;

export type StayCategoryKey = (typeof STAY_CATEGORIES)[number]['key'];

export function isStayCategory(value: string): value is StayCategoryKey {
  return STAY_CATEGORIES.some((c) => c.key === value);
}

/** The unit_type values a category selects. Empty for an unknown key. */
export function categoryTypes(key: StayCategoryKey): readonly UnitTypeEnum[] {
  return STAY_CATEGORIES.find((c) => c.key === key)?.types ?? [];
}
