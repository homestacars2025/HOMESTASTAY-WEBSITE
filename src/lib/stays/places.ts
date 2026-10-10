import 'server-only';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { createAdminClient } from '@/lib/supabase/admin';
import { districtKey, getRankingIndex } from '@/lib/queries/stays';
import { distanceKm } from '@/lib/stays/ranking';
import type { StaysFilters } from '@/lib/stays/filters';
import { normalizePlace } from '@/lib/stays/place-text';

export { normalizePlace };

/**
 * What a typed place means — "İstanbul", "Taksim", "تقسيم", "Kartepe".
 *
 *   exact    a city, in any spelling/language/case  → that city
 *   area     an area or district (geo_area_aliases, geo_districts)
 *            → its city, with the area ranked first (soft — see ranking)
 *   near     a real place we have no listing in (geocoded)
 *            → the nearest city that has units, within NEAR_KM
 *   unknown  nothing found → no place filter at all, and the page says so
 *
 * Never a dead empty page because of spelling: the worst case is "showing all
 * places" with the reason on screen.
 */
export type PlaceMatch =
  | { kind: 'exact'; city: string }
  | { kind: 'area'; city: string; area: string; areaName: string; label: string }
  | { kind: 'near'; city: string; query: string; km: number }
  | { kind: 'unknown'; query: string };

/** How far a geocoded place may be from a city before we stop guessing. */
const NEAR_KM = 120;

type Entry =
  | { kind: 'city'; city: string }
  | { kind: 'area'; city: string; area: string; areaName: string };

interface Directory {
  /** normalized name (and its space-less form) → what it means */
  names: Record<string, Entry>;
  /** ISO codes of the countries we list in, for the geocoder. */
  countries: string[];
}

/**
 * Every name a place goes by, from the database: geo_cities and
 * geo_districts in each language, and geo_area_aliases (Taksim, تقسيم,
 * Nişantaşı…). The aliases are read with the service-role client because the
 * table is not granted to anon — a public reference list, read server-side
 * only and cached; nothing else from it leaves this module.
 */
const getDirectory = unstable_cache(
  async (): Promise<Directory> => {
    const pub = createPublicClient();
    const [cities, districts, aliases, countries] = await Promise.all([
      pub.from('geo_cities').select('id,name,name_en,name_tr,name_ar').eq('is_active', true),
      pub.from('geo_districts').select('id,name,name_en,name_tr,name_ar,geo_cities:city_id(name)').eq('is_active', true),
      createAdminClient().from('geo_area_aliases').select('alias,geo_cities:city_id(name),geo_districts:district_id(id,name,name_en,geo_cities:city_id(name))'),
      pub.from('geo_cities').select('geo_countries:country_id(iso_code)').eq('is_active', true),
    ]);
    if (cities.error || districts.error) throw new Error(`place directory: ${cities.error?.message ?? districts.error?.message}`);

    const names: Record<string, Entry> = {};
    const put = (raw: string | null | undefined, entry: Entry, override = false) => {
      if (!raw) return;
      const n = normalizePlace(raw);
      if (!n) return;
      for (const k of [n, n.replace(/ /g, '')]) if (override || !names[k]) names[k] = entry;
    };

    // Districts and aliases first, so a city of the same name (none today)
    // would win — a city is the broader, safer reading.
    type D = { id: string; name: string | null; name_en: string | null; name_tr?: string | null; name_ar?: string | null; geo_cities?: { name: string } | null };
    for (const d of (districts.data ?? []) as unknown as D[]) {
      const city = d.geo_cities?.name;
      if (!city) continue;
      const entry: Entry = { kind: 'area', city, area: districtKey(d), areaName: d.name ?? d.name_en ?? '' };
      for (const n of [d.name, d.name_en, d.name_tr, d.name_ar]) put(n, entry);
    }
    if (aliases.error) {
      console.error('[places] aliases unreadable', { code: aliases.error.code });
    } else {
      type A = { alias: string; geo_cities: { name: string } | null; geo_districts: D | null };
      for (const a of (aliases.data ?? []) as unknown as A[]) {
        const d = a.geo_districts;
        if (d?.geo_cities?.name) {
          put(a.alias, { kind: 'area', city: d.geo_cities.name, area: districtKey(d), areaName: d.name ?? d.name_en ?? '' });
        } else if (a.geo_cities?.name) {
          put(a.alias, { kind: 'city', city: a.geo_cities.name });
        }
      }
    }
    for (const c of cities.data ?? []) {
      const entry: Entry = { kind: 'city', city: c.name as string };
      for (const n of [c.name, c.name_en, c.name_tr, c.name_ar]) put(n as string | null, entry, true);
    }

    const iso = new Set<string>();
    for (const r of (countries.data ?? []) as unknown as { geo_countries: { iso_code: string | null } | null }[]) {
      const code = r.geo_countries?.iso_code;
      if (code) iso.add(code.toLowerCase());
    }
    return { names, countries: [...iso] };
  },
  ['place-directory-v1'],
  { tags: ['units'], revalidate: 600 },
);

