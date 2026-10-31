import type { StayType } from '@/lib/stays/filters';

/**
 * The category chips — the ONE place that says which unit types each chip
 * means. Fewer, broader chips than unit types: a guest picks "a flat" or "a
 * villa", not studio vs apartment.
 *
 *   apartment → apartment + studio   (studio is never its own chip)
 *   cabin     → cabin
 *   villa     → villa
 *   hotels    → NO unit type: the chip holds hotel / resort
 *               cards only (one per property, see planCards), never a unit
 *   (All)     → everything bookable, including room / suite / farm / bed /
 *               other, which belong to no chip and appear only under All.
 *
 * Cars is not a category — it links to Homesta Cars (see CategoryRow).
 * Client-safe: no server imports.
 */
export const CATEGORIES = ['apartment', 'cabin', 'villa', 'hotels'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_TYPES: Record<Category, readonly StayType[]> = {
  apartment: ['apartment', 'studio'],
  cabin:     ['cabin'],
  villa:     ['villa'],
  hotels:    [],
};

/**
 * Which chip a unit's OWN card falls under, or null (shown under All only).
 * Never Hotels — that chip is for property cards.
 */
export function categoryOf(unitType: string | null | undefined): Category | null {
  for (const c of CATEGORIES) {
    if ((CATEGORY_TYPES[c] as readonly string[]).includes(unitType ?? '')) return c;
  }
  return null;
}

/**
 * ?type=… → a category. Accepts the category keys themselves, raw unit types
 * from old links (?type=studio → apartment, ?type=room / suite → hotels) and
 * the older plural keys (?type=apartments, ?type=rooms). A list (?type=a,b)
 * resolves to its first recognisable entry. Anything else → null (All):
 * an old or hand-edited link always lands somewhere, never on an empty page.
 */
const ALIASES: Record<string, Category> = {
  apartment: 'apartment', apartments: 'apartment', studio: 'apartment', studios: 'apartment',
  cabin: 'cabin', cabins: 'cabin', bungalow: 'cabin',
  villa: 'villa', villas: 'villa',
  hotels: 'hotels', hotel: 'hotels', resort: 'hotels', resorts: 'hotels',
  room: 'hotels', rooms: 'hotels', suite: 'hotels', suites: 'hotels',
};

export function parseCategory(raw: string | string[] | null | undefined): Category | null {
  const values = (Array.isArray(raw) ? raw : [raw ?? ''])
    .flatMap((v) => v.split(','))
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  for (const v of values) {
    const c = ALIASES[v];
    if (c) return c;
  }
  return null;
}
