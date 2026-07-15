/**
 * Coordinate blurring for public listings.
 *
 * The real latitude/longitude live in the database and must never reach the
 * browser. Everything public is served an offset point instead, produced here.
 */

/** Offset distance applied to every published coordinate. */
const MIN_OFFSET_M = 300;
const MAX_OFFSET_M = 500;

/**
 * The published circle's radius must be at least MAX_OFFSET_M, or the real
 * address can sit outside the circle drawn around it — which would tell a guest
 * the stay is somewhere it isn't. Consumed by UnitMap.
 */
export const APPROX_RADIUS_M = 600;

/** FNV-1a. Not a security hash — just a cheap, stable string -> uint32. */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic float in [0, 1) from a seed string. */
function unitFloat(seed: string): number {
  return hash32(seed) / 0x100000000;
}

/**
 * Move a coordinate by a fixed, unpredictable-looking offset of 300-500m.
 *
 * Seeded from the unit id rather than Math.random(), and that is the whole
 * point: a fresh offset per request would make the circle jump on every reload,
 * and — far worse — averaging a handful of page loads would cancel the noise out
 * and recover the true address. One stable offset per unit cannot be averaged
 * away, however many times it is sampled.
 *
 * The offset is not a secret, but it is not reversible from the published point
 * alone: recovering the original needs the unit id *and* this function, and even
 * then only to within the ring it draws.
 */
export function approximateCoords(
  seed: string,
  latitude: number | null,
  longitude: number | null,
): { latitude: number | null; longitude: number | null } {
  if (latitude == null || longitude == null) return { latitude: null, longitude: null };

  const angle = unitFloat(`${seed}:angle`) * 2 * Math.PI;
  const distance = MIN_OFFSET_M + unitFloat(`${seed}:dist`) * (MAX_OFFSET_M - MIN_OFFSET_M);

  // Degrees per metre; the longitude span narrows towards the poles.
  const dLat = (distance * Math.sin(angle)) / 110_574;
  const dLon = (distance * Math.cos(angle)) / (111_320 * Math.cos((latitude * Math.PI) / 180));

  return { latitude: latitude + dLat, longitude: longitude + dLon };
}
