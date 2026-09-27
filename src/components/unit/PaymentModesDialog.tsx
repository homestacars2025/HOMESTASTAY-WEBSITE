'use client';

import { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { PAYMENT_MODE_NAME_KEY } from '@/lib/booking/payment-mode';
import type { PaymentModeQuote } from '@/lib/booking/payment-mode';

/**
 * "Two ways to book" — shown once, on the way into the booking flow, for a
 * unit that offers both payment modes.
 *
 * WHY IT EXISTS AND WHY IT IS NOT A CHOICE
 *   The deposit is the reason a guest might book at all, and it is invisible
 *   until the checkout page. This says it out loud at the moment they commit
 *   to booking. It does NOT ask them to decide: the real choice stays on the
 *   checkout page, where the policy and the lira figures are also shown. One
 *   Continue button, one close — anything more would be a second checkout.
 *
 * AMOUNTS ONLY WHEN THERE ARE DATES. Without a range there is nothing to
 * price, so the same sentences are shown without figures rather than with a
 * guessed or nightly-rate number. Every figure comes from quote_payment_modes.
 */
export function PaymentModesDialog({
  modes,
  quote,
  onContinue,
  onClose,
}: {
  /**
   * What this unit offers, from its own allow_* columns.
   *
   * ⚠️ NOT DERIVED FROM `quote`. The quote is null until dates are picked, and
   * the mobile "Reserve" button opens this dialog long before that — which is
   * how a unit offering three modes announced "Two ways to book" with two
   * bullets. What is on offer is a property of the unit; what it costs is a
   * property of the dates.
   */
  modes: { fullPrepay: boolean; deposit: boolean; payAtArrival: boolean };
  /** Priced modes for the chosen dates, or null when no dates are picked. */
  quote: PaymentModeQuote | null;
  onContinue: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('unit.booking.explain');
  // The same name each mode carries on the chooser and the booking.
  const tMode = useTranslations('booking.mode');
  const name = (mode: 'full_prepay' | 'deposit' | 'pay_at_arrival') =>
    tMode(PAYMENT_MODE_NAME_KEY[mode]);
  const locale = useLocale();
  const ref = useRef<HTMLDialogElement>(null);

  // showModal() cannot be called during render, and the element has to exist
  // first — so it opens on mount, which is also when the guest asked for it.
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  const usdFmt = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Isolated so "$14.40" keeps its order inside an Arabic sentence.
  const usd = (value: number) => `⁦$${usdFmt.format(value)}⁩`;

  // Amounts only when all three are priced: a bullet with one figure missing
  // would describe a split we cannot state.
  // The stay's total is the one figure every mode needs; a bullet that also
  // needs the split checks for it itself.
  const priced = quote !== null && quote.totalUsd !== null;

  const modeCount = [modes.fullPrepay, modes.deposit, modes.payAtArrival].filter(Boolean).length;

  return (
    <dialog
      ref={ref}
      aria-labelledby="modes-explain-title"
      onClose={onClose}
      onClick={(e) => {
        // The backdrop is the dialog element itself; its content box is not.
        if (e.target === e.currentTarget) ref.current?.close();
      }}
      className="m-auto w-[calc(100vw-2rem)] max-w-[420px] rounded-[14px] bg-white p-0 text-ink backdrop:bg-ink/40"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 id="modes-explain-title" className="text-[17px] font-medium tracking-[-0.015em] leading-snug">
            {/* Two modes or three — the heading counts what is actually on the
                card below it, rather than promising a number that is wrong. */}
            {modeCount >= 3 ? t('titleThree') : t('title')}
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label={t('close')}
            className="-me-2 -mt-1 inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-full text-ink-soft hover:bg-paper-warm transition-colors duration-[240ms]"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <ul className="flex flex-col gap-3 mb-4">
          {modes.fullPrepay && (
            <Bullet
              text={priced
                ? t('fullWithAmount', { name: name('full_prepay'),  total: usd(quote!.totalUsd as number) })
                : t('full', { name: name('full_prepay') })}
            />
          )}
          {modes.deposit && (
            <Bullet
              text={priced && quote?.depositUsd != null && quote?.balanceDueUsd != null
                ? t('depositWithAmounts', { name: name('deposit'), 
                    deposit: usd(quote.depositUsd),
                    balance: usd(quote.balanceDueUsd),
                  })
                : t('deposit', { name: name('deposit') })}
            />
          )}
          {modes.payAtArrival && (
            <Bullet
              text={priced
                ? t('arrivalWithAmount', { name: name('pay_at_arrival'),  total: usd(quote.totalUsd as number) })
                : t('arrival', { name: name('pay_at_arrival') })}
            />
          )}
        </ul>

        <p className="text-[13px] text-mute leading-relaxed mb-6">{t('note')}</p>

        <button
          type="button"
          onClick={() => {
            onContinue();
            ref.current?.close();
          }}
          className="w-full min-h-12 rounded-[999px] bg-stay px-6 text-sm font-semibold text-white transition-opacity duration-[240ms] hover:opacity-90"
        >
          {t('continue')}
        </button>
      </div>
    </dialog>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2.5 text-[14px] text-ink-soft leading-relaxed">
      <span aria-hidden className="mt-[7px] w-1.5 h-1.5 shrink-0 rounded-full bg-stay" />
      <span>{text}</span>
    </li>
  );
}
