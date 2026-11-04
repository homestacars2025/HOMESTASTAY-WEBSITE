import { parseCategory } from '@/lib/stays/categories';
import { parseStaysSearchParams } from '@/lib/stays/search-params';
import type { StaysFilters } from '@/lib/stays/filters';

/** /stays (any locale prefix), where the URL holds the whole search. */
function onStaysIndex(): boolean {
  return /^\/(?:[a-z]{2}\/)?stays\/?$/.test(window.location.pathname);
}

/** The current URL's query as the parser's input (repeated keys kept as arrays). */
function urlParams(): Record<string, string | string[]> {
  const sp = new URLSearchParams(window.location.search);
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}

/**
 * The filters as the guest sees them NOW — the URL is the single source of
 * truth for the search.
 *
 * On /stays it is EVERY filter, read from the live URL: city, district, area,
 * type, dates, guests, price, amenities, sort. The page's own props can be
 * stale there — the category chip rewrites the URL in place (no navigation),
 * and Back / Forward restore a page rendered for an earlier URL — so anything
 * that rebuilds a search (the search bar, the filter sheet, sort) must start
 * from the URL, or it quietly drops filters the guest still sees.
 *
 * Elsewhere (the homepage bar, a hotel page) only the category is taken from
 * the URL, as before. Client-only; on the server it returns the filters given.
 */
export function withLiveCategory(filters: StaysFilters): StaysFilters {
  if (typeof window === 'undefined') return filters;
  if (onStaysIndex()) return parseStaysSearchParams(urlParams());
  const live = parseCategory(new URLSearchParams(window.location.search).get('type'));
  const next = { ...filters };
  if (live) next.category = live;
  else delete next.category;
  return next;
}
