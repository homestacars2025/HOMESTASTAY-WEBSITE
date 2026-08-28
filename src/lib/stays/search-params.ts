import type { StaysFilters } from '@/lib/queries/stays';
import { isStayCategory } from '@/lib/stays/categories';

/**
 * Translation between /stays URL query params and StaysFilters.
 *
 * Shared by the page (which reads them) and the search bar (which writes them),
 * so the two can never drift apart on a param name or format.
 */

export const MIN_GUESTS = 1;
export const MAX_GUESTS = 20;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date, not merely ISO-shaped — rejects 2026-02-31. */
export function isRealDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Local YYYY-MM-DD. Deliberately not toISOString(), which shifts to UTC and can slip a day. */
export function toISODate(date: Date): string {
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

type RawParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v?.trim() || undefined;
}

/**
 * Parse untrusted URL params into filters, dropping anything invalid.
 *
 * Anything a visitor can hand-edit lands here, so a bad value must degrade to
 * "no filter" rather than surface a database error or an empty page. Dates only
 * survive as a pair — a lone checkIn can't express a range to test against.
 */
export function parseStaysSearchParams(params: RawParams): StaysFilters {
  const filters: StaysFilters = {};

  const city = single(params.city);
  if (city) filters.city = city;

  // An unknown category is dropped rather than passed through, so a hand-typed
  // ?type=castle shows the whole catalogue instead of an empty page.
  const category = single(params.type);
  if (category && isStayCategory(category)) filters.category = category;

  const rawGuests = single(params.guests);
  if (rawGuests) {
    const n = Number.parseInt(rawGuests, 10);
    if (Number.isFinite(n) && n >= MIN_GUESTS) filters.guests = Math.min(n, MAX_GUESTS);
  }

  const checkIn = single(params.checkIn);
  const checkOut = single(params.checkOut);
  // A zero/negative-length stay has no nights to check, so it isn't a filter.
  if (checkIn && checkOut && isRealDate(checkIn) && isRealDate(checkOut) && checkIn < checkOut) {
    filters.checkIn = checkIn;
    filters.checkOut = checkOut;
  }

  return filters;
}

/**
 * 1-based results page from the URL; anything invalid degrades to page 1.
 *
 * Lives here rather than on the listing page because the unit page reads it
 * too — its back link has to know which page of results the guest came from.
 */
export function parseStaysPage(params: RawParams): number {
  const n = Number.parseInt(single(params.page) ?? '1', 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Build the /stays query string for a search. Omits empty values entirely. */
export function buildStaysQuery(filters: StaysFilters): string {
  const q = new URLSearchParams();
  if (filters.category) q.set('type', filters.category);
  if (filters.city) q.set('city', filters.city);
  if (filters.guests && filters.guests > MIN_GUESTS) q.set('guests', String(filters.guests));
  if (filters.checkIn && filters.checkOut) {
    q.set('checkIn', filters.checkIn);
    q.set('checkOut', filters.checkOut);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

/**
 * The whole active search — filters AND page — as a query string.
 *
 * This is what round-trips a guest through a unit page. The card link carries
 * it in and the detail page's back link rebuilds it on the way out, so opening
 * a unit from page 3 of a filtered search returns to page 3 of that same
 * search instead of the bare, unfiltered index.
 */
export function buildStaysQueryWithPage(filters: StaysFilters, page: number): string {
  const q = new URLSearchParams(buildStaysQuery(filters));
  // Page 1 is what parseStaysPage assumes when the param is absent, so writing
  // it would only add noise to the common URL.
  if (page > 1) q.set('page', String(page));
  const s = q.toString();
  return s ? `?${s}` : '';
}
