'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Calendar } from 'lucide-react';
import { BrandMark } from '@/components/brand/BrandMark';
import { BookingModal } from '@/components/unit/BookingModal';
import { PaymentModesDialog } from '@/components/unit/PaymentModesDialog';
import { quoteStay, quotePaymentModesAction, quoteUnitServicesAction } from '@/app/[locale]/stays/[slug]/actions';
import { ServicesPicker, ExtrasLine, toSelections, type ServicesSelectionMap } from '@/components/unit/ServicesPicker';
import type { ServicesQuote, UnitService } from '@/lib/services/types';
import type { PaymentModeQuote } from '@/lib/booking/payment-mode';
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
  /** Dates/guests carried in the URL from the search, so the guest never
   *  re-picks what they already chose. ISO strings; only a valid pair applies. */
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?:   number;
  /** Server-resolved quote for the initial dates (date-aware total), so the
   *  price is correct on first paint without a client round-trip. */
  initialQuote?:    UnitPricing | null;
  /** The owner allows a deposit here — surfaced as a line, never a figure:
   *  the split is priced by the database at checkout, not in the browser. */
  allowDeposit?:    boolean;
  /** More than one mode on offer is the only case where the explainer has
   *  anything to explain, and therefore the only case where it appears. */
  allowFullPrepay?: boolean;
  allowPayAtArrival?: boolean;
  /** Priced modes for the dates the page was opened with (server-side). */
  initialModeQuote?: PaymentModeQuote | null;
  /** The unit's extra services (public_unit_services). Empty hides the add-ons. */
  services?: UnitService[];
}

// ── Component ──────────────────────────────────────────────────────────────────

