'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { commitPayAtArrivalAction } from '@/app/[locale]/booking/[reference]/actions';

/**
 * "Send the request" — the pay-at-arrival equivalent of paying.
 *
 * No money moves and no card is involved: this asks the database to commit
 * the booking, which is what puts the request in front of the owner and
 * starts their 12-hour window. Everything after that is the same as a paid
 * booking — the owner approves or declines, and the guest is told.
 *
 * The booking is identified by the signed httpOnly cookie, never by anything
 * this form sends, so there is nothing here a caller could point at someone
 * else's booking.
 */
export function ArrivalRequestForm() {
  const t = useTranslations('booking.result');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const result = await commitPayAtArrivalAction();
      if (result.ok) {
        // The page re-reads the booking and switches to "awaiting approval".
        router.refresh();
        return;
      }
      setError(
        t.has(`arrivalRequestError.${result.status}`)
          ? t(`arrivalRequestError.${result.status}`)
          : t('arrivalRequestError.generic'),
      );
    });
  }

  return (
    <div>
      {error && (
        <div className="flex items-start gap-2.5 mb-4 text-[13px] text-stay leading-relaxed">
          <AlertCircle className="w-4 h-4 mt-[2px] shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full min-h-12 rounded-[999px] bg-stay px-6 text-sm font-semibold text-white transition-opacity duration-[240ms] hover:opacity-90 disabled:opacity-60"
      >
        {pending ? t('arrivalRequestSending') : t('arrivalRequestSubmit')}
      </button>
    </div>
  );
}
