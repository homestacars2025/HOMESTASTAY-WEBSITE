import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AlertCircle } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { Link } from '@/i18n/navigation';

/**
 * Payment could not be completed.
 *
 * Separate route rather than a query flag on /booking/[reference], because
 * several failure paths have no reference to show — and because the two most
 * serious reasons here are not "payment failed" at all: they are "you were
 * charged and we owe you a refund". Those must never be softened into a
 * generic error, and must never be mixed in with a success layout.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/** Reasons where money moved and a refund is owed. */
const MONEY_MOVED = new Set(['duplicate_payment', 'booking_canceled', 'pending']);

const KNOWN = new Set([
  'session', 'server', 'card', 'bank', 'declined', 'unknown',
  'pending', 'duplicate_payment', 'booking_canceled',
  'already_paid', 'not_holdable', 'not_found',
]);

export default async function BookingFailedPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reason?: string }>;
}) {
  const { locale } = await params;
  const { reason } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'booking.failed' });

  const key = reason && KNOWN.has(reason) ? reason : 'unknown';
  const moneyMoved = MONEY_MOVED.has(key);

  return (
    <div className="min-h-screen bg-paper">
      <Header />

      <main className="max-w-[600px] mx-auto px-4 pt-16 pb-24">
        <div className="flex items-start gap-3 mb-6">
          <AlertCircle className="w-6 h-6 mt-1 shrink-0 text-stay" aria-hidden />
          <h1 className="text-[clamp(1.5rem,4.5vw,2rem)] font-medium tracking-[-0.035em] leading-tight text-ink">
            {moneyMoved ? t('chargedTitle') : t('title')}
          </h1>
        </div>

        <p className="text-[15px] text-ink-soft leading-relaxed mb-4">
          {t(`reasons.${key}`)}
        </p>

        {/* Said plainly and early. A guest who has been charged for a stay
            they will not get needs to know the money is coming back before
            they need to ask for it. */}
        {moneyMoved && (
          <div className="border border-rule rounded-[14px] bg-paper-warm p-5 mb-6">
            <p className="text-[13px] text-ink-soft leading-relaxed">
              {t('refundAssurance')}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-3 mt-8">
          <Link
            href="/stays"
            className="inline-flex items-center justify-center bg-ink text-white rounded-[999px] px-6 py-3 text-sm font-medium min-h-[44px] transition-opacity duration-[240ms] hover:opacity-80"
          >
            {t('browseStays')}
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center border border-rule text-ink rounded-[999px] px-6 py-3 text-sm font-medium min-h-[44px] transition-colors duration-[240ms] hover:bg-paper-warm"
          >
            {t('contactUs')}
          </Link>
        </div>
      </main>
    </div>
  );
}
