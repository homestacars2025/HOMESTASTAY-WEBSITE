/**
 * Client-safe constants of the location blur (see lib/geo/approximate, which
 * is server-only). The published centre is 150–350 m from the real point, so
 * a 500 m circle always contains the property — never near its centre.
 */
export const MIN_OFFSET_M = 150;
export const MAX_OFFSET_M = 350;

/** ⚠️ Must stay above MAX_OFFSET_M, or the property could fall outside the circle. */
export const APPROX_RADIUS_M = 500;
