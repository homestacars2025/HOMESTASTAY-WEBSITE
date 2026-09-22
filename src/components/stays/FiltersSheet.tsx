'use client';

import Image from 'next/image';
import { useMemo, useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { SlidersHorizontal, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { PriceRange } from './PriceRange';
import { countStaysAction } from '@/app/[locale]/stays/filter-actions';
import { buildStaysQuery } from '@/lib/stays/search-params';
import {
  AMENITY_FILTERS,
  PRICE_MAX,
  PRICE_MIN,
  amenityIconSrc,
  countSheetFilters,
  type AmenityFilter,
  type StaysFilters,
} from '@/lib/stays/filters';

/** A district chip, already localised on the server. */
export interface DistrictOption {
  key: string;
  label: string;
  count: number;
}

interface Draft {
  priceMin: number;
  priceMax: number;
  amenities: AmenityFilter[];
  district?: string;
}

function draftFrom(filters: StaysFilters): Draft {
  return {
    priceMin: filters.priceMin ?? PRICE_MIN,
    priceMax: filters.priceMax ?? PRICE_MAX,
    amenities: filters.amenities ?? [],
    district: filters.district,
  };
}

/** The applied search with the sheet's part swapped for the draft. Ends = no bound. */
function withDraft(filters: StaysFilters, d: Draft): StaysFilters {
  return {
    ...filters,
    priceMin: d.priceMin > PRICE_MIN ? d.priceMin : undefined,
    priceMax: d.priceMax < PRICE_MAX ? d.priceMax : undefined,
    amenities: d.amenities.length ? d.amenities : undefined,
    district: d.district,
  };
}

/** en → en-GB, as everywhere else on the site (British English, £-style spacing). */
function intlLocale(locale: string): string {
  return locale === 'en' ? 'en-GB' : locale;
}

/**
 * The filter sheet: price, amenities and — when the chosen city has them —
 * districts. Type, city, dates and guests live in the search bar and the chip
 * row; they ride along untouched.
 *
 * Nothing filters until "Show N stays": the sheet edits a draft, and the count
 * on the button is re-asked of the server (debounced) as the draft changes, so
 * the guest knows what they will get before they commit. Applying writes the
 * URL — the page, not this component, runs the search.
 *
 * A native <dialog>: focus is trapped, Esc closes, the page behind is inert,
 * and none of it costs a dependency. Bottom sheet on a phone, with the primary
 * action anchored at the bottom (Law 5); side panel on desktop.
 */
export function FiltersSheet({
  filters,
  total,
  amenityCounts,
  districts,
}: {
  filters: StaysFilters;
  total: number;
  amenityCounts: Record<AmenityFilter, number>;
  districts: DistrictOption[];
}) {
  const t = useTranslations('filters');
  const locale = useLocale();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [draft, setDraft] = useState<Draft>(() => draftFrom(filters));
  const [live, setLive] = useState<{ total: number; amenityCounts: Record<AmenityFilter, number> } | null>(null);
  const [counting, startCounting] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef(0);

  const number = useMemo(
    () => new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }),
    [locale],
  );
  /**
   * "$400" — exactly as the unit cards print a price, in every language.
   *
   * Not Intl's currency style: Arabic locale data renders USD as "40 US$"
   * (symbol after, and "US$" not "$"), which then no longer matches the card
   * it is filtering. The number itself still goes through Intl (§6). Each
   * amount is wrapped in a left-to-right isolate (U+2066 … U+2069) so "$40"
   * cannot be reordered to "40$" inside Arabic text, while the "min – max"
   * range around it still reads in the page's direction.
   */
  const formatPrice = (value: number, isTop: boolean) =>
    `\u2066$${number.format(value)}${isTop ? '+' : ''}\u2069`;

  const active = countSheetFilters(filters);
  const shownTotal = live?.total ?? total;
  const counts = live?.amenityCounts ?? amenityCounts;
  const priceAtEnds = draft.priceMin <= PRICE_MIN && draft.priceMax >= PRICE_MAX;

  function open() {
    setDraft(draftFrom(filters));
    setLive(null);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  /** Update the draft and re-count it — debounced, last request wins. */
  function update(next: Draft) {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const id = ++request.current;
      const query = buildStaysQuery(withDraft(filters, next)).replace(/^\?/, '');
      startCounting(async () => {
        try {
          const result = await countStaysAction(query);
          if (id === request.current) setLive(result);
        } catch {
          // A failed count leaves the last known number; applying still works.
        }
      });
    }, 250);
  }

  function toggleAmenity(a: AmenityFilter) {
    const set = new Set(draft.amenities);
    if (set.has(a)) set.delete(a);
    else set.add(a);
    update({ ...draft, amenities: AMENITY_FILTERS.filter((x) => set.has(x)) });
  }

  function apply() {
    close();
    router.push(`/stays${buildStaysQuery(withDraft(filters, draft))}` as '/stays');
  }

  function clearAll() {
    update({ priceMin: PRICE_MIN, priceMax: PRICE_MAX, amenities: [], district: undefined });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-2 h-11 rounded-full border px-4 text-sm font-medium transition-colors duration-[240ms] ${
          active > 0 ? 'border-ink text-ink' : 'border-rule text-ink hover:border-ink-soft'
        }`}
      >
        <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
        {t('button')}
        {active > 0 && (
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-ink text-white text-[11px] font-medium tabular-nums">
            {active}
          </span>
        )}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="filters-title"
        // Backdrop click: the dialog element itself is the target only when the
        // press lands outside its content box.
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="filter-sheet fixed m-0 p-0 max-w-none bg-white text-ink backdrop:bg-ink/40
          inset-x-0 bottom-0 top-auto w-full max-h-[88dvh] rounded-t-[14px]
          sm:inset-y-0 sm:h-dvh sm:max-h-dvh sm:w-[440px] sm:rounded-none"
      >
        <div className="flex flex-col max-h-[88dvh] sm:h-dvh sm:max-h-dvh">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 px-5 h-14 border-b border-rule shrink-0">
            <h2 id="filters-title" className="text-base font-medium tracking-[-0.015em]">
              {t('title')}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label={t('close')}
              className="-me-2 inline-flex items-center justify-center w-11 h-11 rounded-full text-ink-soft hover:bg-paper-warm transition-colors duration-[240ms]"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-6 space-y-9">
            {/* Price */}
            <section aria-labelledby="filters-price">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <h3 id="filters-price" className="font-mono text-[11px] uppercase tracking-[0.1em] text-mute">
                  {t('price.title')}
                </h3>
                <p className="text-sm font-medium tabular-nums text-ink" aria-live="polite">
                  {priceAtEnds
                    ? t('price.any')
                    : `${formatPrice(draft.priceMin, false)} – ${formatPrice(draft.priceMax, draft.priceMax >= PRICE_MAX)}`}
                </p>
              </div>
              <PriceRange
                min={draft.priceMin}
                max={draft.priceMax}
                onChange={(priceMin, priceMax) => update({ ...draft, priceMin, priceMax })}
                minLabel={t('price.min')}
                maxLabel={t('price.max')}
                format={formatPrice}
              />
              {/* Hidden, not removed, at the ends — the line keeps its height
                  so the sections below don't jump as a thumb leaves an end. */}
              <p className={`text-xs text-mute leading-snug ${priceAtEnds ? 'invisible' : ''}`}>
                {t('price.approx')}
              </p>
            </section>

            {/* Amenities */}
            <section aria-labelledby="filters-amenities">
              <h3 id="filters-amenities" className="font-mono text-[11px] uppercase tracking-[0.1em] text-mute mb-3">
                {t('amenities.title')}
              </h3>
              <div className="flex flex-wrap gap-2">
                {AMENITY_FILTERS.map((a) => {
                  const on = draft.amenities.includes(a);
                  // Adding an amenity no result has can only empty the page;
                  // the chip stays visible with its 0, but cannot be switched on.
                  const dead = !on && counts[a] === 0;
                  return (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={on}
                      disabled={dead}
                      onClick={() => toggleAmenity(a)}
                      // Selected = red outline + red text on white. Never a red
                      // fill: the 3D icons are cut to their silhouette, and a
                      // coloured fill would redraw the box they were cut from.
                      className={`inline-flex items-center gap-2 min-h-11 rounded-full border bg-white ps-1.5 pe-3.5 py-1 text-sm transition-colors duration-[240ms] disabled:opacity-40 disabled:cursor-not-allowed ${
                        on ? 'border-stay text-stay' : 'border-rule text-ink hover:border-ink-soft'
                      }`}
                    >
                      <Image
                        src={amenityIconSrc(a)}
                        alt=""
                        width={32}
                        height={32}
                        unoptimized
                        className="w-8 h-8 object-contain"
                      />
                      <span>{t(`amenities.${a}`)}</span>
                      <span className={`font-mono text-[11px] tabular-nums ${on ? 'text-stay' : 'text-mute'}`}>
                        {number.format(counts[a])}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Districts — only for a city that has them (Istanbul today). */}
            {districts.length > 0 && (
              <section aria-labelledby="filters-district">
                <h3 id="filters-district" className="font-mono text-[11px] uppercase tracking-[0.1em] text-mute mb-3">
                  {t('district.title')}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {[{ key: undefined, label: t('district.any'), count: null }, ...districts].map((d) => {
                    const on = draft.district === d.key;
                    return (
                      <button
                        key={d.key ?? '_any'}
                        type="button"
                        aria-pressed={on}
                        onClick={() => update({ ...draft, district: d.key })}
                        className={`inline-flex items-center gap-2 min-h-11 rounded-full border bg-white px-4 text-sm transition-colors duration-[240ms] ${
                          on ? 'border-stay text-stay' : 'border-rule text-ink hover:border-ink-soft'
                        }`}
                      >
                        {d.label}
                        {d.count !== null && (
                          <span className={`font-mono text-[11px] tabular-nums ${on ? 'text-stay' : 'text-mute'}`}>
                            {number.format(d.count)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* Footer — the primary action, anchored to the bottom. */}
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-rule shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={clearAll}
              className="h-11 px-2 -ms-2 text-sm font-medium text-ink underline underline-offset-4 decoration-rule hover:decoration-ink transition-colors duration-[240ms]"
            >
              {t('clearAll')}
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={shownTotal === 0}
              aria-busy={counting}
              className="h-12 rounded-full bg-stay px-6 text-sm font-medium text-white transition-opacity duration-[240ms] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className={counting ? 'opacity-60' : undefined}>
                {t('show', { count: shownTotal })}
              </span>
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
