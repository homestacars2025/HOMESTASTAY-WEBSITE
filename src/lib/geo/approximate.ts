import 'server-only';
import { createHmac } from 'node:crypto';
import { MAX_OFFSET_M, MIN_OFFSET_M } from './blur-constants';

export { APPROX_RADIUS_M, MAX_OFFSET_M, MIN_OFFSET_M } from './blur-constants';

/**
 * Coordinate blurring for every public surface — the unit page map, its
 * structured data, the results-map pins, the cards' payload.
 *
 * The real latitude/longitude live in the database and never reach the
 * browser. Everything public gets this instead, computed here, on the server:
 *
 *   • the centre moves 20–50 m from the real point, in a direction and by a
 *     distance taken from a KEYED hash of the unit id — the same on every page
 *     load (refreshing and averaging gives nothing back), and, because the key
 *     is a server secret, not recomputable from the public id and this code;
 *   • the result is rounded to 4 decimals (~11 m) before it leaves;
 *   • the distance is checked AFTER rounding and must still be 20–50 m;
 *   • maps draw an 80 m circle around it (APPROX_RADIUS_M): the home is
 *     always inside, never exactly at the centre.
 *
 * History (owner's decisions): 300–500 m → 40–70 m in a 100 m circle (Sep
 * 2026) → 150–350 m in 500 m (10 Oct, privacy) → 20–50 m in 80 m (10 Oct,
 * "about five houses around the unit").
 */

/** The hash key: GEO_BLUR_SECRET if set, else derived from a server-only secret. */
function key(): string {
  return process.env.GEO_BLUR_SECRET || `geo-blur:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`;
}

/** Two stable floats in [0, 1) for a seed. */
function floats(seed: string): [number, number] {
  const h = createHmac('sha256', key()).update(seed).digest();
  return [h.readUInt32BE(0) / 0x100000000, h.readUInt32BE(4) / 0x100000000];
}

function metres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

export function approximateCoords(
  seed: string,
  latitude: number | null,
  longitude: number | null,
): { latitude: number | null; longitude: number | null } {
  if (latitude == null || longitude == null) return { latitude: null, longitude: null };

  // Rounding to 4 decimals can move the point up to ~7 m, so each candidate
  // is checked after rounding; the first in range wins (deterministic order).
  let last = { latitude: round4(latitude), longitude: round4(longitude) };
  for (let attempt = 0; attempt < 32; attempt++) {
    const [fa, fd] = floats(`${seed}:${attempt}`);
    const angle = fa * 2 * Math.PI;
    const distance = MIN_OFFSET_M + fd * (MAX_OFFSET_M - MIN_OFFSET_M);
    const dLat = (distance * Math.sin(angle)) / 110_574;
    const dLon = (distance * Math.cos(angle)) / (111_320 * Math.cos((latitude * Math.PI) / 180));
    const p = { latitude: round4(latitude + dLat), longitude: round4(longitude + dLon) };
    const d = metres(latitude, longitude, p.latitude, p.longitude);
    if (d >= MIN_OFFSET_M && d <= MAX_OFFSET_M) return p;
    last = p;
  }
  return last; // unreachable in practice: most candidates land in range
}
