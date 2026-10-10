import { getLocale } from 'next-intl/server';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { pickLocalizedName } from '@/lib/geo/localize';
import { getRankingIndex } from '@/lib/queries/stays';
import { CollapsibleSearch } from '@/components/home/CollapsibleSearch';
import type { StaysFilters } from '@/lib/queries/stays';

/** Midday avoids any chance a timezone shift rolls the date back a day. */
function fromISODate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/**
 * The active cities, raw — every language column, localised per request below.
 * Cached and tagged 'units': the same list for every visitor, and it used to
 * cost two uncached queries on every page that shows the search bar.
 */
const getActiveCities = unstable_cache(
  async () => {
    const { data, error } = await createPublicClient()
      .from('geo_cities')
      .select('id, name, name_ar, name_en, name_tr')
      .eq('is_active', true)
      .order('sort_order', { ascending: false })
      .order('name', { ascending: true });
    if (error) throw new Error(`active cities: ${error.message}`);
    return data ?? [];
  },
  ['search-active-cities-v1'],
  { tags: ['units'], revalidate: 600 },
);

export async function SearchBarWrapper({
  filters,
  collapsible = false,
}: {
  filters?: StaysFilters;
  /** /stays passes true: once a search has run, the bar becomes a summary. */
  collapsible?: boolean;
}) {
  const [locale, rows, index] = await Promise.all([
    getLocale(),
    getActiveCities().catch(() => []),
    getRankingIndex(),
  ]);

  // The names come from geo_cities.name_ar/_en/_tr, not from a hand-kept
  // list in the message files: a city added to the database shows up
  // translated without a code change. `name` is untouched — the URL still
  // carries it, so shared links keep working across a language switch.
  //
  // Only cities that hold visible units are offered (counted in the cached
  // ranking index, so a city reappears within 10 minutes of its first unit
  // going live). Picking one of the others could only ever end on an empty
  // page. If the index is unavailable, every city is offered as before.
  const live = Object.keys(index.cities).length > 0;
  const cities = rows
    .filter((c) => !live || index.cities[String(c.name).toLowerCase()])
    .map((c) => ({
      id: c.id as string,
      name: c.name as string,
      localizedName: pickLocalizedName(locale, c) ?? (c.name as string),
    }));

  // The URL carries the city by name; the bar selects by id. Match case-insensitively,
  // since the param is whatever the visitor typed or shared.
  const cityId = filters?.city
    ? cities.find((c) => c.name.toLowerCase() === filters.city!.toLowerCase())?.id
    : undefined;

  // Collapse only when a search actually ran. A bare /stays (or a category-only
  // view) has nothing to summarise, so the full bar stays — collapsing it would
  // hide the search behind a pill that says nothing.
  const searched = Boolean(filters?.city || filters?.checkIn || filters?.guests);

  return (
    <CollapsibleSearch
      startCollapsed={collapsible && searched}
      cities={cities}
      initial={{
        cityId,
        guests: filters?.guests,
        refine: filters
          ? {
              category: filters.category,
              district: filters.district,
              priceMin: filters.priceMin,
              priceMax: filters.priceMax,
              amenities: filters.amenities,
              sort: filters.sort,
            }
          : undefined,
        dateRange: filters?.checkIn
          ? {
              from: fromISODate(filters.checkIn),
              to: filters.checkOut ? fromISODate(filters.checkOut) : undefined,
            }
          : undefined,
      }}
    />
  );
}
