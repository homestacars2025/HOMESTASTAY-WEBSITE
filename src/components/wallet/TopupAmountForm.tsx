'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { CreditCard, Landmark, Check } from 'lucide-react';
import {
  createTopupIntentAction,
  type TopupGateway,
  type TopupResult,
} from '@/app/[locale]/wallet/top-up/actions';
import { walletMoney } from '@/lib/wallet/format';

/**
 * Amount and gateway — the only interactive step in the top-up flow.
 *
 * A client component because it owns three things a form POST cannot: the
 * quick-pick chips writing into the input, the gateway toggle, and a
 * field-level error that must not cost a page load. Everything after this is
 * plain server-rendered HTML again.
 *
 * ON SUCCESS IT NAVIGATES, IT DOES NOT RENDER THE PAYMENT FORM. Same shape as
 * BookingFlow: the intent is server state now, and the pay page re-reads it
 * (and re-proves ownership) rather than trusting anything this component still
 * holds in memory.
 */

interface TopupAmountFormProps {
  locale: string;
  /** False when TLYNC is unconfigured; the Libya option is then not offered. */
  lydAvailable: boolean;
}

/** Round numbers a guest actually reaches for. Not a constraint — the field
 *  stays free-form, and the amount is unbounded by the owner's decision. */
const QUICK_PICKS = [25, 50, 100, 200];

export function TopupAmountForm({ locale, lydAvailable }: TopupAmountFormProps) {
  const t = useTranslations('wallet.topup');
  const router = useRouter();

  const [amount, setAmount] = useState('');
  const [gateway, setGateway] = useState<TopupGateway>('kuveyt');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const money = walletMoney(locale);

  function messageFor(result: Extract<TopupResult, { ok: false }>): string {
    switch (result.status) {
      case 'rate_unavailable': return t('error.rateUnavailable');
      case 'unauthorized':     return t('error.unauthorized');
      case 'invalid':          return t('error.amount');
      default:                 return t('error.generic');
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    // The only rule left. There is no minimum, no maximum and no daily cap —
    // start_wallet_topup rejects zero and negative and nothing else, so this
    // mirrors exactly that and invents no range of its own.
    const parsed = Number(amount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(t('error.amount'));
      return;
    }

    startTransition(async () => {
      const result = await createTopupIntentAction(parsed, gateway);
      if (!result.ok) {
        setError(messageFor(result));
        return;
      }
      router.push(`/wallet/top-up/pay?intent=${encodeURIComponent(result.intentId)}`);
    });
  }

  const field =
    'w-full rounded-[14px] border border-rule bg-paper px-4 py-3 text-[15px] ' +
    'text-ink placeholder:text-mute transition-colors duration-[240ms] ' +
    'focus:outline-none focus:border-ink';
  const label =
    'block font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-2';

  return (
    <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-6">
      {error && (
        <div
          role="alert"
          className="rounded-[14px] border border-stay/20 bg-stay/5 px-4 py-3 text-sm leading-relaxed text-stay"
        >
          {error}
        </div>
      )}

      <div>
        <label htmlFor="topup-amount" className={label}>{t('amountLabel')}</label>

        <div className="mb-3 flex flex-wrap gap-2">
          {QUICK_PICKS.map((value) => {
            const active = amount === String(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => setAmount(String(value))}
                aria-pressed={active}
                className={
                  'min-h-[44px] rounded-[999px] border px-5 text-sm font-medium tabular-nums ' +
                  'transition-colors duration-[240ms] ' +
                  (active
                    // Law 4 allows the accent on an active state.
                    ? 'border-stay bg-paper-warm text-ink'
                    : 'border-rule text-ink-soft hover:bg-paper-warm')
                }
              >
                {money.format(value)}
              </button>
            );
          })}
        </div>

        {/* dir="ltr" in every locale: an amount is a left-to-right token, and
            the currency hint sits beside it rather than inside the value. */}
        <input
          id="topup-amount"
          name="amount"
          type="text"
          inputMode="decimal"
          dir="ltr"
          autoComplete="off"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={field}
        />

        <p className="mt-2 text-xs leading-relaxed text-mute">{t('usdOnlyHint')}</p>
      </div>

      {/* One gateway means no chooser — a choice of one is clutter (Law 2). */}
      {lydAvailable && (
        <fieldset>
          <legend className={label}>{t('gatewayLabel')}</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <GatewayOption
              active={gateway === 'kuveyt'}
              onSelect={() => setGateway('kuveyt')}
              icon={<CreditCard className="h-[18px] w-[18px]" aria-hidden />}
              label={t('gatewayCard')}
              hint={t('gatewayCardHint')}
            />
            <GatewayOption
              active={gateway === 'tlync'}
              onSelect={() => setGateway('tlync')}
              icon={<Landmark className="h-[18px] w-[18px]" aria-hidden />}
              label={t('gatewayLyd')}
              hint={t('gatewayLydHint')}
            />
          </div>
        </fieldset>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-[44px] w-full rounded-[999px] bg-stay py-4 text-sm font-semibold text-white transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80 disabled:opacity-60"
      >
        {pending ? t('continuePending') : t('continue')}
      </button>
    </form>
  );
}

function GatewayOption({
  active, onSelect, icon, label, hint,
}: {
  active: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={
        'flex min-h-[44px] items-start gap-3 rounded-[14px] border p-4 text-start ' +
        'transition-colors duration-[240ms] ' +
        (active ? 'border-stay bg-paper-warm' : 'border-rule hover:bg-paper-warm')
      }
    >
      <span className={active ? 'mt-[2px] text-stay' : 'mt-[2px] text-ink-soft'}>
        {active ? <Check className="h-[18px] w-[18px]" aria-hidden /> : icon}
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-[14px] font-medium leading-snug text-ink">{label}</span>
        <span className="text-[12px] leading-relaxed text-mute">{hint}</span>
      </span>
    </button>
  );
}
