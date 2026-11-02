'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Calendar } from 'lucide-react';
import { RequestOfferModal } from '@/components/offer/RequestOfferModal';
import { parseISODateLocal } from '@/components/offer/dates';
import type { DateRange } from '@/components/home/DateRangePicker';

interface RequestOfferCardProps {
  unitId: string;
  unitTitle: string;
  siteKey: string;
  /** Dates / guests the guest arrived with — prefilled, never re-asked. */
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?: number;
}

function formatDate(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, { day: 'numeric', month: 'short' }).format(d);
}

/**
 * The booking box of a PRICE-ON-REQUEST unit — the normal widget's shape
 * (sticky side card on desktop, bottom bar on a phone, the same dates + guests
 * summary), with "Price on request" where the price would be and "Request an
 * offer" where "Reserve" would be. No price is ever fetched here: the
 * database quotes nothing for these units.
 *
 * The dates and guests live HERE, so what the guest picks — in the box or in
 * the request form — is what the form opens with next time.
 */
export function RequestOfferCard({ unitId, unitTitle, siteKey, initialCheckIn, initialCheckOut, initialGuests }: RequestOfferCardProps) {
  const t = useTranslations('offer');
  const tCard = useTranslations('card');
  const tUnit = useTranslations('unit');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange>(() =>
    initialCheckIn && initialCheckOut
      ? { from: parseISODateLocal(initialCheckIn), to: parseISODateLocal(initialCheckOut) }
      : { from: undefined });
  const [adults, setAdults] = useState(initialGuests && initialGuests > 0 ? initialGuests : 2);
  const [children, setChildren] = useState(0);

  const checkInLabel = range.from ? formatDate(range.from, locale) : null;
  const checkOutLabel = range.to ? formatDate(range.to, locale) : null;
  const guestLabel = tUnit('guestCount', { count: adults + children });

  const cta = (extra: string) => (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`bg-stay text-white rounded-[999px] text-sm font-semibold transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80 ${extra}`}
    >
      {t('requestOffer')}
    </button>
  );

  return (
    <>
      <aside className="hidden lg:block sticky top-6 border border-rule rounded-[14px] p-6 bg-white shadow-sm">
        <p className="text-xl font-medium tracking-[-0.02em] text-ink mb-1">{tCard('priceOnRequest')}</p>
        <p className="text-xs text-ink-soft leading-relaxed mb-5">{t('cardHint')}</p>

        {/* Dates + guests — the same summary as the booking widget; it opens
            the picker (the request form, with these prefilled). */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full border border-rule rounded-[14px] overflow-hidden mb-3 text-sm text-start hover:bg-paper-warm/50 transition-colors duration-[240ms]"
          aria-label={t('modalTitle')}
        >
          <div className="grid grid-cols-2">
            <div className="p-3 border-e border-rule">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] rtl:tracking-normal text-mute mb-1.5">{tUnit('checkIn')}</p>
              <p className={`truncate ${checkInLabel ? 'text-ink' : 'text-mute'}`}>{checkInLabel ?? tUnit('addDates')}</p>
            </div>
            <div className="p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] rtl:tracking-normal text-mute mb-1.5">{tUnit('checkOut')}</p>
              <p className={`truncate ${checkOutLabel ? 'text-ink' : 'text-mute'}`}>{checkOutLabel ?? tUnit('addDates')}</p>
            </div>
          </div>
          <div className="p-3 border-t border-rule flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] rtl:tracking-normal text-mute mb-1.5">{tUnit('guestsLabel')}</p>
              <p className="truncate text-ink">{guestLabel}</p>
            </div>
            <Calendar className="w-4 h-4 text-mute shrink-0 ms-2" aria-hidden="true" />
          </div>
        </button>

        {cta('w-full py-3 min-h-12')}
        <p className="mt-3 text-xs text-mute text-center leading-relaxed">{t('intro')}</p>
      </aside>

      <div
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white border-t border-rule"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between gap-4 px-4 py-3 max-w-screen-xl mx-auto">
          <button type="button" onClick={() => setOpen(true)} className="min-w-0 text-start">
            <span className="block text-sm font-medium text-ink">{tCard('priceOnRequest')}</span>
            <span className="block truncate text-xs text-mute">
              {checkInLabel && checkOutLabel ? `${checkInLabel} – ${checkOutLabel} · ${guestLabel}` : tUnit('addDates')}
            </span>
          </button>
          {cta('px-6 py-2.5 min-h-11 shrink-0')}
        </div>
      </div>

      {open && (
        <RequestOfferModal
          unitId={unitId}
          unitTitle={unitTitle}
          siteKey={siteKey}
          initialRange={range}
          initialAdults={adults}
          initialChildren={children}
          onRangeChange={setRange}
          onAdultsChange={setAdults}
          onChildrenChange={setChildren}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
