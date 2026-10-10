/**
 * "Recommended" — the order a search's results are shown in.
 *
 * ONE function, used by every recommended list on the site: /stays, the city
 * pages (both through resolveCandidates) and the home page's featured rail
 * (the unfiltered catalogue, ranked with no request). Pure and deterministic:
 * the same search always gives the same order, the unit id breaking every tie.
 * Nothing here is random and nothing reads the database — the caller hands in
 * the facts, so a script can run it and print the reasons.
 *
 * The score starts at 100 and loses points, in this order of weight:
 *
 *   1. GUESTS FIT — the strongest. A unit sized for the party first: for 6
 *      guests, units sleeping 6–7, then 8–9, then larger; every two empty beds
 *      cost a step. With 1 guest (or none given), units for 1–4 come first and
 *      larger ones simply follow.
 *   2. NIGHTS FIT — with dates, a minimum stay close to the stay's length (a
 *      2-night stay: minimum 1–2 first). Without dates, a minimum of 3 nights
 *      or less first; 7 nights or more go to the BOTTOM as long stays (shown,
 *      with a badge, never hidden).
 *   3. AREA FIT — when an area was asked for (Taksim → Beyoğlu), that area
 *      first, then the rest of the city by distance from it.
 *   4. LISTING QUALITY — the tiebreaker: photos (8 or more is full marks), a
 *      description, amenities, house rules, a price, a real cover photo.
 *
 * Then DIVERSITY: in the first page (24), never more than two units of the
 * same property in a row — the next best unit of another property steps in.
 */

export interface RankUnit {
  id: string;
  propertyId: string | null;
  maxGuests: number | null;
  /** units.min_nights; null counts as 1. */
  minNights: number | null;
  districtId: string | null;
  /** Exact coordinates — SERVER ONLY. Used for distances, never returned. */
  lat: number | null;
  lng: number | null;
  quality: QualitySignals;
}

export interface QualitySignals {
  photos: number;
  hasDescription: boolean;
  /** How many of the unit's amenity flags are on. */
  amenities: number;
  hasRules: boolean;
  hasPrice: boolean;
  /** A unit photo, not the property's fallback cover. */
  realCover: boolean;
}

export interface RankRequest {
  guests?: number;
  /** Nights of the stay when dates were given. */
  nights?: number | null;
  /** The area (district) asked for, and where it is. */
  areaDistrictId?: string | null;
  areaName?: string | null;
  areaCenter?: { lat: number; lng: number } | null;
}

export interface Ranked {
  id: string;
  score: number;
  /** min_nights ≥ 7 on a search without dates: shown last, with a badge. */
  longStay: boolean;
  minNights: number;
  reasons: string[];
}

export const LONG_STAY_MIN = 7;
export const FIRST_PAGE = 24;
const MAX_RUN = 2;

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** 0..1 — how complete the listing is. */
export function qualityScore(q: QualitySignals): number {
  return (
    0.4 * Math.min(q.photos, 8) / 8 +
    0.15 * (q.hasDescription ? 1 : 0) +
    0.15 * Math.min(q.amenities, 6) / 6 +
    0.1 * (q.hasRules ? 1 : 0) +
    0.1 * (q.hasPrice ? 1 : 0) +
    0.1 * (q.realCover ? 1 : 0)
  );
}

