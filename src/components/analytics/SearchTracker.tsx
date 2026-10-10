'use client';

import { useEffect } from 'react';
import { track } from '@/lib/analytics/events';
import { trackSearch } from '@/lib/analytics/meta-pixel';
import type { StaysFilters } from '@/lib/stays/filters';

/**
 * One server search → one `search` event (and Meta's Search); every view of
 * its results — the first, and each category chip after — → `results_shown`
 * with the first 24 ids in order. Renders nothing.
 *
 * `filters` are the RESOLVED ones the search ran with (canonical city, area
 * key), never the text a guest typed.
 */
export function SearchTracker({
  filters,
  category,
  ids,
}: {
  filters: StaysFilters;
  category: string;
  /** What is on screen, in order (the tracker keeps the first 24). */
  ids: string[];
}) {
  const searchKey = JSON.stringify(filters);
  const top = ids.slice(0, 24);
  const shownKey = `${category}|${top.join(',')}`;

  const base = {
    city: filters.city,
    area: filters.area ?? filters.district,
    check_in: filters.checkIn,
    check_out: filters.checkOut,
    guests: filters.guests,
  };

  useEffect(() => {
    track({
      event: 'search',
      ...base,
      filters: {
        sort: filters.sort ?? 'recommended',
        amenities: filters.amenities ?? null,
        price_min: filters.priceMin ?? null,
        price_max: filters.priceMax ?? null,
        district: filters.district ?? null,
        results: ids.length,
      },
    });
    trackSearch({ city: filters.city, checkIn: filters.checkIn, checkOut: filters.checkOut, guests: filters.guests });
    // Once per server search; the other values belong to that search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey]);

  useEffect(() => {
    track({ event: 'results_shown', ...base, type: category, unit_ids: top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);

  return null;
}
