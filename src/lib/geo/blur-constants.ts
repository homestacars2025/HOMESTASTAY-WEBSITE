/**
 * The location blur, client-safe. The public point of a unit is
 * public_units_view.latitude/longitude — offset in the DATABASE by a stable
 * 40–70 m per unit (the exact unit_info columns are not readable by the
 * public API). The site rounds it to 4 decimals (~11 m) and draws an 80 m
 * circle around it, so the home — at most ~76 m away — is always inside.
 */
export const MIN_OFFSET_M = 40;
export const MAX_OFFSET_M = 70;

/** ⚠️ Must stay above MAX_OFFSET_M + the rounding (~6 m), or the home could fall outside. */
export const APPROX_RADIUS_M = 80;
