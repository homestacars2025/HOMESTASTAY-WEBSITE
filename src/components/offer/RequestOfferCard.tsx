'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RequestOfferModal } from '@/components/offer/RequestOfferModal';
import { parseISODateLocal } from '@/components/offer/dates';

interface RequestOfferCardProps {
  unitId: string;
  unitTitle: string;
  siteKey: string;
  /** Dates / guests the guest arrived with — prefilled, never re-asked. */
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?: number;
}

/**
 * The booking card of a PRICE-ON-REQUEST unit: no price anywhere, one action —
 * "Request an offer". Same places as BookingCard (sticky side card on desktop,
 * bottom bar on a phone) so the page keeps its shape.
 */
export function RequestOfferCard({ unitId, unitTitle, siteKey, initialCheckIn, initialCheckOut, initialGuests }: RequestOfferCardProps) {
  const t = useTranslations('offer');
  const tCard = useTranslations('card');
  const [open, setOpen] = useState(false);

  const initialRange = initialCheckIn && initialCheckOut
    ? { from: parseISODateLocal(initialCheckIn), to: parseISODateLocal(initialCheckOut) }
    : undefined;

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
        <p className="text-xl font-medium tracking-[-0.02em] text-ink mb-2">{tCard('priceOnRequest')}</p>
        <p className="text-sm text-ink-soft leading-relaxed mb-5">{t('cardHint')}</p>
        {cta('w-full py-3 min-h-12')}
        <p className="mt-3 text-xs text-mute text-center leading-relaxed">{t('intro')}</p>
      </aside>

      <div
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white border-t border-rule"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between gap-4 px-4 py-3 max-w-screen-xl mx-auto">
          <p className="text-sm font-medium text-ink">{tCard('priceOnRequest')}</p>
          {cta('px-6 py-2.5 min-h-11 shrink-0')}
        </div>
      </div>

      {open && (
        <RequestOfferModal
          unitId={unitId}
          unitTitle={unitTitle}
          siteKey={siteKey}
          initialRange={initialRange}
          initialAdults={initialGuests}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