/** ISO yyyy-mm-dd → local Date at midday (avoids a TZ shift rolling the day). */
function parseISODateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function BookingCard({
  pricing, minNights, rating, reviewCount, unitId, unitTitle, slug,
  initialCheckIn, initialCheckOut, initialGuests, initialQuote, allowDeposit,
  allowFullPrepay, allowPayAtArrival, initialModeQuote,
  services = [],
}: BookingCardProps) {
  const t      = useTranslations('unit');
  const locale = useLocale();

  // ── State ──────────────────────────────────────────────────────────────────

  const [dateRange,   setDateRange]   = useState<DateRange>(() =>
    initialCheckIn && initialCheckOut
      ? { from: parseISODateLocal(initialCheckIn), to: parseISODateLocal(initialCheckOut) }
      : { from: undefined });
  const [guests,      setGuests]      = useState(
    initialGuests && initialGuests > 0 ? initialGuests : 1);
  const [modalOpen,   setModalOpen]   = useState(false);
  const [initialStep, setInitialStep] = useState<'pick' | 'confirm'>('pick');

  // Live quote for the chosen dates. Seeded with the server-resolved quote for
  // the initial dates when present (so the total is right on first paint),
  // otherwise the representative rate. Replaced whenever a complete range exists.
  // Prices are always derived — nothing here is ever cached.
  const [quote, setQuote]      = useState<UnitPricing>(initialQuote ?? pricing);
  const [isQuoting, startQuote] = useTransition();
  /** The priced modes for the chosen dates. Null until there are dates. */
  const [modeQuote, setModeQuote] = useState<PaymentModeQuote | null>(initialModeQuote ?? null);
  /** The explainer, and whether this unit has already shown it this session. */
  const [explainOpen, setExplainOpen] = useState(false);
  const depositUsd = modeQuote?.allowDeposit ? modeQuote.depositUsd : null;

  // ── Extras (display only — never sent to checkout yet) ─────────────────────
  const [servicesSelected, setServicesSelected] = useState<ServicesSelectionMap>({});
  const [servicesQuote,    setServicesQuote]    = useState<ServicesQuote | null>(null);
  const [isQuotingServices, startServicesQuote] = useTransition();
  // Selections can change faster than quotes return; only the latest request
  // may write its answer, or a slow early reply would overwrite a newer one.
  const servicesRequest = useRef(0);

  /** Re-quote the extras for the current dates, guests and ticks. */
  function refreshServices(r: DateRange, guestCount: number, selected: ServicesSelectionMap) {
    if (services.length === 0) return;
    const request = ++servicesRequest.current;
    if (!r.from || !r.to) {
      setServicesQuote(null);
      return;
    }
    const from = toISODate(r.from);
    const to   = toISODate(r.to);
    startServicesQuote(async () => {
      const q = await quoteUnitServicesAction(unitId, from, to, guestCount, toSelections(selected), locale);
      if (request === servicesRequest.current) setServicesQuote(q);
    });
  }

  function handleServicesChange(next: ServicesSelectionMap) {
    setServicesSelected(next);
    refreshServices(dateRange, guests, next);
  }

  function handleGuestsChange(n: number) {
    setGuests(n);
    refreshServices(dateRange, n, servicesSelected);
  }

  /**
   * Re-quote for a date range. Called from event handlers rather than an
   * effect: this is a user action producing new data, not a subscription.
   * A failed quote falls back to the representative rate with no total —
   * showing no price is safer than showing a stale or guessed one.
   */
  function refreshQuote(r: DateRange) {
    if (!r.from || !r.to) {
      setQuote(pricing);
      setModeQuote(null);
      return;
    }
    const from = toISODate(r.from);
    const to   = toISODate(r.to);
    startQuote(async () => {
      // Both prices for the same dates, in one round trip's worth of waiting.
      // The deposit is only asked for where the owner offers it.
      const [q, modes] = await Promise.all([
        quoteStay(unitId, from, to),
        allowDeposit || allowPayAtArrival
          ? quotePaymentModesAction(unitId, from, to)
          : Promise.resolve(null),
      ]);
      setQuote(q ?? { ...pricing, total_usd: null, nights: null });
      setModeQuote(modes);
    });
  }

  /**
   * Reserve was pressed.
   *
   * A unit offering BOTH modes explains itself once per session before the
   * booking flow opens; every other unit goes straight through, exactly as
   * before. "Once per unit, per session" is sessionStorage: a guest who comes
   * back to the same listing five minutes later has already read it, and a new
   * tab or a new visit is a new conversation.
   *
   * Storage can throw (private mode, blocked site data), so a failure to
   * remember degrades to showing it again — never to blocking the booking.
   */
  const explainKey = `homesta:modes-explained:${unitId}`;

  function handleReserve() {
    const offered = [allowFullPrepay, allowDeposit, allowPayAtArrival].filter(Boolean).length;
    if (offered < 2) {
      setModalOpen(true);
      return;
    }
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(explainKey) === '1';
    } catch { /* no session storage — show it, which is the safe direction */ }

    if (seen) {
      setModalOpen(true);
      return;
    }
    try {
      window.sessionStorage.setItem(explainKey, '1');
    } catch { /* not remembering is survivable; not booking is not */ }
    setExplainOpen(true);
  }

  function handleDateRangeChange(r: DateRange) {
    setDateRange(r);
    refreshQuote(r);
    refreshServices(r, guests, servicesSelected);
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
        <p className={`mb-1 transition-opacity duration-[240ms] ${isQuoting ? 'opacity-50' : ''}`}>
          <span className="text-2xl font-semibold text-stay">${nightlyUsd}</span>
          <span className="text-mute text-sm ms-1.5">{t('perNight')}</span>
        </p>
      )}

      {/* The deposit option, stated where the price is — but with no figures:
          the split is the database's to price at checkout, and this card has
          no dates yet in the common case. */}
      {allowDeposit ? (
        <p className="mb-5 text-xs text-ink-soft leading-relaxed">{t('depositAvailable')}</p>
      ) : (
        <div className="mb-5" />
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

      {/* The deposit, once there are dates to price it for. A tempter, not a
          control: the reserve button is unchanged and the choice itself is
          made at checkout, where the full split and the policy are shown. */}
      {depositUsd !== null && (
        <p className="mb-3 ps-1 text-[13px] font-medium text-stay leading-snug">
          {t('booking.depositTeaser', { amount: `\u2066$${depositUsd.toFixed(2)}\u2069` })}
        </p>
      )}

      {/* Add-ons — selectable here, quoted live as their own line, and
          carried to checkout in the URL where the database prices them in. */}
      {services.length > 0 && (
        <div className="mb-4 border-t border-rule pt-4 flex flex-col gap-3">
          <ServicesPicker services={services} selected={servicesSelected} onChange={handleServicesChange} />
          <ExtrasLine totalUsd={hasDates ? servicesQuote?.total_usd ?? null : null} pending={isQuotingServices} />
        </div>
      )}

      {/* Reserve CTA */}
      <button
        type="button"
        onClick={handleReserve}
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
          onClick={handleReserve}
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

      {explainOpen && (
        <PaymentModesDialog
          modes={{
            fullPrepay: allowFullPrepay !== false,
            deposit: allowDeposit === true,
            payAtArrival: allowPayAtArrival === true,
          }}
          quote={modeQuote}
          onContinue={() => setModalOpen(true)}
          onClose={() => setExplainOpen(false)}
        />
      )}

      {modalOpen && (
        <BookingModal
          unitTitle={unitTitle}
          slug={slug}
          pricing={quote}
          minNights={minNights}
          dateRange={dateRange}
          guests={guests}
          onDateRangeChange={handleDateRangeChange}
          onGuestsChange={handleGuestsChange}
          services={services}
          servicesSelected={servicesSelected}
          onServicesChange={handleServicesChange}
          servicesTotalUsd={servicesQuote?.total_usd ?? null}
          servicesPending={isQuotingServices}
          initialStep={initialStep}
          onClose={handleClose}
        />
      )}
    </>
  );
}
