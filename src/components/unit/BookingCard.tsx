'use client';

import { useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Calendar } from 'lucide-react';
import { BrandMark } from '@/components/brand/BrandMark';
import { BookingModal } from '@/components/unit/BookingModal';
import { quoteStay } from '@/app/[locale]/stays/[slug]/actions';
import { toISODate } from '@/lib/stays/search-params';
import type { UnitPricing } from '@/lib/types/unit';
import type { DateRange } from '@/components/home/DateRangePicker';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    day: 'numeric',
    month: 'short',
  }).format(d);
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface BookingCardProps {
  /** Server-resolved representative rate for this page load. Re-quoted live
   *  once the guest picks dates — never a stored or cached price. */
  pricing:     UnitPricing;
  minNights:   number;
  rating:      number | null;
  reviewCount: number | null;
  unitId:      string;
  unitTitle:   string;
  /** URL segment for the checkout route (/book/{slug}). */
  slug:        string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function BookingCard({ pricing, minNights, rating, reviewCount, unitId, unitTitle, slug }: BookingCardProps) {
  const t      = useTranslations('unit');
  const locale = useLocale();

  // ── State ──────────────────────────────────────────────────────────────────

  const [dateRange,   setDateRange]   = useState<DateRange>({ from: undefined });
  const [guests,      setGuests]      = useState(1);
  const [modalOpen,   setModalOpen]   = useState(false);
  const [initialStep, setInitialStep] = useState<'pick' | 'confirm'>('pick');

  // Live quote for the chosen dates. Starts as the representative rate the
  // server resolved for this page load, and is replaced whenever a complete
  // range exists. Prices are always derived — nothing here is ever cached.
  const [quote, setQuote]      = useState<UnitPricing>(pricing);
  const [isQuoting, startQuote] = useTransition();

  /**
   * Re-quote for a date range. Called from event handlers rather than an
   * effect: this is a user action producing new data, not a subscription.
   * A failed quote falls back to the representative rate with no total —
   * showing no price is safer than showing a stale or guessed one.
   */
  function refreshQuote(r: DateRange) {
    if (!r.from || !r.to) {
      setQuote(pricing);
      return;
    }
    const from = toISODate(r.from);
    const to   = toISODate(r.to);
    startQuote(async () => {
      const q = await quoteStay(unitId, from, to);
      setQuote(q ?? { ...pricing, total_usd: null, nights: null });
    });
  }

  function handleDateRangeChange(r: DateRange) {
    setDateRange(r);
    refreshQuote(r);
  }

  // Reset initialStep each time modal closes so re-opening starts at 'pick'
  function handleClose() {
    setModalOpen(false);
    setInitialStep('pick');
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const checkInLabel  = dateRange.from ? formatDate(dateRange.from, locale) : null;
  const checkOutLabel = dateRange.to   ? formatDate(dateRange.to,   locale) : null;
  const guestLabel    = t('guestCount', { count: guests });

  const nightsCount = dateRange.from && dateRange.to
    ? Math.round((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const minNightsText = `${minNights} ${minNights === 1 ? t('specs.nightMin') : t('specs.nightsMin')}`;
  const showMinNote   = minNights > 1;
  const isBelowMin    = nightsCount !== null && nightsCount < minNights;

  const hasDates   = !!dateRange.from;
  const nightlyUsd = quote.nightly_usd;

  // ── Desktop sticky card ──────────────────────────────────────────────────

  const desktopCard = (
    <aside className="hidden lg:block sticky top-6 border border-rule rounded-[14px] p-6 bg-white shadow-sm">

      {/* Price — live-resolved; dims while a new quote is in flight */}
      {nightlyUsd !== null && (
        <p className={`mb-5 transition-opacity duration-[240ms] ${isQuoting ? 'opacity-50' : ''}`}>
          <span className="text-2xl font-semibold text-stay">${nightlyUsd}</span>
          <span className="text-mute text-sm ms-1.5">{t('perNight')}</span>
        </p>
      )}

      {/* Summary display — clicking opens the modal */}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="w-full border border-rule rounded-[14px] overflow-hidden mb-3 text-sm text-start hover:bg-paper-warm/50 transition-colors duration-[240ms]"
        aria-label={t('booking.modalTitle')}
      >
        <div className="grid grid-cols-2">
          <div className="p-3 border-e border-rule">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute mb-1.5">
              {t('checkIn')}
            </p>
            <p className={`truncate ${checkInLabel ? 'text-ink' : 'text-mute'}`}>
              {checkInLabel ?? t('addDates')}
            </p>
          </div>
          <div className="p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute mb-1.5">
              {t('checkOut')}
            </p>
            <p className={`truncate ${checkOutLabel ? 'text-ink' : 'text-mute'}`}>
              {checkOutLabel ?? t('addDates')}
            </p>
          </div>
        </div>
        <div className="p-3 border-t border-rule flex items-center justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute mb-1.5">
              {t('guestsLabel')}
            </p>
            <p className="truncate text-ink">{guestLabel}</p>
          </div>
          <Calendar className="w-4 h-4 text-mute shrink-0 ms-2" />
        </div>
      </button>

      {/* Min-nights note */}
      {showMinNote && (
        <p className={`text-xs mb-3 ps-1 ${isBelowMin ? 'text-stay' : 'text-mute'}`}>
          {minNightsText}
        </p>
      )}

      {/* Reserve CTA */}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="w-full bg-stay text-white rounded-[999px] py-3 text-sm font-semibold transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80"
      >
        {hasDates ? t('booking.continue') : t('reserve')}
      </button>

      {/* Rating */}
      {rating !== null && (
        <div className="mt-4 flex items-center justify-center gap-1 text-xs text-mute">
          <BrandMark className="w-[10px] h-[10px]" />
          <span className="tabular-nums">{rating.toFixed(2)}</span>
          {reviewCount !== null && (
            <span>· {reviewCount} {t('reviews')}</span>
          )}
        </div>
      )}
    </aside>
  );

  // ── Mobile: fixed bottom bar ─────────────────────────────────────────────

  const mobileBar = (
    <div
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white border-t border-rule"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3 max-w-screen-xl mx-auto">
        <div>
          {nightlyUsd !== null && (
            <p className={`transition-opacity duration-[240ms] ${isQuoting ? 'opacity-50' : ''}`}>
              <span className="text-[1.1rem] font-semibold text-stay">${nightlyUsd}</span>
              <span className="text-mute text-xs ms-1">{t('perNight')}</span>
            </p>
          )}
          {rating !== null && (
            <p className="text-xs text-mute flex items-center gap-1 mt-0.5">
              <BrandMark className="w-[9px] h-[9px]" />
              <span className="tabular-nums">{rating.toFixed(2)}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="bg-stay text-white rounded-[999px] px-6 py-2.5 text-sm font-semibold transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80 shrink-0"
        >
          {t('reserve')}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {desktopCard}
      {mobileBar}

      {modalOpen && (
        <BookingModal
          unitTitle={unitTitle}
          slug={slug}
          pricing={quote}
          minNights={minNights}
          dateRange={dateRange}
          guests={guests}
          onDateRangeChange={handleDateRangeChange}
          onGuestsChange={setGuests}
          initialStep={initialStep}
          onClose={handleClose}
        />
      )}
    </>
  );
}
