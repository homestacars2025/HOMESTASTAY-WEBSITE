'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { UnitCard } from '@/components/home/UnitCard';
import { CategoryRow, type ChipItem, type ChipKey } from './CategoryRow';
import { FiltersSheet, type DistrictOption } from './FiltersSheet';
import { SortMenu } from './SortMenu';
import { CATEGORIES } from '@/lib/stays/categories';
import { AMENITY_FILTERS, type AmenityFilter, type StaysFilters } from '@/lib/stays/filters';
import { buildStaysQueryWithPage } from '@/lib/stays/search-params';
import type { StayCard } from '@/lib/queries/stays';

const PAGE_SIZE = 24;
/** Cards in the first row on the widest grid — loaded eagerly as LCP. */
const EAGER = 4;

interface StaysBrowserProps {
  /** Every unit matching the search (category NOT applied), in sort order. */
  cards: StayCard[];
  /** The search without its category — what every chip shares. */
  filters: StaysFilters;
  initialCategory: ChipKey;
  initialPage: number;
  districts: DistrictOption[];
}

/**
 * /stays results with the category chips filtering ON THE CLIENT.
 *
 * The server sends the whole search once (~340 lean cards at most). A chip
 * tap then:
 *   1. lights the chip at once (its own state — optimistic, never waits);
 *   2. re-filters the in-memory list inside startTransition;
 *   3. rewrites the URL with history.replaceState — the same shareable,
 *      back-compatible ?type=… as before, but with no navigation, no server
 *      request, no skeleton and no scroll jump.
 * Pagination, the result count and the filter sheet's amenity counts are
 * worked out from the same list, so they follow the chip without a request.
 * Cards are keyed by unit id, so React reuses the ones that stay on screen.
 *
 * Dates, guests, city, price and sort still go through the server (the sheet,
 * the sort menu and the search bar navigate as before): availability must be
 * live. Only the category is client-side.
 */
export function StaysBrowser({ cards, filters, initialCategory, initialPage, districts }: StaysBrowserProps) {
  const tCat = useTranslations('categories');
  const t = useTranslations('pages.stays');
  const tFilters = useTranslations('filters');

  const [activeChip, setActiveChip] = useState<ChipKey>(initialCategory);
  const [category, setCategory] = useState<ChipKey>(initialCategory);
  const [page, setPage] = useState(initialPage);
  const [, startTransition] = useTransition();
  const gridTop = useRef<HTMLDivElement>(null);

  // Counts per chip from the list itself — no query. A chip with no units in
  // THIS search is hidden, unless it is the one the guest is on.
  const counts = useMemo(() => {
    const c = Object.fromEntries(CATEGORIES.map((k) => [k, 0])) as Record<(typeof CATEGORIES)[number], number>;
    for (const card of cards) if (card.category) c[card.category] += 1;
    return c;
  }, [cards]);

  const items: ChipItem[] = useMemo(() => {
    const list: ChipItem[] = [{ key: 'all', label: tCat('all') }];
    for (const k of CATEGORIES) if (counts[k] > 0 || activeChip === k) list.push({ key: k, label: tCat(k) });
    return list;
  }, [counts, activeChip, tCat]);

  const filtered = useMemo(
    () => (category === 'all' ? cards : cards.filter((c) => c.category === category)),
    [cards, category],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const amenityCounts = useMemo(() => {
    const out = Object.fromEntries(AMENITY_FILTERS.map((a) => [a, 0])) as Record<AmenityFilter, number>;
    for (const c of filtered) for (const a of c.amenities) out[a] += 1;
    return out;
  }, [filtered]);

  const liveFilters: StaysFilters = category === 'all' ? filters : { ...filters, category };
  const searchQuery = buildStaysQueryWithPage(liveFilters, safePage).replace(/^\?/, '');

  /** The URL follows the view, in place — never a navigation. */
  function writeUrl(nextCategory: ChipKey, nextPage: number) {
    const url = new URL(window.location.href);
    if (nextCategory === 'all') url.searchParams.delete('type');
    else url.searchParams.set('type', nextCategory);
    if (nextPage > 1) url.searchParams.set('page', String(nextPage));
    else url.searchParams.delete('page');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
  }

  function selectChip(key: ChipKey) {
    if (key === activeChip) return;
    setActiveChip(key);            // immediate
    writeUrl(key, 1);
    startTransition(() => {        // the grid, without blocking the tap
      setCategory(key);
      setPage(1);
    });
  }

  function goToPage(next: number) {
    writeUrl(category, next);
    setPage(next);
    gridTop.current?.scrollIntoView({ block: 'start' });
  }

  const pill =
    'inline-flex items-center gap-1.5 rounded-[999px] border border-rule px-5 py-2.5 text-sm font-medium text-ink-soft transition-colors duration-[240ms] hover:text-ink hover:border-ink-soft';
  const pillOff =
    'inline-flex items-center gap-1.5 rounded-[999px] border border-rule px-5 py-2.5 text-sm font-medium text-mute opacity-40 cursor-not-allowed';

  return (
    <>
      <div className="mb-8">
        <CategoryRow
          items={items}
          active={activeChip}
          onSelect={selectChip}
          ariaLabel={tCat('label')}
          carsLabel={tCat('cars')}
          newTabLabel={tCat('newTab')}
        />
      </div>

      <div ref={gridTop} className="px-4 mb-6 scroll-mt-4">
        <div className="flex items-center justify-between gap-3">
          <FiltersSheet filters={liveFilters} total={filtered.length} amenityCounts={amenityCounts} districts={districts} />
          <SortMenu filters={liveFilters} />
        </div>
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.1em] text-mute tabular-nums" aria-live="polite">
          {tFilters('results', { count: filtered.length })}
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-16 text-center text-mute text-sm">{t('noResults')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 px-4">
          {visible.map((unit, i) => (
            <UnitCard key={unit.id} unit={unit} searchQuery={searchQuery} priority={safePage === 1 && i < EAGER} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label={t('pagination.label')} className="flex items-center justify-center gap-3 px-4 pt-14">
          {safePage > 1 ? (
            <button type="button" onClick={() => goToPage(safePage - 1)} className={pill}>
              <ChevronLeft className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
              {t('pagination.previous')}
            </button>
          ) : (
            <span className={pillOff} aria-disabled="true">
              <ChevronLeft className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
              {t('pagination.previous')}
            </span>
          )}
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-mute tabular-nums">
            {t('pagination.status', { current: safePage, total: totalPages })}
          </span>
          {safePage < totalPages ? (
            <button type="button" onClick={() => goToPage(safePage + 1)} className={pill}>
              {t('pagination.next')}
              <ChevronRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
            </button>
          ) : (
            <span className={pillOff} aria-disabled="true">
              {t('pagination.next')}
              <ChevronRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
            </span>
          )}
        </nav>
      )}
    </>
  );
}
