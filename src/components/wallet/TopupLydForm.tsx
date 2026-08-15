import { getTranslations } from 'next-intl/server';
import { ExternalLink } from 'lucide-react';
import { AmountPanel } from './TopupCardForm';
import { TopupPhoneField } from './TopupPhoneField';

/**
 * The TLYNC (Libya, LYD) step of a wallet top-up.
 *
 * No payment fields at all — TLYNC is a hosted aggregator, so the guest picks
 * Tadawul / MobiCash / … on TLYNC's own page. We deliberately do not mirror
 * that list here: it is TLYNC's to change, and a copy would go stale.
 *
 * The phone IS collected, unlike the booking equivalent: TLYNC requires a
 * contact number on initiate, and a top-up has no booking with a customer row
 * to read one from. It is prefilled from profiles so most guests never touch
 * it.
 */

interface TopupLydFormProps {
  locale: string;
  intentId: string;
  /** Charged LYD figure, already formatted. Display only. */
  amountLabel: string;
  usdLabel: string;
  rateLabel: string;
  phone: string;
}

export async function TopupLydForm({
  locale, intentId, amountLabel, usdLabel, rateLabel, phone,
}: TopupLydFormProps) {
  const t = await getTranslations({ locale, namespace: 'wallet.topup' });
  const tPay = await getTranslations({ locale, namespace: 'booking.payment' });

  return (
    <form
      method="POST"
      action="/api/payment/wallet/tlync/start"
      className="flex flex-col gap-5"
    >
      {/* TLYNC's redirect back carries no language of its own. */}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="intentId" value={intentId} />

      <AmountPanel
        title={t('chargedLydLabel')}
        amountLabel={amountLabel}
        usdLabel={usdLabel}
        note={t('rateNote', { rate: rateLabel })}
      />

      {/* defaultCountry stays TR inside the field: a Libyan guest changes it in
          one tap, and guessing LY from the gateway would be wrong for the many
          who pay a Libyan method on a foreign number. */}
      <TopupPhoneField initialPhone={phone} />

      <p className="text-[13px] leading-relaxed text-ink-soft">
        {tPay('lydRedirectNote')}
      </p>

      <button
        type="submit"
        className="min-h-[44px] w-full rounded-[999px] bg-stay py-4 text-sm font-semibold text-white transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80"
      >
        {t('paySubmit', { amount: amountLabel })}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-mute">
        <ExternalLink className="h-3 w-3 rtl:scale-x-[-1]" aria-hidden />
        {tPay('lydSecureNote')}
      </p>
    </form>
  );
}
