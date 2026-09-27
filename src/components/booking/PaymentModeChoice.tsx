'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import type { PaymentMode, PaymentModeQuote } from '@/lib/booking/payment-mode';
import type { UnitCancellationPolicy } from '@/lib/types/unit';

/**
 * Pay in full now, or pay a deposit now and the rest in cash at arrival.
 *
 * VALUES, NEVER PERCENTAGES. "Pay $14.40 now — $120.00 in cash at arrival" is
 * a sentence a guest can check against their wallet; "15% deposit" is
 * homework. Every figure came from quote_payment_modes; none is computed in
 * the browser (the split is owner-cost data the app must never hold).
 *
 * DOLLARS ARE WHAT IS OWED, LIRA IS WHAT IS CHARGED. Prices are set in USD
 * (§9), and the balance is handed to the host in cash — possibly in another
 * currency, at the rate on the day. So the dollar figure leads and the lira
 * figure sits under it as an approximation. The pay button and the bank page
 * stay in lira, because that is the amount that actually leaves the card.
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
  const intlLocale = locale === 'en' ? 'en-GB' : locale;

  const usdFmt = new Intl.NumberFormat(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tryFmt = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 });

  // Isolated so "$14.40" and "726 ₺" cannot be reordered inside Arabic text.
  const usd = (value: number) => `⁦$${usdFmt.format(value)}⁩`;
  const lira = (value: number) => `⁦${tryFmt.format(value)} ₺⁩`;

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
          title={t('fullTitle', { amount: usd(quote.totalUsd as number) })}
          approx={t('chargedNow', { amount: lira(quote.totalTry as number) })}
          body={t('fullBody')}
        />
        )}

        {quote.allowDeposit && quote.depositUsd !== null && quote.balanceDueUsd !== null && (
        <ModeCard
          tag={t('depositTag')}
          selected={value === 'deposit'}
          onSelect={() => onChange('deposit')}
          title={t('depositTitle', {
            deposit: usd(quote.depositUsd as number),
            balance: usd(quote.balanceDueUsd as number),
          })}
          approx={t('chargedNow', { amount: lira(quote.depositTry as number) })}
          body={t('depositBody')}
          /* How the cash balance may be settled — the host takes dollars or
             the equivalent on the day, so the lira figure here is indicative
             only and is deliberately not presented as the amount owed. */
          note={t('balanceCurrency', { amount: lira(quote.balanceDueTry as number) })}
          /* The unit's policy, named and quoted — not a term invented here. */
          warning={policy ? `${policy.name} — ${policy.description}` : undefined}
        />
        )}

        {/* Nothing online at all: the request goes to the owner, and the whole
            sum is handed over in cash on arrival. No lira line — no card is
            charged, so there is no lira amount to state. */}
        {quote.allowPayAtArrival && quote.totalUsd !== null && (
          <ModeCard
            tag={t('arrivalTag')}
            selected={value === 'pay_at_arrival'}
            onSelect={() => onChange('pay_at_arrival')}
            title={t('arrivalTitle', { total: usd(quote.totalUsd) })}
            body={t('arrivalBody')}
            note={t('balanceCurrencyPlain')}
            warning={policy ? `${policy.name} — ${policy.description}` : undefined}
          />
        )}
      </div>
    </fieldset>
  );
}

function ModeCard({
  selected, onSelect, title, approx, body, note, warning, tag,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  /** What leaves the card today. Absent when nothing is charged online. */
  approx?: string;
  body: string;
  note?: string;
  warning?: string;
  /** A short badge — why guests or owners tend to pick this one. */
  tag?: string;
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
        {tag && (
          <span className="inline-flex mb-1.5 rounded-[999px] bg-paper-warm px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] rtl:tracking-normal rtl:font-sans text-ink-soft">
            {tag}
          </span>
        )}
        <span className={`block text-[15px] font-medium leading-snug ${selected ? 'text-stay' : 'text-ink'}`}>
          {title}
        </span>
        {approx && <span className="block text-[12px] text-mute tabular-nums mt-0.5">{approx}</span>}
        <span className="block text-[13px] text-ink-soft leading-relaxed mt-1">{body}</span>
        {note && (
          <span className="block text-[12px] text-ink-soft leading-relaxed mt-1">{note}</span>
        )}
        {warning && (
          <span className="block text-[12px] text-mute leading-relaxed mt-1.5">{warning}</span>
        )}
      </span>
    </label>
  );
}
