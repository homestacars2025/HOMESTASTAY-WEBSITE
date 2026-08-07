'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import { Search, Calendar, Users, ChevronDown, X } from 'lucide-react';
import dynamic from 'next/dynamic';
// Locale-aware router: a plain next/navigation push would drop the /ar prefix.
import { useRouter } from '@/i18n/navigation';
import { buildStaysQuery, toISODate } from '@/lib/stays/search-params';
import { BrandMark } from '@/components/brand/BrandMark';
import { GuestsStepper } from '@/components/shared/GuestsStepper';
import type { DateRange } from './DateRangePicker';

// ── Types ──────────────────────────────────────────────────────────────────────

type SearchCity = {
  id: string;
  name: string;
  localizedName: string;
};

export interface SearchBarProps {
  cities: SearchCity[];
  /** Pre-fills the bar from the active /stays filters, so a search reads back. */
  initial?: {
    cityId?: string;
    guests?: number;
    dateRange?: DateRange;
  };
}

type OpenPanel = 'city' | 'date' | 'guests' | null;

// ── Dynamic import — calendar CSS + JS only load when panel first opens ────────

const DateRangePicker = dynamic(
  () => import('./DateRangePicker').then((m) => ({ default: m.DateRangePicker })),
  { ssr: false }
);

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatRange(range: DateRange, locale: string): string {
  if (!range.from) return '';
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
      day: 'numeric',
      month: 'short',
    }).format(d);
  if (!range.to) return fmt(range.from);
  return `${fmt(range.from)} – ${fmt(range.to)}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ClearButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ms-auto shrink-0 text-mute hover:text-ink transition-colors duration-[240ms]"
      aria-label="Clear"
    >
      <X className="w-3.5 h-3.5" />
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SearchBar({ cities, initial }: SearchBarProps) {
  const t      = useTranslations('search');
  const locale = useLocale();
  const router = useRouter();

  const [cityId,    setCityId]    = useState(initial?.cityId ?? '');
  const [dateRange, setDateRange] = useState<DateRange>(initial?.dateRange ?? { from: undefined });
  const [guests,    setGuests]    = useState(initial?.guests ?? 1);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  /** Set only after a search is attempted with no city — never on first paint. */
  const [showWhereError, setShowWhereError] = useState(false);
  // Portal anchor: fixed coords computed from the relevant trigger element
  const [portalPos, setPortalPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted,   setMounted]   = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const whoRef       = useRef<HTMLButtonElement>(null);   // anchor for guests panel
  const panelRef     = useRef<HTMLDivElement>(null);

  // Hydration guard — portals require the DOM
  useEffect(() => { setMounted(true); }, []);

  /** One path for picking a city, so the validation message always clears. */
  const chooseCity = useCallback((id: string) => {
    setCityId(id);
    setShowWhereError(false);
    setOpenPanel(null);
  }, []);

  const selectedCity = cities.find((c) => c.id === cityId);
  const dateLabel    = formatRange(dateRange, locale);

  // Run the search: state -> /stays?city=…&guests=…&checkIn=…&checkOut=…
  // The city travels as its name rather than its uuid — /stays?city=istanbul is
  // legible, shareable and indexable, where a uuid is none of those.
  // Dates only go if both ends are set; one date can't describe a stay.
  const runSearch = useCallback(() => {
    // WHERE IS REQUIRED. When/Who stay optional — a guest browsing a city with
    // no dates in mind is a real search; a search with no place is not, it is
    // just the whole catalogue with extra steps.
    //
    // The button is not inertly disabled: a dead control explains nothing.
    // Clicking without a city opens the Where panel AND states why, so the
    // next action is obvious instead of guessable.
    if (!selectedCity) {
      setShowWhereError(true);
      setOpenPanel('city');
      return;
    }

    const query = buildStaysQuery({
      city: selectedCity.name,
      guests,
      checkIn: dateRange.from ? toISODate(dateRange.from) : undefined,
      checkOut: dateRange.to ? toISODate(dateRange.to) : undefined,
    });
    setShowWhereError(false);
    setOpenPanel(null);
    router.push(`/stays${query}`);
  }, [router, selectedCity, guests, dateRange]);
  // Show guest count in the Who field only after user changes from the default
  const guestLabel   = guests > 1 ? t('guestCount', { count: guests }) : null;

  // ── Compute panel position ─────────────────────────────────────────────────
  // City and date panels span the full search bar width.
  // Guests panel is anchored to just the Who button.

  const toggle = useCallback((panel: OpenPanel) => {
    const next     = openPanel === panel ? null : panel;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    // Mobile: all panels rendered inline — no portal needed.
    // Desktop: compute anchor position synchronously at the top level so both
    // setState calls commit in the same React render.
    if (!isMobile) {
      if (next === 'guests') {
        const el    = whoRef.current ?? containerRef.current;
        const isWho = !!whoRef.current;
        if (el) {
          const r     = el.getBoundingClientRect();
          const width = isWho ? Math.max(r.width, 200) : r.width;
          const left  = isWho ? Math.max(8, r.right - width) : r.left;
          setPortalPos({ top: r.bottom + 8, left, width });
        }
      } else if (next && containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        setPortalPos({ top: r.bottom + 8, left: r.left, width: r.width });
      }
    } else {
      setPortalPos(null);
    }

    setOpenPanel(next);
  }, [openPanel]);

  // ── Close on outside click, Escape, or scroll ─────────────────────────────

  useEffect(() => {
    if (!openPanel) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenPanel(null);
    }
    function onMouse(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpenPanel(null);
      }
    }
    function onScroll() { setOpenPanel(null); }

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouse);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onMouse);
      window.removeEventListener('scroll', onScroll);
    };
  }, [openPanel]);

  // ── Portal panel content ───────────────────────────────────────────────────

  const CityPanelContent = (
    <div
      role="listbox"
      className="bg-white rounded-[14px] border border-rule shadow-[0_8px_40px_rgba(0,0,0,0.13)] overflow-hidden"
    >
      {cities.map((city) => (
        <button
          key={city.id}
          type="button"
          role="option"
          aria-selected={city.id === cityId}
          onClick={() => chooseCity(city.id)}
          className={`w-full flex items-center px-5 py-3.5 text-sm text-start transition-colors duration-[240ms] hover:bg-paper-warm ${
            city.id === cityId ? 'bg-paper-warm text-ink font-medium' : 'text-ink-soft'
          }`}
        >
          {city.localizedName}
        </button>
      ))}
    </div>
  );

  const DatePanelContent = (
    <div className="bg-white rounded-[14px] border border-rule shadow-[0_8px_40px_rgba(0,0,0,0.13)] p-4 md:p-5">
      <DateRangePicker
        selected={dateRange}
        onSelect={setDateRange}
        locale={locale}
      />
    </div>
  );

  const GuestsPanelContent = (
    <div className="bg-white rounded-[14px] border border-rule shadow-[0_8px_40px_rgba(0,0,0,0.13)] px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute leading-none mb-4">
        {t('whoLabel')}
      </p>
      <GuestsStepper
        value={guests}
        onChange={setGuests}
        decrementLabel={t('guestsDecrement')}
        incrementLabel={t('guestsIncrement')}
        inputLabel={t('whoLabel')}
      />
    </div>
  );

  // Render via portal so overflow:hidden / stacking-context ancestors can't clip it
  const portalPanel =
    mounted && openPanel && portalPos
      ? createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              top:   portalPos.top,
              left:  portalPos.left,
              width: portalPos.width,
              zIndex: 9999,
            }}
          >
            {openPanel === 'city'
              ? CityPanelContent
              : openPanel === 'date'
              ? DatePanelContent
              : GuestsPanelContent}
          </div>,
          document.body
        )
      : null;

  // ── Shared content builders ────────────────────────────────────────────────

  const desktopWhereInner = (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute leading-none mb-1">
        {t('whereLabel')}
      </p>
      <p className={`text-sm truncate ${selectedCity ? 'text-ink' : 'text-mute'}`}>
        {selectedCity ? selectedCity.localizedName : t('wherePlaceholder')}
      </p>
    </div>
  );

  const desktopWhenInner = (
    <div className="min-w-0 flex items-center gap-2 flex-1">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute leading-none mb-1">
          {t('whenLabel')}
        </p>
        <p className={`text-sm truncate ${dateLabel ? 'text-ink' : 'text-mute'}`}>
          {dateLabel || t('whenPlaceholder')}
        </p>
      </div>
      {dateLabel && (
        <ClearButton onClick={(e) => { e.stopPropagation(); setDateRange({ from: undefined }); }} />
      )}
    </div>
  );

  const desktopWhoInner = (
    <div className="min-w-0 flex items-center gap-2 flex-1">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute leading-none mb-1">
          {t('whoLabel')}
        </p>
        <p className={`text-sm truncate ${guestLabel ? 'text-ink' : 'text-mute'}`}>
          {guestLabel ?? t('whoPlaceholder')}
        </p>
      </div>
      {guestLabel && (
        <ClearButton onClick={(e) => { e.stopPropagation(); setGuests(1); }} />
      )}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div ref={containerRef} className="relative">

        {/* ── MOBILE: vertical stacked card (<md) ─────────────────────── */}
        <div className="md:hidden bg-white rounded-[14px] border border-rule shadow-[0_4px_28px_rgba(0,0,0,0.07)]">

          {/* Where */}
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={openPanel === 'city'}
            onClick={() => toggle('city')}
            className="w-full flex items-center gap-3 px-4 py-4 border-b border-rule text-start"
          >
            <BrandMark className="w-[18px] h-[18px] text-stay shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-0.5">
                {t('whereLabel')}
              </p>
              <p className={`text-sm truncate ${selectedCity ? 'text-ink' : 'text-mute'}`}>
                {selectedCity ? selectedCity.localizedName : t('wherePlaceholder')}
              </p>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-mute shrink-0 transition-transform duration-[240ms] ${
                openPanel === 'city' ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* City list — inline on mobile, anchored directly below the Where field */}
          {openPanel === 'city' && (
            <div className="border-b border-rule max-h-[60vh] overflow-y-auto">
              {cities.map((city) => (
                <button
                  key={city.id}
                  type="button"
                  role="option"
                  aria-selected={city.id === cityId}
                  onClick={() => chooseCity(city.id)}
                  className={`w-full flex items-center px-5 py-3.5 text-sm text-start transition-colors duration-[240ms] hover:bg-paper-warm ${
                    city.id === cityId ? 'bg-paper-warm text-ink font-medium' : 'text-ink-soft'
                  }`}
                >
                  {city.localizedName}
                </button>
              ))}
            </div>
          )}

          {/* When */}
          <button
            type="button"
            onClick={() => toggle('date')}
            className="w-full flex items-center gap-3 px-4 py-4 border-b border-rule text-start"
          >
            <Calendar className="w-[18px] h-[18px] text-mute shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-0.5">
                {t('whenLabel')}
              </p>
              <p className={`text-sm truncate ${dateLabel ? 'text-ink' : 'text-mute'}`}>
                {dateLabel || t('whenPlaceholder')}
              </p>
            </div>
            {dateLabel ? (
              <ClearButton onClick={(e) => { e.stopPropagation(); setDateRange({ from: undefined }); }} />
            ) : (
              <span className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
          </button>

          {/* Date picker — inline on mobile, anchored directly below the When field */}
          {openPanel === 'date' && (
            <div className="border-b border-rule p-4 overflow-y-auto max-h-[70vh]">
              <DateRangePicker
                selected={dateRange}
                onSelect={setDateRange}
                locale={locale}
              />
            </div>
          )}

          {/* Who */}
          <button
            type="button"
            onClick={() => toggle('guests')}
            className="w-full flex items-center gap-3 px-4 py-4 text-start"
          >
            <Users className="w-[18px] h-[18px] text-mute shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-0.5">
                {t('whoLabel')}
              </p>
              <p className={`text-sm truncate ${guestLabel ? 'text-ink' : 'text-mute'}`}>
                {guestLabel ?? t('whoPlaceholder')}
              </p>
            </div>
            {guestLabel ? (
              <ClearButton onClick={(e) => { e.stopPropagation(); setGuests(1); }} />
            ) : (
              <span className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
          </button>

          {/* Guests stepper — inline on mobile, anchored directly below the Who field */}
          {openPanel === 'guests' && (
            <div className="border-t border-rule px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute leading-none mb-4">
                {t('whoLabel')}
              </p>
              <GuestsStepper
                value={guests}
                onChange={setGuests}
                decrementLabel={t('guestsDecrement')}
                incrementLabel={t('guestsIncrement')}
                inputLabel={t('whoLabel')}
              />
            </div>
          )}

          {/* CTA */}
          <div className="px-4 pt-1 pb-4">
            <button
              type="button"
              onClick={runSearch}
              // aria-disabled, not `disabled`: the control stays focusable and
              // clickable so it can EXPLAIN the requirement. A disabled button
              // that silently ignores taps is the version guests file support
              // tickets about.
              aria-disabled={!selectedCity}
              className={`w-full flex items-center justify-center gap-2 bg-stay text-white rounded-[999px] py-3 text-sm font-medium transition-opacity duration-[240ms] ${
                selectedCity ? 'hover:opacity-90 active:opacity-80' : 'opacity-50'
              }`}
            >
              <Search className="w-4 h-4" />
              {t('cta')}
            </button>
            {showWhereError && (
              <p role="alert" className="mt-2 text-center text-xs text-stay">
                {t('whereRequired')}
              </p>
            )}
          </div>
        </div>

        {/* ── DESKTOP: horizontal pill (md+) ──────────────────────────── */}
        <div className="hidden md:flex items-center bg-white rounded-[999px] border border-rule shadow-[0_4px_28px_rgba(0,0,0,0.07)]">

          {/* Where */}
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={openPanel === 'city'}
            onClick={() => toggle('city')}
            className="flex items-center gap-2.5 flex-1 px-6 py-4 min-w-0 rounded-s-[999px] hover:bg-paper-warm/60 transition-colors duration-[240ms] text-start"
          >
            <BrandMark className="w-4 h-4 text-stay shrink-0" />
            {desktopWhereInner}
          </button>

          <div className="w-px h-8 bg-rule self-center shrink-0" aria-hidden="true" />

          {/* When */}
          <button
            type="button"
            onClick={() => toggle('date')}
            className="flex items-center gap-2.5 flex-1 px-6 py-4 min-w-0 hover:bg-paper-warm/60 transition-colors duration-[240ms] text-start"
          >
            <Calendar className="w-4 h-4 text-mute shrink-0" />
            {desktopWhenInner}
          </button>

          <div className="w-px h-8 bg-rule self-center shrink-0" aria-hidden="true" />

          {/* Who */}
          <button
            ref={whoRef}
            type="button"
            onClick={() => toggle('guests')}
            aria-expanded={openPanel === 'guests'}
            className="flex items-center gap-2.5 flex-1 px-6 py-4 min-w-0 hover:bg-paper-warm/60 transition-colors duration-[240ms] text-start"
          >
            <Users className="w-4 h-4 text-mute shrink-0" />
            {desktopWhoInner}
          </button>

          {/* Search button — inset pill */}
          <div className="p-2 shrink-0">
            <button
              type="button"
              onClick={runSearch}
              aria-disabled={!selectedCity}
              className={`flex items-center gap-2 bg-stay text-white rounded-[999px] px-5 py-3 text-sm font-medium whitespace-nowrap transition-opacity duration-[240ms] ${
                selectedCity ? 'hover:opacity-90 active:opacity-80' : 'opacity-50'
              }`}
            >
              <Search className="w-4 h-4" />
              {t('cta')}
            </button>
          </div>
        </div>

        {/* Desktop validation — absolute so adding it cannot shift the bar and
            nudge the page (Law 1: no layout shift). */}
        {showWhereError && (
          <p
            role="alert"
            className="hidden md:block absolute inset-x-0 top-full mt-2 text-center text-xs text-stay"
          >
            {t('whereRequired')}
          </p>
        )}

      </div>

      {/* Portal — rendered at document.body, escapes overflow:hidden + stacking contexts */}
      {portalPanel}
    </>
  );
}
