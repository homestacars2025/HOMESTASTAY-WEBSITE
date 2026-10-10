/**
 * Client-safe constants of the location blur (see lib/geo/approximate, which
 * is server-only). The published centre is 20–50 m from the real point, so an
 * 80 m circle (about five houses around the unit) always contains the
 * property — never exactly at its centre.
 */
export const MIN_OFFSET_M = 20;
export const MAX_OFFSET_M = 50;

/** ⚠️ Must stay above MAX_OFFSET_M + the rounding error (~6 m), or the property could fall outside. */
export const APPROX_RADIUS_M = 80;
