import { getTranslations } from 'next-intl/server';
import { getHostGeoData } from '@/lib/data/cities';
import { CollapsibleSearch } from '@/components/home/CollapsibleSearch';
import type { StaysFilters } from '@/lib/queries/stays';

const CITY_KEYS = ['istanbul', 'trabzon', 'sapanca', 'antalya', 'fethiye', 'bodrum'] as const;
type CityKey = typeof CITY_KEYS[number];

/** Midday avoids any chance a timezone shift rolls the date back a day. */
function fromISODate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export async function SearchBarWrapper({
  filters,
  collapsible = false,
}: {
  filters?: StaysFilters;
  /** /stays passes true: once a search has run, the bar becomes a summary. */
  collapsible?: boolean;
}) {
  const [tCities, geoData] = await Promise.all([
    getTranslations('cities'),
    getHostGeoData(),
  ]);

  const cities = geoData.cities.map((c) => ({
    id: c.id,
    name: c.name,
    localizedName: CITY_KEYS.includes(c.key as CityKey)
      ? tCities(c.key as CityKey)
      : c.name,
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
