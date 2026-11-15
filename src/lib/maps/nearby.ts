/**
 * "What's nearby": one definition, used by two callers. Client-safe (no
 * secrets).
 *
 *   • the website's chips (components/unit/UnitGoogleMap.tsx) run the search
 *     in the browser with the referrer-restricted browser key;
 *   • the app's route (app/api/app/nearby) runs it on the server with
 *     GOOGLE_PLACES_SERVER_KEY, because the app must never hold a Google key.
 *
 * Both search the same categories, Google types, radius and result count, so
 * the app and the site show the same places.
 */

export type NearbyCategory = 'supermarket' | 'transit' | 'restaurant' | 'pharmacy' | 'hospital' | 'mall' | 'mosque' | 'atm';

export const NEARBY_CATEGORIES: NearbyCategory[] = ['supermarket', 'transit', 'restaurant', 'pharmacy', 'hospital', 'mall', 'mosque', 'atm'];

/** Category → Places (New) primary types. */
export const NEARBY_TYPES: Record<NearbyCategory, string[]> = {
  supermarket: ['supermarket', 'grocery_store'],
  // Rail only: 'transit_station' brings back every bus stop on the street.
  transit: ['subway_station', 'light_rail_station', 'train_station'],
  restaurant: ['restaurant'],
  pharmacy: ['pharmacy'],
  hospital: ['hospital'],
  mall: ['shopping_mall'],
  mosque: ['mosque'],
  atm: ['atm'],
};

/** Nearby Search: a hard 1 km circle around the public (blurred) point. */
export const NEARBY_RADIUS_M = 1000;
/** Text Search ("search near this place"): a 2 km bias, not a restriction. */
export const NEARBY_TEXT_BIAS_M = 2000;
/** Nearest first, this many. */
export const NEARBY_MAX_RESULTS = 8;

export function isNearbyCategory(v: unknown): v is NearbyCategory {
  return typeof v === 'string' && (NEARBY_CATEGORIES as string[]).includes(v);
}
