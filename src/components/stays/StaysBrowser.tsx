'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, List, Map as MapIcon, X } from 'lucide-react';
import { UnitCard } from '@/components/home/UnitCard';
import { CategoryRow, type ChipItem, type ChipKey } from './CategoryRow';
import { FiltersSheet, type DistrictOption } from './FiltersSheet';
import { SortMenu } from './SortMenu';
import { SearchTracker } from '@/components/analytics/SearchTracker';
import type { Bounds, MapUnit } from './StaysMap';
import { CATEGORIES } from '@/lib/stays/categories';
import { AMENITY_FILTERS, type AmenityFilter, type StaysFilters } from '@/lib/stays/filters';
import { buildStaysQueryWithPage } from '@/lib/stays/search-params';
import type { StayCard } from '@/lib/queries/stays';

// The map (mapbox-gl, ~1/2 MB) is fetched the first time it is opened — never
// for a guest who only uses the list.
const StaysMap = dynamic(() => import('./StaysMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-paper-warm" />,
});

const PAGE_SIZE = 24;
/** Cards in the first row on the widest grid — loaded eagerly as LCP. */
const EAGER = 4;
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

interface StaysBrowserProps {
  /** Every unit matching the search (category NOT applied), in sort order. */
  cards: StayCard[];
  /** The search without its category — what every chip shares. */
  filters: StaysFilters;
  initialCategory: ChipKey;
  initialPage: number;
  districts: DistrictOption[];
}

function inside(b: Bounds, p: { lat: number; lng: number }): boolean {
  const [w, s, e, n] = b;
  return p.lat >= s && p.lat <= n && (w <= e ? p.lng >= w && p.lng <= e : p.lng >= w || p.lng <= e);
}

/**
 * /stays results with the category chips filtering ON THE CLIENT, and the
 * same results on a map.
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
 * MAP: "List | Map" (desktop: the map beside the list; phone: a floating
 * "Map" button opens it full screen). It draws exactly the list above — no
 * second search logic — and "Search this area" narrows the list to what the
 * map shows, in memory. Units without coordinates stay in the list, and the
 * map says how many it cannot show.
 *
 * Dates, guests, city, price and sort still go through the server (the sheet,
 * the sort menu and the search bar navigate as before): availability must be
 * live. Only the category and the map area are client-side.
 */
