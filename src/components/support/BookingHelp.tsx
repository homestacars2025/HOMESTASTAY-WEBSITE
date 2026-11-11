import { useTranslations } from 'next-intl';
import { LifeBuoy } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { newRequestHref } from '@/lib/support/model';
import { OUTLINE_PILL } from './parts';

/**
 * "Need help with this booking?" on the booking page — each link opens a new
 * support request already set to the right topic and to THIS booking. A guest
 * who is not signed in goes through sign-in and lands back on the same
 * prefilled form; the database checks the booking is theirs.
 */
export function BookingHelp({ bookingId, checkInRelevant }: { bookingId: string; checkInRelevant: boolean }) {
  const t = useTranslations('support.help');
  const links: { key: string; category: string }[] = [
    { key: 'getHelp', category: 'guest_booking_question' },
    // Refund help stays even on a canceled booking — that is when it is asked.
    { key: 'cancelRefund', category: 'guest_cancel_refund' },
    // "Can't check in" only once there is a confirmed stay to check in to.
    ...(checkInRelevant ? [{ key: 'checkIn', category: 'guest_check_in' }] : []),
  ];
  return (
    <section aria-labelledby="booking-help-title" className="border border-rule rounded-[14px] p-5 mt-4">
      <div className="flex items-start gap-3">
        <LifeBuoy className="w-5 h-5 mt-[2px] shrink-0 text-ink-soft" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="booking-help-title" className="text-[15px] font-medium text-ink mb-1">
            {t('title')}
          </h2>
          <p className="text-[13px] text-ink-soft leading-relaxed">{t('body')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {links.map((l) => (
              <Link key={l.key} href={newRequestHref({ category: l.category, booking: bookingId })} className={OUTLINE_PILL}>
                {t(l.key)}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** The one link under a failed payment: a payment request about this booking. */
export function PaymentHelpLink({ bookingId }: { bookingId: string }) {
  const t = useTranslations('support.help');
  return (
    <Link
      href={newRequestHref({ category: 'guest_payment', booking: bookingId })}
      className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-ink underline underline-offset-4"
    >
      <LifeBuoy className="w-4 h-4" aria-hidden="true" />
      {t('payment')}
    </Link>
  );
}