function scoreUnit(u: RankUnit, req: RankRequest): Ranked {
  const reasons: string[] = [];
  let score = 100;
  const guests = req.guests && req.guests > 1 ? req.guests : null;
  const minNights = u.minNights && u.minNights > 0 ? u.minNights : 1;

  // 1 ── Guests fit
  if (guests) {
    if (u.maxGuests === null) {
      score -= 30;
      reasons.push('capacity unknown −30');
    } else {
      const empty = Math.max(0, u.maxGuests - guests);
      const tier = Math.floor(empty / 2);
      const p = Math.min(60, 12 * tier);
      score -= p;
      reasons.push(`sleeps ${u.maxGuests} for ${guests}${p ? ` −${p}` : ''}`);
    }
  } else if (u.maxGuests === null || u.maxGuests > 4) {
    score -= 8;
    reasons.push(`sleeps ${u.maxGuests ?? '?'} (small first) −8`);
  } else {
    reasons.push(`sleeps ${u.maxGuests}`);
  }

  // 2 ── Nights fit
  let longStay = false;
  if (req.nights) {
    const tier = Math.min(3, Math.floor(Math.max(0, req.nights - minNights) / 2));
    const p = 8 * tier;
    score -= p;
    reasons.push(`min ${minNights}n for ${req.nights}n${p ? ` −${p}` : ''}`);
  } else if (minNights >= LONG_STAY_MIN) {
    longStay = true;
    reasons.push(`long stay, min ${minNights}n → bottom`);
  } else if (minNights > 3) {
    score -= 8;
    reasons.push(`min ${minNights}n −8`);
  } else {
    reasons.push(`min ${minNights}n`);
  }

  // 3 ── Area fit
  if (req.areaDistrictId) {
    if (u.districtId === req.areaDistrictId) {
      reasons.push(`in ${req.areaName ?? 'area'}`);
    } else {
      const km = req.areaCenter && u.lat !== null && u.lng !== null ? distanceKm(req.areaCenter, { lat: u.lat, lng: u.lng }) : null;
      const band = km === null ? 4 : km < 2 ? 0 : km < 5 ? 1 : km < 10 ? 2 : km < 20 ? 3 : 4;
      const p = 6 + 3 * band;
      score -= p;
      reasons.push(`${km === null ? 'distance unknown' : `${km.toFixed(1)} km from ${req.areaName ?? 'area'}`} −${p}`);
    }
  }

  // 4 ── Quality
  const q = qualityScore(u.quality);
  const qp = Math.round((1 - q) * 6 * 10) / 10;
  score -= qp;
  const missing = [
    !u.quality.hasDescription && 'no description',
    !u.quality.hasRules && 'no rules',
    !u.quality.hasPrice && 'no price',
    !u.quality.realCover && 'no own cover',
  ].filter(Boolean);
  reasons.push(`${u.quality.photos} photos${missing.length ? `, ${missing.join(', ')}` : ''}${qp ? ` −${qp}` : ''}`);

  return { id: u.id, score: Math.round(score * 10) / 10, longStay, minNights, reasons };
}

/**
 * Units in recommended order, with their score and the reasons for it.
 * Long stays (no dates, min ≥ 7) always come last; diversity is applied to
 * the first page only.
 */
export function rankUnits(units: RankUnit[], req: RankRequest): Ranked[] {
  const property = new Map(units.map((u) => [u.id, u.propertyId]));
  const ranked = units.map((u) => scoreUnit(u, req)).sort((a, b) => {
    if (a.longStay !== b.longStay) return a.longStay ? 1 : -1;
    if (a.score !== b.score) return b.score - a.score;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return diversify(ranked, (r) => property.get(r.id) ?? null);
}

/**
 * Never more than MAX_RUN units of one property in a row within the first
 * page: when the next unit would make a third, the best unit of another
 * property moves up in its place. Beyond the first page the order is as scored.
 */
function diversify<T extends Ranked>(list: T[], propertyOf: (r: T) => string | null): T[] {
  const rest = [...list];
  const out: T[] = [];
  while (rest.length && out.length < FIRST_PAGE) {
    const last = out.slice(-MAX_RUN).map(propertyOf);
    const runOf = last.length === MAX_RUN && last[0] !== null && last.every((p) => p === last[0]) ? last[0] : null;
    let i = 0;
    if (runOf !== null) {
      // Keep long stays at the bottom: only look for a substitute in the same group.
      const group = rest[0].longStay;
      const j = rest.findIndex((r) => r.longStay === group && propertyOf(r) !== runOf);
      if (j > 0) i = j;
    }
    out.push(rest.splice(i, 1)[0]);
  }
  return out.concat(rest);
}
