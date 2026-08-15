import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ChevronLeft } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { Link } from '@/i18n/navigation';
import { BookingFlow } from '@/components/booking/BookingFlow';
import { getPublicUnitBySlug } from '@/lib/queries/stays';
import { quoteStay } from '@/app/[locale]/stays/[slug]/actions';
import { isRealDate } from '@/lib/stays/search-params';
import { getBookingAccount } from '@/lib/booking/account';

/**
 * Checkout — details form, then payment.
 *
 * A real route rather than a modal step, deliberately. The 3D Secure flow
 * leaves the site as a full top-level redirect (the bank has banned iframes
 * since 31.12.2022) and comes back as a cross-site POST. A modal would not
 * survive that round trip, and the guest would land back on a page with no
 * context at the most anxious moment of the whole flow.
 *
 * Requires NO account. Booking is deliberately open to guests — CLAUDE.md §4.
 */

export const dynamic = 'force-dynamic';

/** Transactional and per-guest. Must never be indexed or sent as a referrer. */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ from?: string; to?: string; guests?: string }>;
}

export default async function BookPage({ params, searchParams }: PageProps) {
  const { locale, slug } = await params;
  const { from, to, guests } = await searchParams;

  const unit = await getPublicUnitBySlug(slug, locale);
  if (!unit) notFound();

  // Null for an anonymous visitor — booking without an account stays supported
  // (CLAUDE.md §4). When there IS one, these details are the booking's
  // identity and the form renders them locked rather than editable.
  const account = await getBookingAccount();

  // Dates arrive in the URL so the page is shareable, resumable and
  // back-button-safe. They are re-validated here because a URL is user input:
  // create_booking_hold will reject bad values anyway, but sending a guest
  // into a form that cannot possibly succeed is worse than sending them back.
  const checkIn  = from && isRealDate(from) ? from : null;
  const checkOut = to   && isRealDate(to)   ? to   : null;

  if (!checkIn || !checkOut || checkIn >= checkOut) {
    redirect(`/${locale}/stays/${slug}`);
  }

  const parsedGuests = Number.parseInt(guests ?? '1', 10);
  const initialGuests =
    Number.isFinite(parsedGuests) && parsedGuests > 0 ? parsedGuests : 1;

  const t = await getTranslations({ locale, namespace: 'booking' });

  // Live quote — the same resolver that will price the booking, so what the
  // guest reads here and what create_booking_hold derives cannot disagree.
  // Never a nightly rate multiplied by nights.
  const quote = await quoteStay(unit.id, checkIn, checkOut);

  const title = unit.ad_title ?? unit.unit_name ?? slug;
  const nights = quote?.nights ?? null;

  const dateFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const money = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale, {
    style: 'currency', currency: 'USD', maximumFractionDigits: 2,
  });

  return (
    <div className="min-h-screen bg-paper">
      <Header />

      <main className="max-w-[900px] mx-auto px-4 pt-8 pb-24">
        <Link
          href={`/stays/${slug}`}
          className="inline-flex items-center gap-1 text-[13px] text-mute hover:text-ink transition-colors duration-[240ms] mb-6"
        >
          {/* Mirrors automatically in Arabic via the logical-property flip */}
          <ChevronLeft className="w-4 h-4 rtl:rotate-180" aria-hidden />
          {t('backToListing')}
        </Link>

        <h1 className="text-[clamp(1.6rem,4.5vw,2.25rem)] font-medium tracking-[-0.035em] leading-[0.95] text-ink mb-8">
          {t('heading')}
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-10 items-start">
          {/* Details form */}
          <div className="order-2 lg:order-1">
            <BookingFlow
              account={account}
              unitId={unit.id}
              checkIn={checkIn}
              checkOut={checkOut}
              initialGuests={initialGuests}
              maxGuests={unit.specifications.max_guests}
              minNights={unit.min_nights}
            />
          </div>

          {/* Stay summary — sticky beside the form on desktop, above it on mobile */}
          <aside className="order-1 lg:order-2 lg:sticky lg:top-8">
            <div className="border border-rule rounded-[14px] p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-4">
                {t('summary.title')}
              </p>

              <p className="text-[15px] font-medium text-ink leading-snug mb-4">
                {title}
              </p>

              <dl className="flex flex-col gap-3 text-[13px] border-t border-rule pt-4">
                <Row label={t('summary.checkIn')}  value={dateFmt.format(new Date(`${checkIn}T00:00:00`))} />
                <Row label={t('summary.checkOut')} value={dateFmt.format(new Date(`${checkOut}T00:00:00`))} />
                {nights !== null && (
                  <Row label={t('summary.nights')} value={String(nights)} />
                )}
              </dl>

              {quote?.total_usd !== null && quote?.total_usd !== undefined ? (
                <div className="border-t border-rule mt-4 pt-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] text-ink-soft">{t('summary.total')}</span>
                    <span className="text-[1.25rem] font-semibold text-stay tabular-nums">
                      {money.format(quote.total_usd)}
                    </span>
                  </div>
                  {/* §9: prices are quoted in USD; the TRY figure actually
                      charged is fixed at payment and shown before the bank. */}
                  <p className="mt-2 text-xs text-mute leading-relaxed">
                    {t('summary.tryNote')}
                  </p>
                </div>
              ) : (
                <div className="border-t border-rule mt-4 pt-4">
                  {/* No price beats a wrong price — same degradation as the
                      detail page when the quote fails. */}
                  <p className="text-xs text-mute leading-relaxed">
                    {t('summary.noQuote')}
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-mute">{label}</dt>
      <dd className="text-ink text-end">{value}</dd>
    </div>
  );
}
