'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import type { PaymentMode, PaymentModeQuote } from '@/lib/booking/payment-mode';
import type { UnitCancellationPolicy } from '@/lib/types/unit';

/**
 * Pay in full now, or pay a deposit now and the rest in cash at arrival.
 *
 * VALUES, NEVER PERCENTAGES. "Pay ₺7,508 now — ₺48,878 in cash at arrival" is
 * a sentence a guest can check against their wallet; "15% deposit" is homework.
 * Every figure here came from quote_payment_modes; none is computed in the
 * browser (the split is owner-cost data the app must never hold).
 *
 * Renders nothing when only one mode is offerable — a chooser with one choice
 * is clutter (Law 2), and the single mode is simply used.
 *
 * THE CANCELLATION TERMS UNDER THE DEPOSIT CARD ARE THE UNIT'S OWN, verbatim
 * from unit_cancellation_policy in the guest's language. A deposit is governed
 * by exactly the same policy as a full prepayment, and those descriptions
 * already state what happens on a no-show — so nothing is written here. A
 * sentence composed in this file could only drift from the policy the guest
 * actually agreed to.
 */
export function PaymentModeChoice({
  quote,
  value,
  onChange,
  disabled,
  policy,
}: {
  quote: PaymentModeQuote;
  value: PaymentMode;
  onChange: (mode: PaymentMode) => void;
  disabled?: boolean;
  /** The unit's cancellation policy, already resolved for this locale. */
  policy: UnitCancellationPolicy | null;
}) {
  const t = useTranslations('booking.mode');
  const locale = useLocale();

  const money = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale, {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  });
  // Arabic reads the lira symbol after a number that must stay LTR; the
  // isolate keeps "₺7,508" intact inside an RTL sentence.
  const amount = (value: number) => `⁦${money.format(value)}⁩`;

  return (
    <fieldset className="mb-8" disabled={disabled}>
      <legend className="block font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-3">
        {t('title')}
      </legend>

      <div className="flex flex-col gap-3">
        <ModeCard
          selected={value === 'full_prepay'}
          onSelect={() => onChange('full_prepay')}
          title={t('fullTitle', { amount: amount(quote.totalTry as number) })}
          body={t('fullBody')}
        />

        <ModeCard
          selected={value === 'deposit'}
          onSelect={() => onChange('deposit')}
          title={t('depositTitle', {
            deposit: amount(quote.depositTry as number),
            balance: amount(quote.balanceDueTry as number),
          })}
          body={t('depositBody')}
          /* The unit's policy, named and quoted — not a term invented here. */
          warning={policy ? `${policy.name} — ${policy.description}` : undefined}
        />
      </div>
    </fieldset>
  );
}

function ModeCard({
  selected, onSelect, title, body, warning,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  body: string;
  warning?: string;
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
      {/* The radio itself is drawn, so it can carry the accent without
          fighting a native control's platform styling. */}
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
        <span className="block text-[13px] text-ink-soft leading-relaxed mt-1">{body}</span>
        {warning && (
          <span className="block text-[12px] text-mute leading-relaxed mt-1.5">{warning}</span>
        )}
      </span>
    </label>
  );
}
