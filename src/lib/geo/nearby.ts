import 'server-only';
import { unstable_cache } from 'next/cache';

/**
 * "Nearby" under the unit map: the nearest station (metro / rail / tram), from
 * Mapbox's Search Box category data, measured from the BLURRED point and
 * rounded — "≈ 6 min walk".
 *
 * Only stations: Mapbox's mall and airport categories were tried and are not
 * reliable here (small arcades as "malls", transfer companies as "airports"),
 * and a wrong landmark is worse than none.
 *
 * One API call per unit and language, cached 30 days. Times are straight-line
 * estimates with a detour factor — the "≈" is meant.
 */
export interface Nearby {
  name: string;
  minutes: number;
  mode: 'walk' | 'drive';
}

const MAX_KM = 15;

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

async function query(unitId: string, lat: number, lng: number, locale: string): Promise<Nearby | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;
  const url = new URL('https://api.mapbox.com/search/searchbox/v1/category/railway_station');
  url.searchParams.set('proximity', `${lng},${lat}`);
  url.searchParams.set('limit', '3');
  url.searchParams.set('language', locale);
  url.searchParams.set('access_token', token);
  const res = await fetch(url, { headers: { Referer: 'https://www.homestastay.com/' }, signal: AbortSignal.timeout(3000) });
  // Thrown, so a failure is not cached for 30 days.
  if (!res.ok) throw new Error(`nearby ${res.status}`);
  const data = (await res.json()) as { features?: { properties?: { name?: string }; geometry?: { coordinates?: [number, number] } }[] };

  const here = { lat, lng };
  const best = (data.features ?? [])
    .map((f) => ({ name: f.properties?.name?.trim() ?? '', c: f.geometry?.coordinates }))
    .filter((f): f is { name: string; c: [number, number] } => !!f.name && !!f.c)
    .map((f) => ({ name: f.name, d: km(here, { lat: f.c[1], lng: f.c[0] }) }))
    .sort((a, b) => a.d - b.d)[0];
  if (!best || best.d > MAX_KM) return null;

  // Walking ~4.8 km/h along streets ≈ 1.3× the straight line; past ~25 min, driving at ~30 km/h ≈ 1.4×.
  const walk = Math.max(1, Math.round((best.d * 1.3 * 60) / 4.8));
  if (walk <= 25) return { name: best.name, minutes: walk, mode: 'walk' };
  return { name: best.name, minutes: Math.max(5, Math.round((best.d * 1.4 * 60) / 30)), mode: 'drive' };
}

export async function getNearbyStation(unitId: string, lat: number, lng: number, locale: string): Promise<Nearby | null> {
  try {
    return await unstable_cache(
      () => query(unitId, lat, lng, locale),
      ['unit-nearby-v3', unitId, locale],
      { revalidate: 30 * 24 * 3600 },
    )();
  } catch (err) {
    console.warn('[nearby]', { unitId, message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
