'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RequestOfferModal } from '@/components/offer/RequestOfferModal';
import { parseISODateLocal } from '@/components/offer/dates';

/** "Request an offer" for one room of a hotel page — the price-on-request twin of "View & book". */
export function RequestOfferButton({
  unitId, unitTitle, siteKey, checkIn, checkOut, guests, className,
}: {
  unitId: string;
  unitTitle: string;
  siteKey: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  className?: string;
}) {
  const t = useTranslations('offer');
  const [open, setOpen] = useState(false);
  const initialRange = checkIn && checkOut ? { from: parseISODateLocal(checkIn), to: parseISODateLocal(checkOut) } : undefined;
  return (
    <>
      <button type="button" data-unit={unitId} data-src="hotel" onClick={() => setOpen(true)} className={className}>
        {t('requestOffer')}
      </button>
      {open && (
        <RequestOfferModal
          unitId={unitId}
          unitTitle={unitTitle}
          siteKey={siteKey}
          initialRange={initialRange}
          initialAdults={guests}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
