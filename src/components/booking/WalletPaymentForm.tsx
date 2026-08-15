'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { Wallet, AlertTriangle } from 'lucide-react';
import {
  payBookingFromWalletAction,
  type WalletPayResult,
} from '@/app/[locale]/booking/[reference]/actions';

/**
 * Paying a booking from the wallet balance.
 *
 * ⚠️ TWO STEPS, DELIBERATELY.
 *   Every other payment method on this page hands the guest to a bank or an
 *   aggregator, where a second screen and often an OTP stand between the click
 *   and the money. This one debits instantly and cannot be reversed by us —
 *   there is no hold, no 3DS page, no "cancel" on the bank's side. So the
 *   confirmation those flows get for free is built here instead: the first
 *   button only reveals what is about to happen, and a second, explicit press
 *   spends the money.
 *
 * The amount is NOT submitted. The action sends no figure at all; the database
 * function reads the booking's own total. These labels are display only.
 */

interface WalletPaymentFormProps {
  /** Booking total, formatted. */
  amountLabel: string;
  /** Current wallet balance, formatted. */
  balanceLabel: string;
  /** Balance after this payment, formatted. Null when it would go negative. */
  remainingLabel: string | null;
}

export function WalletPaymentForm({
  amountLabel, balanceLabel, remainingLabel,
}: WalletPaymentFormProps) {
  const t = useTranslations('booking.payment.wallet');
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<React.ReactNode>(null);
  const [pending, startTransition] = useTransition();

  function messageFor(result: Extract<WalletPayResult, { ok: false }>): React.ReactNode {
    switch (result.status) {
      case 'insufficient_balance':
        // The balance moved between rendering this page and pressing the
        // button — another tab spent it, or a refund reversed. Say the real
        // numbers and point at the fix rather than a bare refusal.
        return (
          <>
            {t('error.insufficient')}{' '}
            <Link href="/wallet/top-up" className="underline underline-offset-2">
              {t('topUpLink')}
            </Link>
          </>
        );
      case 'booking_not_holdable': return t('error.notHoldable');
      case 'unauthorized':         return t('error.unauthorized');
      case 'unknown_booking':      return t('error.unknownBooking');
      default:                     return t('error.generic');
    }
  }

  function pay() {
    setError(null);
    startTransition(async () => {
      const result = await payBookingFromWalletAction();

      if (!result.ok) {
        setError(messageFor(result));
        setConfirming(false);
        return;
      }

      // The page is force-dynamic, so a refresh re-reads the booking and
      // renders the paid state — including the amount actually taken. No
      // success message is invented here: the server says whether it is paid.
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div
          role="alert"
          className="rounded-[14px] border border-stay/20 bg-stay/5 px-4 py-3 text-sm leading-relaxed text-stay"
        >
          {error}
        </div>
      )}

      <div className="rounded-[14px] border border-rule p-5">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-mute">
          {t('amountLabel')}
        </p>
        <p className="text-[1.5rem] font-semibold leading-none text-stay tabular-nums">
          {amountLabel}
        </p>

        <dl className="mt-4 flex flex-col gap-1.5 border-t border-rule pt-4 text-[13px]">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-mute">{t('balanceNow')}</dt>
            <dd className="text-ink tabular-nums">{balanceLabel}</dd>
          </div>
          {remainingLabel && (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-mute">{t('balanceAfter')}</dt>
              <dd className="font-medium text-ink tabular-nums">{remainingLabel}</dd>
            </div>
          )}
        </dl>
      </div>

      {confirming ? (
        <>
          {/* The whole point of the second step: say plainly that this is
              immediate and final BEFORE the press that makes it so. */}
          <div className="flex items-start gap-3 rounded-[14px] border border-stay/25 bg-stay/5 p-4">
            <AlertTriangle className="mt-[2px] h-[18px] w-[18px] shrink-0 text-stay" aria-hidden />
            <p className="text-[13px] leading-relaxed text-ink">
              {t('confirmBody', { amount: amountLabel })}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <button
              type="button"
              onClick={pay}
              disabled={pending}
              className="min-h-[44px] flex-1 rounded-[999px] bg-stay py-4 text-sm font-semibold text-white transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80 disabled:opacity-60"
            >
              {pending ? t('paying') : t('confirmSubmit')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="min-h-[44px] rounded-[999px] border border-rule px-6 py-4 text-sm font-medium text-ink transition-colors duration-[240ms] hover:bg-paper-warm disabled:opacity-60 sm:flex-none"
            >
              {t('cancel')}
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[999px] bg-stay py-4 text-sm font-semibold text-white transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80"
        >
          <Wallet className="h-4 w-4" aria-hidden />
          {t('submit', { amount: amountLabel })}
        </button>
      )}

      <p className="text-center text-xs leading-relaxed text-mute">{t('instantNote')}</p>
    </div>
  );
}
