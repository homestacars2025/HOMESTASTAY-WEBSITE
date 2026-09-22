import { getTranslations } from 'next-intl/server';
import { getCatalogueFacets, type StaysFilters } from '@/lib/queries/stays';
import { pickLocalizedName } from '@/lib/geo/localize';
import type { AmenityFilter } from '@/lib/stays/filters';
import { FiltersSheet, type DistrictOption } from './FiltersSheet';
import { SortMenu } from './SortMenu';

/**
 * Filters · sort · result count, above the /stays grid.
 *
 * Rendered inside the results boundary because it reports on them — the
 * count, and the per-amenity counts inside the sheet, are this search's
 * numbers. It also renders on an empty result, which is exactly when a guest
 * most needs to loosen something.
 */
export async function StaysToolbar({
  locale,
  filters,
  total,
  amenityCounts,
}: {
  locale: string;
  filters: StaysFilters;
  total: number;
  amenityCounts: Record<AmenityFilter, number>;
}) {
  const [t, facets] = await Promise.all([getTranslations('filters'), getCatalogueFacets()]);

  // Districts of the chosen city that hold units — localised here so the
  // client gets display strings, not a table row. No city, or a city without
  // districts, draws no district section at all.
  const districts: DistrictOption[] = filters.city
    ? (facets.districtsByCity[filters.city.toLowerCase()] ?? []).map((d) => ({
        key: d.key,
        label: pickLocalizedName(locale, d) ?? d.key,
        count: d.count,
      }))
    : [];

  return (
    <div className="px-4 mb-6">
      <div className="flex items-center justify-between gap-3">
        <FiltersSheet
          filters={filters}
          total={total}
          amenityCounts={amenityCounts}
          districts={districts}
        />
        <SortMenu filters={filters} />
      </div>
      <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.1em] text-mute tabular-nums" aria-live="polite">
        {t('results', { count: total })}
      </p>
    </div>
  );
}