export function StaysBrowser({ cards, filters, initialCategory, initialPage, districts }: StaysBrowserProps) {
  const tCat = useTranslations('categories');
  const t = useTranslations('pages.stays');
  const tFilters = useTranslations('filters');
  const tCard = useTranslations('card');
  const locale = useLocale();

  const [activeChip, setActiveChip] = useState<ChipKey>(initialCategory);
  const [category, setCategory] = useState<ChipKey>(initialCategory);
  const [page, setPage] = useState(initialPage);
  const [, startTransition] = useTransition();
  const gridTop = useRef<HTMLDivElement>(null);

  const [mapOpen, setMapOpen] = useState(false);
  const [area, setArea] = useState<Bounds | null>(null);
  const [moved, setMoved] = useState<Bounds | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rtl, setRtl] = useState(false);
  useEffect(() => { setRtl(document.documentElement.dir === 'rtl'); }, []);

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

  const byChip = useMemo(
    () => (category === 'all' ? cards : cards.filter((c) => c.category === category)),
    [cards, category],
  );
  // "Search this area": the list narrowed to the map's bounds, in memory.
  const filtered = useMemo(
    () => (area ? byChip.filter((c) => c.geo && inside(area, c.geo)) : byChip),
    [byChip, area],
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

  // ── Map data — the same list, as points ───────────────────────────────────
  const money = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
    [locale],
  );
  const mapUnits: MapUnit[] = useMemo(() => {
    if (!mapOpen) return [];
    return filtered.flatMap((c, i) => (c.geo ? [{
      id: c.id,
      lat: c.geo.lat,
      lng: c.geo.lng,
      title: c.ad_title ?? c.unit_name ?? '—',
      price: c.pricing.nightly_usd !== null ? money.format(c.pricing.nightly_usd) : null,
      guests: c.guests,
      cover: (c.media.find((m) => m.is_cover) ?? c.media[0])?.public_url ?? null,
      href: `/stays/${c.slug ?? c.id}${searchQuery ? `?${searchQuery}` : ''}`,
      position: i + 1,
    }] : []));
  }, [mapOpen, filtered, money, searchQuery]);
  const offMap = useMemo(() => filtered.filter((c) => !c.geo).length, [filtered]);
  const fitKey = `${JSON.stringify(filters)}|${category}`;

  // Full-screen map on a phone: the page behind it must not scroll.
  useEffect(() => {
    if (!mapOpen || window.matchMedia('(min-width: 768px)').matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mapOpen]);

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
      setArea(null);
      setMoved(null);
    });
  }

  function goToPage(next: number) {
    writeUrl(category, next);
    setPage(next);
    gridTop.current?.scrollIntoView({ block: 'start' });
  }

  function searchArea() {
    if (!moved) return;
    setArea(moved);
    setMoved(null);
    setPage(1);
    writeUrl(category, 1);
  }

  const pill =
    'inline-flex items-center gap-1.5 rounded-[999px] border border-rule px-5 py-2.5 text-sm font-medium text-ink-soft transition-colors duration-[240ms] hover:text-ink hover:border-ink-soft';
  const pillOff =
    'inline-flex items-center gap-1.5 rounded-[999px] border border-rule px-5 py-2.5 text-sm font-medium text-mute opacity-40 cursor-not-allowed';
  const seg = (on: boolean) =>
    `inline-flex min-h-11 items-center gap-1.5 rounded-[999px] px-4 text-sm font-medium transition-colors duration-[240ms] ${
      on ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'
    }`;

  return (
    <>
      <SearchTracker filters={filters} category={category} ids={filtered.slice(0, 24).map((c) => c.id)} />
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
          <div className="flex items-center gap-2">
            {MAPBOX_TOKEN && (
              <div role="group" aria-label={t('map.toggle')} className="hidden md:inline-flex items-center rounded-[999px] border border-rule p-1">
                <button type="button" aria-pressed={!mapOpen} onClick={() => setMapOpen(false)} className={seg(!mapOpen)}>
                  <List className="w-4 h-4" aria-hidden="true" />
                  {t('map.list')}
                </button>
                <button type="button" aria-pressed={mapOpen} onClick={() => setMapOpen(true)} className={seg(mapOpen)}>
                  <MapIcon className="w-4 h-4" aria-hidden="true" />
                  {t('map.map')}
                </button>
              </div>
            )}
            <SortMenu filters={liveFilters} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-mute tabular-nums" aria-live="polite">
            {tFilters('results', { count: filtered.length })}
          </p>
          {area && (
            <button
              type="button"
              onClick={() => { setArea(null); setPage(1); }}
              className="inline-flex items-center gap-1 rounded-[999px] bg-paper-warm px-3 py-1 text-xs font-medium text-ink"
            >
              {t('map.area')}
              <X className="w-3.5 h-3.5" aria-label={t('map.clearArea')} />
            </button>
          )}
        </div>
      </div>

      <div className={mapOpen ? 'md:flex md:items-start md:gap-6 md:pe-4' : ''}>
        <div className={mapOpen ? 'md:flex-1 md:min-w-0' : ''}>
          {visible.length === 0 ? (
            <p className="px-4 py-16 text-center text-mute text-sm">{t('noResults')}</p>
          ) : (
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-6 px-4 ${mapOpen ? 'md:pe-0' : 'lg:grid-cols-3 xl:grid-cols-4'}`}>
              {visible.map((unit, i) => (
                <div
                  key={unit.id}
                  onMouseEnter={mapOpen ? () => setActiveId(unit.id) : undefined}
                  onMouseLeave={mapOpen ? () => setActiveId(null) : undefined}
                >
                  <UnitCard
                    unit={unit}
                    searchQuery={searchQuery}
                    priority={safePage === 1 && i < EAGER}
                    prefetchOnIntent
                    source="results"
                    position={(safePage - 1) * PAGE_SIZE + i + 1}
                  />
                </div>
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
        </div>

        {mapOpen && MAPBOX_TOKEN && (
          // Phone: full screen above everything. Desktop: a sticky column
          // beside the list.
          <div className="fixed inset-0 z-[60] bg-paper md:inset-auto md:z-auto md:sticky md:top-24 md:w-[42%] md:shrink-0 md:h-[calc(100vh-7rem)] md:rounded-[14px] md:overflow-hidden md:border md:border-rule">
            <div className="relative h-full w-full">
              <StaysMap
                units={mapUnits}
                token={MAPBOX_TOKEN}
                fitKey={fitKey}
                activeId={activeId}
                onActive={setActiveId}
                onUserMove={setMoved}
                rtl={rtl}
                labels={{
                  perNight: tCard('perNight'),
                  sleeps: (n) => t('map.sleeps', { count: n }),
                  close: t('map.close'),
                }}
              />

              {moved && (
                <button
                  type="button"
                  onClick={searchArea}
                  className="absolute top-4 inset-x-0 mx-auto w-max z-10 inline-flex min-h-11 items-center rounded-[999px] bg-white px-5 text-sm font-medium text-ink shadow-[0_4px_16px_rgba(0,0,0,0.16)] transition-opacity duration-[240ms] hover:opacity-90"
                >
                  {t('map.searchArea')}
                </button>
              )}

              {offMap > 0 && (
                <p className="absolute bottom-20 inset-x-0 mx-auto w-max max-w-[85%] z-10 rounded-[999px] bg-white/95 px-3 py-1.5 text-xs text-ink-soft shadow-sm md:bottom-3 md:inset-x-auto md:mx-0 md:start-3">
                  {t('map.notShown', { count: offMap })}
                </p>
              )}

              <button
                type="button"
                onClick={() => setMapOpen(false)}
                className="md:hidden absolute bottom-6 inset-x-0 mx-auto w-max z-10 inline-flex min-h-11 items-center gap-2 rounded-[999px] bg-ink px-5 text-sm font-medium text-white shadow-[0_4px_16px_rgba(0,0,0,0.24)]"
              >
                <List className="w-4 h-4" aria-hidden="true" />
                {t('map.list')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Phone: the floating "Map" button, bottom-centre like the list it opens over. */}
      {MAPBOX_TOKEN && !mapOpen && filtered.length > 0 && (
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          className="md:hidden fixed bottom-6 inset-x-0 mx-auto w-max z-30 inline-flex min-h-11 items-center gap-2 rounded-[999px] bg-ink px-5 text-sm font-medium text-white shadow-[0_4px_16px_rgba(0,0,0,0.24)]"
        >
          <MapIcon className="w-4 h-4" aria-hidden="true" />
          {t('map.map')}
        </button>
      )}
    </>
  );
}
