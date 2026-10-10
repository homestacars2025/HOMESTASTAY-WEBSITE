import 'server-only';
import { matchUnits } from '@/lib/queries/stays';
import { placePoint } from '@/lib/stays/places';
import { distanceKm } from '@/lib/stays/ranking';
import type { StaysFilters } from '@/lib/stays/filters';

/**
 * What to offer when a search finds nothing — never just "clear search".
 *
 *   largest   too many guests for this place: the most the place can sleep
 *   dates     the same stay moved by ±1–2 days, where that finds places
 *   nearby    the nearest other cities with places for this search
 *   loosen    the same search without amenities / price bounds
 *
 * Each is the real count of a real search (the same filters, one thing
 * relaxed), so a button never leads to another empty page. Runs only on an
 * empty result, all lookups at once.
 */
export interface Suggestions {
  largest: { guests: number; count: number } | null;
  dates: { checkIn: string; checkOut: string; count: number }[];
  nearby: { city: string; km: number | null; count: number }[];
  loosen: number | null;
}

/** Further than this is another trip, not a nearby alternative. */
const NEARBY_KM = 400;

const NONE: Suggestions = { largest: null, dates: [], nearby: [], loosen: null };

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getEmptySuggestions(filters: StaysFilters): Promise<Suggestions> {
  const { city, guests, checkIn, checkOut } = filters;
  const today = new Date().toISOString().slice(0, 10);

  const shifts = checkIn && checkOut
    ? [-2, -1, 1, 2]
        .map((n) => ({ checkIn: shiftDate(checkIn, n), checkOut: shiftDate(checkOut, n) }))
        .filter((d) => d.checkIn >= today)
    : [];
  const refined = !!(filters.amenities?.length || filters.priceMin !== undefined || filters.priceMax !== undefined);
  const { city: _c, district: _d, area: _a, ...anywhere } = filters; // eslint-disable-line @typescript-eslint/no-unused-vars

  const [withoutGuests, byDates, elsewhere, loosened, here] = await Promise.all([
    guests ? matchUnits({ ...filters, guests: undefined }) : Promise.resolve(null),
    Promise.all(shifts.map((d) => matchUnits({ ...filters, ...d }).then((r) => ({ ...d, count: r?.length ?? 0 })))),
    city ? matchUnits(anywhere) : Promise.resolve(null),
    refined ? matchUnits({ ...filters, amenities: undefined, priceMin: undefined, priceMax: undefined }) : Promise.resolve(null),
    city ? placePoint(city) : Promise.resolve(null),
  ]).catch((err) => {
    console.error('[suggestions]', { message: err instanceof Error ? err.message : String(err) });
    return null;
  }) ?? [null, [], null, null, null];

  let largest: Suggestions['largest'] = null;
  if (guests && withoutGuests?.length) {
    const most = Math.max(...withoutGuests.map((u) => u.maxGuests ?? 0));
    if (most > 0 && most < guests) {
      largest = { guests: most, count: withoutGuests.filter((u) => (u.maxGuests ?? 0) >= most).length };
    }
  }

  let nearby: Suggestions['nearby'] = [];
  if (city && elsewhere?.length) {
    const counts = new Map<string, number>();
    for (const u of elsewhere) {
      if (!u.city || u.city.toLowerCase() === city.toLowerCase()) continue;
      counts.set(u.city, (counts.get(u.city) ?? 0) + 1);
    }
    const withKm = await Promise.all(
      [...counts].map(async ([name, count]) => {
        const p = here ? await placePoint(name) : null;
        return { city: name, count, km: here && p ? Math.round(distanceKm(here, p)) : null };
      }),
    );
    nearby = withKm
      .filter((n) => n.km === null || n.km <= NEARBY_KM)
      .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9) || b.count - a.count)
      .slice(0, 3);
  }

  if (!withoutGuests && !byDates.length && !elsewhere && !loosened) return NONE;
  return {
    largest,
    dates: byDates.filter((d) => d.count > 0),
    nearby,
    loosen: loosened?.length ? loosened.length : null,
  };
}
