import { parseCategory } from '@/lib/stays/categories';
import type { StaysFilters } from '@/lib/stays/filters';

/**
 * The filters as the guest sees them NOW. The category chip updates the URL in
 * place (history.replaceState, no navigation), so anything that rebuilds a
 * search from server-rendered filters — sort, the filter sheet, the search bar
 * — must take the category from the live URL, or it would quietly undo the
 * chip. Client-only; on the server it returns the filters unchanged.
 */
export function withLiveCategory(filters: StaysFilters): StaysFilters {
  if (typeof window === 'undefined') return filters;
  const live = parseCategory(new URLSearchParams(window.location.search).get('type'));
  const next = { ...filters };
  if (live) next.category = live;
  else delete next.category;
  return next;
}
