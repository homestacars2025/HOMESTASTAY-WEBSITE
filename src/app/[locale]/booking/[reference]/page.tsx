import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Clock, ShieldCheck, Wallet } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { Link } from '@/i18n/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { readBookingCookie } from '@/lib/booking/cookie';
import { getWalletBalanceUsd } from '@/lib/queries/wallet';
import { CardPaymentForm } from '@/components/booking/CardPaymentForm';
import { LydPaymentForm } from '@/components/booking/LydPaymentForm';
import { WalletPaymentForm } from '@/components/booking/WalletPaymentForm';
import { PaymentMethodChoice } from '@/components/booking/PaymentMethodChoice';
import { isTlyncConfigured, parseAmountNote } from '@/lib/payment/tlync';
import { usdToLydRate, convertUsdToLyd } from '@/lib/payment/lyd-fx';
import { isLibyaEligible } from '@/lib/payment/libya';

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
  /** `pay` selects the gateway; `pending` is set by TLYNC's return redirect. */
  searchParams: Promise<{ pay?: string; pending?: string }>;
}

export default async function BookingResultPage({ params, searchParams }: PageProps) {
  const { locale, reference } = await params;
  const { pay, pending } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'booking.result' });

  const cookieBookingId = await readBookingCookie();
  if (!cookieBookingId) notFound();

  const supabase = createAdminClient();

  const { data: booking } = await supabase
    .from('bookings')
    // amount_charged_try / fx_rate_used are written by lock_booking_fx at hold
    // time, so they are already present before this page can ever be reached.
    // customers(email) rides along for the wallet offer below — the same
    // identity pay_booking_from_wallet checks, asked once, in this query.
    .select('id, booking_reference, status, paid_at, total_amount_usd, amount_charged_try, fx_rate_used, check_in, check_out, guests_count, owner_decision_due_at, customers(email, nationality, phone)')
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
    .select('amount_try, amount_usd, fx_rate_used, paid_at, payment_gateway, amount_lyd, response_message')
    .eq('booking_id', booking.id)
    .eq('status', 'paid')
    .maybeSingle();

  const isPaid = Boolean(booking.paid_at);

  // ── The LYD option ────────────────────────────────────────────────────────
  // Priced here, not in the form, so the figure the guest consents to is the
  // one the server derives. Unavailable when TLYNC is unconfigured or no
  // USD→LYD rate exists — the option then does not render at all, because
  // offering a payment we cannot price is worse than offering one fewer.
  const totalUsdForLyd = num(booking.total_amount_usd);
  const lydFx =
    !isPaid && isTlyncConfigured() && totalUsdForLyd !== null && totalUsdForLyd > 0
      ? await usdToLydRate(supabase)
      : null;

  // ── Who sees the dinar option ────────────────────────────────────────────
  // Read from the booking's OWN customer row — the details this guest entered
  // minutes ago, not the account they happen to be signed into. A booking is
  // paid by whoever made it, and that row is the most authoritative statement
  // of where they are.
  const customer = one(booking?.customers) as
    | { email?: string; nationality?: string | null; phone?: string | null }
    | undefined;

  const libyaEligible = isLibyaEligible({
    nationality: customer?.nationality ?? null,
    phone:       customer?.phone ?? null,
  });

  // Both conditions, and both are real: a rate we can quote, AND a guest who
  // could actually complete a Libyan payment.
  const lydAvailable = lydFx !== null && libyaEligible;
  const amountLyd =
    lydFx && totalUsdForLyd !== null ? convertUsdToLyd(totalUsdForLyd, lydFx.rate) : null;

  // ── The wallet option ─────────────────────────────────────────────────────
  // Offered ONLY to the signed-in account whose email matches this booking's
  // guest — the same test pay_booking_from_wallet makes before it will debit
  // anything. The signed cookie proves the visitor started this booking; it
  // does NOT prove whose wallet is on screen, and a booking made anonymously
  // must never be payable from whichever wallet happens to be signed in.
  const walletOffer = !isPaid ? await resolveWalletOffer() : null;

  async function resolveWalletOffer() {
    const customerEmail = customer?.email;
    if (!customerEmail || totalUsdForLyd === null) return null;

    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user?.email) return null;

    if (user.email.trim().toLowerCase() !== customerEmail.trim().toLowerCase()) return null;

    const balanceUsd = await getWalletBalanceUsd(user.id);
    if (balanceUsd === null) return null;

    return { balanceUsd, totalUsd: totalUsdForLyd };
  }

  const walletSufficient =
    walletOffer !== null && walletOffer.balanceUsd >= walletOffer.totalUsd;

  const selectedMethod: 'card' | 'lyd' | 'wallet' =
    pay === 'lyd' && lydAvailable ? 'lyd'
    : pay === 'wallet' && walletSufficient ? 'wallet'
    : 'card';

  // What a paid TLYNC booking was actually charged. amount_lyd is the source
  // of truth; the note is parsed only for attempts started before that column
  // existed, and that fallback can go once none are live.
  // payment_gateway is the discriminator across the whole codebase —
  // payment_method exists but is never written and is empty on every row.
  const paidViaTlync  = payment?.payment_gateway === 'tlync';
  const paidViaWallet = payment?.payment_gateway === 'wallet';

  // ⚠️ A WALLET PAYMENT'S amount_try IS A PLACEHOLDER, NOT A LIRA FIGURE.
  // The function writes amount_try = amount_usd and fx_rate_used = 1 to satisfy
  // columns the booking path requires; the real accounting entry lives in
  // ledger_entries. So a wallet row carries a DOLLAR number in a column every
  // other reader formats as lira — render it and a guest who paid $1.00 is
  // shown ₺1.00. It is neutralised here, at the read, rather than guarded at
  // each of the three places that format it.
  const walletPaidUsd = paidViaWallet
    ? num(payment?.amount_usd) ?? num(booking.total_amount_usd)
    : null;
  const paidLyd = paidViaTlync
    ? num(payment?.amount_lyd) ??
      parseAmountNote(payment?.response_message as string | null)?.lyd ??
      null
    : null;

  const usd = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale, {
    style: 'currency', currency: 'USD', maximumFractionDigits: 2,
  });
  const tryFmt = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale, {
    style: 'currency', currency: 'TRY', maximumFractionDigits: 2,
  });
  const lydFmt = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale, {
    style: 'currency', currency: 'LYD', maximumFractionDigits: 2,
  });

  const totalUsd = num(booking.total_amount_usd);

  // Before payment: the locked figure on the booking. After payment: the
  // figure on the attempt that actually settled — a refund must replay that
  // exact number, so the attempt wins once one exists.
  const lockedTry  = num(booking.amount_charged_try);
  // null on a wallet payment, deliberately — see walletPaidUsd above. There is
  // no lira figure for this booking and inventing one from a placeholder would
  // be worse than showing nothing.
  const amountTry  = paidViaWallet ? null : num(payment?.amount_try) ?? lockedTry;

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

            {/* Amount actually charged, with the USD equivalent beside it.
                A guest who paid in dinar must never be shown a lira figure —
                the lira amount is the booking's internal reference, not
                anything that left their account. */}
            {walletPaidUsd !== null ? (
              <div className="border border-rule rounded-[14px] p-5 mb-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-3">
                  {t('chargedLabel')}
                </p>
                {/* The payment row's own amount_usd — what was actually taken
                    from the balance — not the booking total it was derived
                    from. On this path they agree; if they ever diverge, the
                    figure the guest was charged is the true one. */}
                <p className="text-[1.5rem] font-semibold text-ink tabular-nums leading-none">
                  {usd.format(walletPaidUsd)}
                </p>
                {/* Where it came from matters here in a way it does not for a
                    card: a guest looking for this charge on a bank statement
                    will never find it. */}
                <p className="mt-2 flex items-center gap-1.5 text-[13px] text-mute">
                  <Wallet className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  {t('paidFromWallet')}
                </p>
              </div>
            ) : (paidLyd !== null || amountTry !== null) && (
              <div className="border border-rule rounded-[14px] p-5 mb-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-3">
                  {t('chargedLabel')}
                </p>
                <p className="text-[1.5rem] font-semibold text-ink tabular-nums leading-none">
                  {paidLyd !== null
                    ? lydFmt.format(paidLyd)
                    : tryFmt.format(amountTry as number)}
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
                  {/* Each path gets the sentence that is true for it. TLYNC has
                      no refund API, so a dinar refund is issued by hand through
                      the same Libyan channel. A wallet payment touched no card,
                      no lira and no bank statement — the default copy promises
                      all three, and would be false in every clause.

                      ⚠️ THE WALLET SENTENCE STATES NO TIMEFRAME, on purpose.
                      "Returns to your balance" is the only outcome that makes
                      sense, but the owner-reject path's wallet behaviour is not
                      something this codebase can see. A number of days here
                      would be a promise made on an assumption. */}
                  <p className="text-[13px] text-ink-soft leading-relaxed">
                    {paidViaWallet ? t('refundBodyWallet')
                      : paidViaTlync ? t('refundBodyLyd')
                      : t('refundBody')}
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : pending === 'tlync' ? (
          /* Back from TLYNC, paid there but not yet confirmed here.
             DELIBERATELY NO PAYMENT FORM: only the server-to-server callback
             may mark this paid, and a guest who has just paid must not be
             shown a button that would take their money a second time. */
          <div className="border border-rule rounded-[14px] p-5">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 mt-[2px] shrink-0 text-stay" aria-hidden />
              <div>
                <p className="text-[15px] font-medium text-ink mb-1">
                  {t('confirmingTitle')}
                </p>
                <p className="text-[13px] text-ink-soft leading-relaxed">
                  {t('confirmingBody')}
                </p>
              </div>
            </div>
          </div>
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
              {/* Ön Bilgilendirme §3: the guest sees the exact figure that
                  will be charged, with the USD it was quoted in beside it,
                  BEFORE consenting. The charged currency is primary because
                  that is what leaves their account — so on the LYD path this
                  lira block gives way to the dinar figure on the form below,
                  rather than showing two amounts and no clarity. */}
              {selectedMethod === 'card' && lockedTry !== null && (
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
              {selectedMethod === 'card' &&
                booking.fx_rate_used !== null && booking.fx_rate_used !== undefined && (
                <p className="mt-2 text-xs text-mute">
                  {t('lockedRate', { rate: String(booking.fx_rate_used) })}
                </p>
              )}
            </div>

            <PaymentMethodChoice
              locale={locale}
              reference={booking.booking_reference as string}
              selected={selectedMethod}
              lydAvailable={lydAvailable}
              wallet={
                walletOffer && {
                  balanceLabel: usd.format(walletOffer.balanceUsd),
                  totalLabel:   usd.format(walletOffer.totalUsd),
                  sufficient:   walletSufficient,
                }
              }
            />

            {/* No form carries an amount. What is charged is read server-side
                from the booking, so nothing here can move it — these labels
                are display only. */}
            {selectedMethod === 'wallet' && walletOffer ? (
              <WalletPaymentForm
                amountLabel={usd.format(walletOffer.totalUsd)}
                balanceLabel={usd.format(walletOffer.balanceUsd)}
                remainingLabel={usd.format(walletOffer.balanceUsd - walletOffer.totalUsd)}
              />
            ) : selectedMethod === 'lyd' && amountLyd !== null && lydFx ? (
              <LydPaymentForm
                locale={locale}
                amountLabel={lydFmt.format(amountLyd)}
                usdLabel={totalUsd !== null ? usd.format(totalUsd) : ''}
                rateLabel={lydFx.rate.toFixed(2)}
              />
            ) : (
              <CardPaymentForm
                locale={locale}
                amountLabel={lockedTry !== null ? tryFmt.format(lockedTry) : ''}
              />
            )}
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

/** PostgREST returns an embedded to-one as either an object or a 1-element array. */
function one(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/** PostgREST can hand `numeric` back as a string; coerce once, here. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
