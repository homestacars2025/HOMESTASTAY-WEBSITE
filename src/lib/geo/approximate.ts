/**
 * Coordinate blurring for public listings.
 *
 * The real latitude/longitude live in the database and must never reach the
 * browser. Everything public is served an offset point instead, produced here.
 */

/**
 * Offset distance applied to every published coordinate.
 *
 * 300–500 m → 40–70 m, by the owner's decision: a guest should be able to see
 * which block a stay is on, not merely which neighbourhood. It is a deliberate
 * trade of privacy for precision, and it is a real trade — at 300–500 m the
 * published point could have been any of hundreds of buildings; at 40–70 m it
 * is one of a handful on the same street.
 *
 * ⚠️ THE RADIUS MOVES WITH THIS, ALWAYS. The circle must still contain the
 * property, so APPROX_RADIUS_M must stay above MAX_OFFSET_M. Changing one of
 * these two numbers without the other either exposes the address or draws a
 * circle the property is not in.
 */
const MIN_OFFSET_M = 40;
const MAX_OFFSET_M = 70;

/**
 * The published circle's radius. Consumed by UnitMap.
 *
 * ⚠️ THIS MUST STAY ABOVE MAX_OFFSET_M. The circle is drawn around the OFFSET
 * point, so a radius below the maximum offset can leave the real property
 * outside it — telling a guest the stay is somewhere it is not. That is what
 * the radius protects: honesty, not privacy. Privacy comes from the offset
 * above, and shrinking the circle alone would never have exposed anything.
 *
 * 500 → 100 m, alongside the offset drop to 40–70 m. The guarantee survives
 * and is mathematical rather than empirical: distance = MIN + f × (MAX − MIN)
 * with f in [0, 1) lands in [40, 70), strictly under 70, leaving at least 30 m
 * of margin inside a 100 m circle. Every property is inside it, always.
 */
export const APPROX_RADIUS_M = 100;

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
 * ⚠️ THE OFFSET IS NOT A SECRET, AND IT IS FULLY REVERSIBLE TO ANYONE WHO HAS
 * BOTH THE UNIT ID AND THIS FUNCTION. The id travels in the public page
 * payload, so the only thing standing between a reader and the exact original
 * coordinate is that this code is not published — which is obscurity, not a
 * control. An earlier version of this comment claimed the original was
 * recoverable "only to within the ring it draws"; that was wrong, because the
 * offset is deterministic rather than random once the seed is known.
 *
 * At 300–500 m that overstatement still left a wide margin. At 40–70 m the
 * published point is close to the true one regardless, so the trade the owner
 * made is the real protection here — not this function's irreversibility,
 * which it does not have.
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
