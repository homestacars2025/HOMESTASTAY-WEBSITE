'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { PAYMENT_MODE_NAME_KEY } from '@/lib/booking/payment-mode';
import type { PaymentMode, PaymentModeQuote } from '@/lib/booking/payment-mode';

/**
 * How to pay: in full now, a deposit now, or nothing until arrival.
 *
 * ONE NAME PER MODE, EVERYWHERE. The headings are the same strings used
 * wherever else a mode is named, so a guest who chose "Book with deposit"
 * reads those same words on the booking afterwards.
 *
 * A HEADING AND ONE LINE — nothing else. The cancellation policy moved to the
 * consent line above the button, where it is actually agreed to, and the
 * cash-currency sentence is stated once beneath the whole group. Repeating
 * both inside every card turned a choice that is one sentence each into three
 * dense blocks (Law 2).
 *
 * VALUES, NEVER PERCENTAGES, and never computed here: every figure comes from
 * quote_payment_modes. Dollars are what is owed; the small lira line is what
 * leaves the card today, so it shows only on the modes that charge one.
 *
 * Renders nothing when only one mode is offerable.
 */
export function PaymentModeChoice({
  quote,
  value,
  onChange,
  disabled,
}: {
  quote: PaymentModeQuote;
  value: PaymentMode;
  onChange: (mode: PaymentMode) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('booking.mode');
  const locale = useLocale();
  const intlLocale = locale === 'en' ? 'en-GB' : locale;

  const usdFmt = new Intl.NumberFormat(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tryFmt = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 });

  // Isolated so "$14.40" and "726 ₺" keep their order inside Arabic text.
  const usd = (value: number) => `⁦$${usdFmt.format(value)}⁩`;
  const lira = (value: number) => `⁦${tryFmt.format(value)} ₺⁩`;

  const name = (mode: PaymentMode) => t(PAYMENT_MODE_NAME_KEY[mode]);

  return (
    <fieldset className="mb-8" disabled={disabled}>
      <legend className="block font-mono text-[10px] uppercase tracking-[0.1em] rtl:tracking-normal text-mute mb-3">
        {t('title')}
      </legend>

      <div className="flex flex-col gap-3">
        {quote.allowFullPrepay && quote.totalTry !== null && quote.totalUsd !== null && (
          <ModeCard
            selected={value === 'full_prepay'}
            onSelect={() => onChange('full_prepay')}
            title={name('full_prepay')}
            line={t('lineFull', { total: usd(quote.totalUsd) })}
            approx={t('chargedNow', { amount: lira(quote.totalTry) })}
          />
        )}

        {quote.allowDeposit && quote.depositUsd !== null && quote.balanceDueUsd !== null && (
          <ModeCard
            selected={value === 'deposit'}
            onSelect={() => onChange('deposit')}
            title={name('deposit')}
            line={t('lineDeposit', {
              deposit: usd(quote.depositUsd),
              balance: usd(quote.balanceDueUsd),
            })}
            approx={quote.depositTry !== null
              ? t('chargedNow', { amount: lira(quote.depositTry) })
              : undefined}
          />
        )}

        {/* No lira line: nothing is charged online, so there is no amount
            leaving a card today to approximate. */}
        {quote.allowPayAtArrival && quote.totalUsd !== null && (
          <ModeCard
            selected={value === 'pay_at_arrival'}
            onSelect={() => onChange('pay_at_arrival')}
            title={name('pay_at_arrival')}
            line={t('lineArrival', { total: usd(quote.totalUsd) })}
          />
        )}
      </div>

      {/* Said once, for whichever cash figure is on screen. */}
      <p className="mt-3 text-[12px] text-mute leading-relaxed">{t('cashNote')}</p>
    </fieldset>
  );
}

function ModeCard({
  selected, onSelect, title, line, approx,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  line: string;
  /** What leaves the card today. Absent when nothing is charged online. */
  approx?: string;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-[14px] border p-4 cursor-pointer transition-colors duration-[240ms] ${
        selected ? 'border-stay bg-white' : 'border-rule bg-white hover:border-ink-soft'
      }`}
    >
      <input
        type="radio"
        name="paymentMode"
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      {/* The radio is drawn, so it can carry the accent without fighting a
          native control's platform styling. */}
      <span
        aria-hidden
        className={`mt-[2px] inline-flex items-center justify-center w-5 h-5 shrink-0 rounded-full border ${
          selected ? 'border-stay bg-stay text-white' : 'border-rule text-transparent'
        }`}
      >
        <Check className="w-3 h-3" />
      </span>

      <span className="flex-1">
        <span className={`block text-[15px] font-medium leading-snug ${selected ? 'text-stay' : 'text-ink'}`}>
          {title}
        </span>
        <span className="block text-[13px] text-ink-soft leading-relaxed mt-1">{line}</span>
        {approx && <span className="block text-[12px] text-mute tabular-nums mt-0.5">{approx}</span>}
      </span>
    </label>
  );
}
