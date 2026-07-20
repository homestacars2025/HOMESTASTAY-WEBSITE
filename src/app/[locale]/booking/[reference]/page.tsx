import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Clock, ShieldCheck } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { Link } from '@/i18n/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { readBookingCookie } from '@/lib/booking/cookie';
import { CardPaymentForm } from '@/components/booking/CardPaymentForm';

/**
 * Booking result.
 *
 * AUTHORISATION: a booking reference is a short, human-readable, guessable
 * string (HP-0835-0001). It is a display key, NOT a credential. The page
 * therefore authorises against the signed httpOnly cookie this server set
 * when the hold was created, and 404s on any mismatch — an unauthorised
 * visitor must not even learn whether a reference exists.
 *
 * NEVER says "confirmed" before the owner has approved. Paid means paid; it
 * does not mean the stay is secured, and implying otherwise to a guest who
 * has just been charged would be the worst lie this site could tell.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

interface PageProps {
  params: Promise<{ locale: string; reference: string }>;
}

export default async function BookingResultPage({ params }: PageProps) {
  const { locale, reference } = await params;
  const t = await getTranslations({ locale, namespace: 'booking.result' });

  const cookieBookingId = await readBookingCookie();
  if (!cookieBookingId) notFound();

  const supabase = createAdminClient();

  const { data: booking } = await supabase
    .from('bookings')
    // amount_charged_try / fx_rate_used are written by lock_booking_fx at hold
    // time, so they are already present before this page can ever be reached.
    .select('id, booking_reference, status, paid_at, total_amount_usd, amount_charged_try, fx_rate_used, check_in, check_out, guests_count, owner_decision_due_at')
    .eq('booking_reference', reference)
    .maybeSingle();

  // The cookie must point at THIS booking. Anything else is someone reading
  // a reference that is not theirs.
  if (!booking || booking.id !== cookieBookingId) notFound();

  // The TRY figure actually charged lives on the payment attempt, not on the
  // booking — it is the contractual amount for that specific attempt and is
  // never recomputed from the USD total (a refund must replay it exactly).
  const { data: payment } = await supabase
    .from('booking_payments')
    .select('amount_try, fx_rate_used, paid_at')
    .eq('booking_id', booking.id)
    .eq('status', 'paid')
    .maybeSingle();

  const isPaid = Boolean(booking.paid_at);

  const usd = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale, {
    style: 'currency', currency: 'USD', maximumFractionDigits: 2,
  });
  const tryFmt = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale, {
    style: 'currency', currency: 'TRY', maximumFractionDigits: 2,
  });

  const totalUsd = num(booking.total_amount_usd);

  // Before payment: the locked figure on the booking. After payment: the
  // figure on the attempt that actually settled — a refund must replay that
  // exact number, so the attempt wins once one exists.
  const lockedTry  = num(booking.amount_charged_try);
  const amountTry  = num(payment?.amount_try) ?? lockedTry;

  return (
    <div className="min-h-screen bg-paper">
      <Header />

      <main className="max-w-[600px] mx-auto px-4 pt-12 pb-24">
        {/* Reference — large, first, because it is the one thing a guest
            needs to quote back to us if anything goes wrong. */}
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-mute mb-3">
          {t('referenceLabel')}
        </p>
        <p className="text-[clamp(1.75rem,6vw,2.5rem)] font-medium tracking-[-0.04em] text-ink leading-none mb-8 tabular-nums">
          {booking.booking_reference}
        </p>

        {isPaid ? (
          <>
            {/* Status — deliberately NOT "confirmed" */}
            <div className="border border-rule rounded-[14px] p-5 mb-4">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 mt-[2px] shrink-0 text-stay" aria-hidden />
                <div>
                  <p className="text-[15px] font-medium text-ink mb-1">
                    {t('awaitingApproval')}
                  </p>
                  <p className="text-[13px] text-ink-soft leading-relaxed">
                    {t('awaitingApprovalBody')}
                  </p>
                </div>
              </div>
            </div>

            {/* Amount actually charged, with the USD equivalent beside it */}
            {amountTry !== null && (
              <div className="border border-rule rounded-[14px] p-5 mb-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-3">
                  {t('chargedLabel')}
                </p>
                <p className="text-[1.5rem] font-semibold text-ink tabular-nums leading-none">
                  {tryFmt.format(amountTry)}
                </p>
                {totalUsd !== null && (
                  <p className="mt-2 text-[13px] text-mute">
                    {t('usdEquivalent', { amount: usd.format(totalUsd) })}
                  </p>
                )}
              </div>
            )}

            {/* Refund terms — stated before they have to ask */}
            <div className="border border-rule rounded-[14px] p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 mt-[2px] shrink-0 text-ink-soft" aria-hidden />
                <div>
                  <p className="text-[15px] font-medium text-ink mb-1">
                    {t('refundTitle')}
                  </p>
                  <p className="text-[13px] text-ink-soft leading-relaxed">
                    {t('refundBody')}
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Held, not yet paid — the payment step. */
          <>
            <div className="border border-rule rounded-[14px] p-5 mb-6">
              <p className="text-[15px] font-medium text-ink mb-1">
                {t('heldTitle')}
              </p>
              <p className="text-[13px] text-ink-soft leading-relaxed">
                {t('heldBody')}
              </p>
              {/* Ön Bilgilendirme §3: the guest sees the exact TRY figure
                  that will be charged, with the USD it was quoted in beside
                  it, BEFORE consenting. TRY is primary because TRY is what
                  leaves their account. */}
              {lockedTry !== null && (
                <p className="mt-3 flex flex-wrap items-baseline gap-2">
                  <span className="text-[1.5rem] font-semibold text-stay tabular-nums leading-none">
                    {tryFmt.format(lockedTry)}
                  </span>
                  {totalUsd !== null && (
                    <span className="text-[13px] text-mute tabular-nums">
                      ({usd.format(totalUsd)})
                    </span>
                  )}
                </p>
              )}
              {booking.fx_rate_used !== null && booking.fx_rate_used !== undefined && (
                <p className="mt-2 text-xs text-mute">
                  {t('lockedRate', { rate: String(booking.fx_rate_used) })}
                </p>
              )}
            </div>

            {/* No amount is passed to the bank from here — the charged figure
                is read server-side from the payment attempt. This label is
                display only. */}
            <CardPaymentForm
              locale={locale}
              amountLabel={lockedTry !== null ? tryFmt.format(lockedTry) : ''}
            />
          </>
        )}

        <div className="mt-8">
          <Link
            href="/stays"
            className="inline-flex items-center justify-center bg-ink text-white rounded-[999px] px-6 py-3 text-sm font-medium min-h-[44px] transition-opacity duration-[240ms] hover:opacity-80"
          >
            {t('browseMore')}
          </Link>
        </div>
      </main>
    </div>
  );
}

/** PostgREST can hand `numeric` back as a string; coerce once, here. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
