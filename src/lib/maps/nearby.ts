/**
 * "What's nearby": one definition, used by two callers. Client-safe (no
 * secrets).
 *
 *   • the website's chips (components/unit/UnitGoogleMap.tsx) run the search
 *     in the browser with the referrer-restricted browser key;
 *   • the app's route (app/api/app/nearby) runs it on the server with
 *     GOOGLE_PLACES_SERVER_KEY, because the app must never hold a Google key.
 *
 * Both search the same Google types, radius and result count, so the app and
 * the site show the same places. The app also has cafe and beach.
 */

/** The website's chips. */
export type NearbyCategory = 'supermarket' | 'transit' | 'restaurant' | 'pharmacy' | 'hospital' | 'mall' | 'mosque' | 'atm';

export const NEARBY_CATEGORIES: NearbyCategory[] = ['supermarket', 'transit', 'restaurant', 'pharmacy', 'hospital', 'mall', 'mosque', 'atm'];

/**
 * What the app may ask for: the website's chips plus the app's "Explore the
 * area" cards (spec, 15 Nov 2026). Not shown as website chips — those would
 * need labels in 4 languages and icons first.
 */
export type AppNearbyCategory = NearbyCategory | 'cafe' | 'beach';

export const APP_NEARBY_CATEGORIES: AppNearbyCategory[] = [...NEARBY_CATEGORIES, 'cafe', 'beach'];

/** Category → Places (New) primary types. */
export const NEARBY_TYPES: Record<AppNearbyCategory, string[]> = {
  supermarket: ['supermarket', 'grocery_store'],
  // Rail only: 'transit_station' brings back every bus stop on the street.
  transit: ['subway_station', 'light_rail_station', 'train_station'],
  restaurant: ['restaurant'],
  pharmacy: ['pharmacy'],
  hospital: ['hospital'],
  mall: ['shopping_mall'],
  mosque: ['mosque'],
  atm: ['atm'],
  cafe: ['cafe', 'coffee_shop'],
  beach: ['beach'],
};

/** Nearby Search: a hard 1 km circle around the public (blurred) point. */
export const NEARBY_RADIUS_M = 1000;
/** A beach is rarely a 12-minute walk away; the app hides the card when empty. */
const RADIUS_OVERRIDE_M: Partial<Record<AppNearbyCategory, number>> = { beach: 3000 };

export function nearbyRadiusM(category: AppNearbyCategory): number {
  return RADIUS_OVERRIDE_M[category] ?? NEARBY_RADIUS_M;
}

/** Text Search ("search near this place"): a 2 km bias, not a restriction. */
export const NEARBY_TEXT_BIAS_M = 2000;
/** Nearest first, this many. */
export const NEARBY_MAX_RESULTS = 8;

export function isAppNearbyCategory(v: unknown): v is AppNearbyCategory {
  return typeof v === 'string' && (APP_NEARBY_CATEGORIES as string[]).includes(v);
}