/** Mapbox forward geocoding, cached per query for a week. Null = no match. */
const geocode = unstable_cache(
  async (query: string, countries: string): Promise<{ lat: number; lng: number } | null> => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return null;
    const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '1');
    if (countries) url.searchParams.set('country', countries);
    url.searchParams.set('access_token', token);
    // The public token is URL-restricted to the site; say where we are.
    const res = await fetch(url, { headers: { Referer: 'https://www.homestastay.com/' }, signal: AbortSignal.timeout(2500) });
    // Thrown, so a failure is not cached as "no such place".
    if (!res.ok) throw new Error(`geocode ${res.status}`);
    const data = (await res.json()) as { features?: { geometry?: { coordinates?: [number, number] } }[] };
    const c = data.features?.[0]?.geometry?.coordinates;
    return c ? { lng: c[0], lat: c[1] } : null;
  },
  ['place-geocode-v1'],
  { revalidate: 7 * 24 * 3600 },
);

/** The longest run of words in the text that names a place we know. */
function findInText(normalized: string, names: Record<string, Entry>, hasUnits: (city: string) => boolean): Entry | null {
  if (names[normalized]) return names[normalized];
  const words = normalized.split(' ');
  for (let n = Math.min(4, words.length); n >= 1; n--) {
    let best: Entry | null = null;
    for (let i = 0; i + n <= words.length; i++) {
      const hit = names[words.slice(i, i + n).join(' ')];
      // An area beats a city of the same length: "Taksim Istanbul" is Taksim.
      if (hit && (!best || (best.kind === 'city' && hit.kind === 'area'))) best = hit;
    }
    if (best) return best;
  }
  // A word still being typed ("Taks", "Anta"): the shortest known name it
  // starts — preferring places that have units ("Anta" is Antalya, not
  // Antakya). Four letters at least, so "Be" does not pick a district at random.
  if (normalized.length >= 4) {
    let best: { key: string; entry: Entry; rank: number } | null = null;
    for (const [key, entry] of Object.entries(names)) {
      if (!key.startsWith(normalized)) continue;
      const rank = (hasUnits(entry.city) ? 0 : 1000) + key.length * 2 + (entry.kind === 'city' ? 0 : 1);
      if (!best || rank < best.rank) best = { key, entry, rank };
    }
    if (best) return best.entry;
  }
  return null;
}

export async function resolvePlace(raw: string): Promise<PlaceMatch> {
  const query = raw.trim().slice(0, 80);
  const normalized = normalizePlace(query);
  if (!normalized) return { kind: 'unknown', query };

  let directory: Directory;
  try {
    directory = await getDirectory();
  } catch (err) {
    // Without the directory, keep the old behaviour: the text is the city.
    console.error('[places] directory', { message: err instanceof Error ? err.message : String(err) });
    return { kind: 'exact', city: query };
  }

  const index = await getRankingIndex();
  const hit = findInText(normalized, directory.names, (city) => !!index.cities[city.toLowerCase()]);
  if (hit?.kind === 'city') return { kind: 'exact', city: hit.city };
  // The note names what the guest typed when it was just the area ("Taksim"),
  // otherwise the district itself.
  if (hit?.kind === 'area') return { ...hit, label: directory.names[normalized] ? query : hit.areaName };

  // A real place we have no name for: where is it, and what is near?
  let point: { lat: number; lng: number } | null = null;
  try {
    point = await geocode(normalized, directory.countries.join(','));
  } catch (err) {
    console.warn('[places] geocode failed', { message: err instanceof Error ? err.message : String(err) });
  }
  if (point) {
    let best: { city: string; km: number } | null = null;
    for (const c of Object.values(index.cities)) {
      if (!c.center) continue;
      const km = distanceKm(point, c.center);
      if (!best || km < best.km) best = { city: c.name, km };
    }
    if (best && best.km <= NEAR_KM) return { kind: 'near', city: best.city, query, km: Math.round(best.km) };
  }
  return { kind: 'unknown', query };
}

/**
 * Where a city is: the centre of its units, or — for a city with none yet —
 * the geocoder's answer. Null when neither knows.
 */
export async function placePoint(cityName: string): Promise<{ lat: number; lng: number } | null> {
  const index = await getRankingIndex();
  const c = index.cities[cityName.toLowerCase()];
  if (c?.center) return c.center;
  try {
    const d = await getDirectory();
    return await geocode(normalizePlace(cityName), d.countries.join(','));
  } catch {
    return null;
  }
}

/** The search with its place resolved: canonical city, soft area, or none. */
export function applyPlace(filters: StaysFilters, match: PlaceMatch | null): StaysFilters {
  if (!match) return filters;
  const { city: _c, district, area, ...rest } = filters; // eslint-disable-line @typescript-eslint/no-unused-vars
  switch (match.kind) {
    case 'exact':
      return { ...rest, city: match.city, ...(district ? { district } : {}), ...(area ? { area } : {}) };
    case 'area':
      // A district picked in the filter sheet is a hard filter and stays one.
      return { ...rest, city: match.city, ...(district ? { district } : { area: match.area }) };
    case 'near':
      return { ...rest, city: match.city };
    case 'unknown':
      return rest;
  }
}
