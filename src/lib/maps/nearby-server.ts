import 'server-only';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import {
  NEARBY_MAX_RESULTS, NEARBY_RADIUS_M, NEARBY_TEXT_BIAS_M, NEARBY_TYPES, type NearbyCategory,
} from '@/lib/maps/nearby';

/**
 * "What's nearby" on the SERVER, for the mobile app (app/api/app/nearby).
 *
 * The same search the website's chips run in the browser (UnitGoogleMap):
 * Places API (New), centred on the unit's PUBLIC point, 1 km, 8 results,
 * nearest first. Plus a Text Search for the app's "search near this place"
 * box, biased to 2 km around the same point.
 *
 * PRIVACY: the point is public_units_view.latitude/longitude, read here with
 * the anon key — blurred 40–70 m in the database, rounded to 4 decimals like
 * every other public surface. Never unit_info's exact coordinates, and never a
 * point sent by the caller (that would also make this an open Places proxy).
 *
 * Needs GOOGLE_PLACES_SERVER_KEY (a server key restricted by API to Places API
 * (New), not by referrer). The browser key is referrer-restricted and must
 * not be used from the server.
 */

export interface NearbyResult {
  id: string;
  /** Google's name in the requested language when it has one, else the local name. Never machine-translated. */
  name: string;
  /** Google's primary type (e.g. "restaurant"), or null. */
  type: string | null;
  lat: number;
  lng: number;
}

export type NearbyLang = 'en' | 'ar' | 'tr' | 'ru';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Only the fields we return — the field mask is also what Google bills on. */
const FIELD_MASK = 'places.id,places.displayName,places.primaryType,places.location';
/** Place IDs may be kept indefinitely; the rest well under Google's 30-day limit. */
const CACHE_SECONDS = 7 * 24 * 3600;

export function placesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_SERVER_KEY);
}

/**
 * A LIVE unit's public point, or null. Not cached on purpose: a unit taken
 * offline must stop answering at once, not after the results' week-long cache.
 * Anon RLS already limits public_units_view to available, non-archived units.
 */
export async function unitPublicPoint(unitId: string): Promise<{ lat: number; lng: number } | null> {
  if (!UUID.test(unitId)) return null;
  const { data, error } = await createPublicClient()
    .from('public_units_view')
    .select('latitude,longitude')
    .eq('id', unitId)
    .maybeSingle();
  if (error) throw new Error(`nearby unit point: ${error.message}`);
  const lat = data?.latitude;
  const lng = data?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const r4 = (v: number) => Math.round(v * 10_000) / 10_000;
  return { lat: r4(lat), lng: r4(lng) };
}

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  primaryType?: string;
  location?: { latitude?: number; longitude?: number };
}

async function places(endpoint: 'searchNearby' | 'searchText', body: Record<string, unknown>): Promise<NearbyResult[]> {
  const res = await fetch(`https://places.googleapis.com/v1/places:${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_SERVER_KEY ?? '',
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  // Thrown, so a failure is never cached as "nothing nearby".
  if (!res.ok) throw new Error(`places ${endpoint} ${res.status}`);
  const data = (await res.json()) as { places?: GooglePlace[] };
  return (data.places ?? []).flatMap((p) => {
    const lat = p.location?.latitude;
    const lng = p.location?.longitude;
    const name = p.displayName?.text;
    if (!p.id || !name || typeof lat !== 'number' || typeof lng !== 'number') return [];
    return [{ id: p.id, name, type: p.primaryType ?? null, lat, lng }];
  });
}

/**
 * Keyed by unit + point + category + language. The point is in the key so a
 * re-blurred unit never serves results drawn around its old point.
 */
const nearbyCached = unstable_cache(
  (_unitId: string, lat: number, lng: number, category: NearbyCategory, lang: NearbyLang) =>
    places('searchNearby', {
      includedPrimaryTypes: NEARBY_TYPES[category],
      maxResultCount: NEARBY_MAX_RESULTS,
      rankPreference: 'DISTANCE',
      languageCode: lang,
      regionCode: 'tr',
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: NEARBY_RADIUS_M } },
    }),
  ['app-nearby-v1'],
  { revalidate: CACHE_SECONDS },
);

const textCached = unstable_cache(
  (_unitId: string, lat: number, lng: number, query: string, lang: NearbyLang) =>
    places('searchText', {
      textQuery: query,
      pageSize: NEARBY_MAX_RESULTS,
      languageCode: lang,
      regionCode: 'tr',
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: NEARBY_TEXT_BIAS_M } },
    }),
  ['app-nearby-text-v1'],
  { revalidate: CACHE_SECONDS },
);

export function searchNearbyForUnit(unitId: string, point: { lat: number; lng: number }, category: NearbyCategory, lang: NearbyLang) {
  return nearbyCached(unitId, point.lat, point.lng, category, lang);
}

export function searchTextNearUnit(unitId: string, point: { lat: number; lng: number }, query: string, lang: NearbyLang) {
  return textCached(unitId, point.lat, point.lng, query, lang);
}
