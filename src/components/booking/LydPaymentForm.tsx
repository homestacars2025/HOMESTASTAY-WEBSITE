import { getTranslations } from 'next-intl/server';
import { ExternalLink } from 'lucide-react';

/**
 * The TLYNC (Libya, LYD) payment step.
 *
 * A plain HTML form with no payment fields at all — TLYNC is a hosted
 * aggregator, so the guest chooses Tadawul / MobiCash / … on TLYNC's own page,
 * not here. We deliberately do not build a method picker: the list of Libyan
 * methods is TLYNC's to change, and mirroring it here would go stale.
 *
 * The amount is display-only, exactly as on the card form. What is charged is
 * derived server-side from the booking, so nothing the browser sends can move
 * it.
 */

interface LydPaymentFormProps {
  locale: string;
  /** Charged amount in LYD, already formatted. */
  amountLabel: string;
  /** The same figure in USD, for the §9 "always show the USD equivalent" rule. */
  usdLabel: string;
  /** LYD per USD, formatted. */
  rateLabel: string;
}

export async function LydPaymentForm({
  locale, amountLabel, usdLabel, rateLabel,
}: LydPaymentFormProps) {
  const t = await getTranslations({ locale, namespace: 'booking.payment' });

  return (
    <form method="POST" action="/api/payment/tlync/start" className="flex flex-col gap-5">
      {/* TLYNC's redirect back carries no language of its own. */}
      <input type="hidden" name="locale" value={locale} />

      <div className="border border-rule rounded-[14px] p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-3">
          {t('lydAmountLabel')}
        </p>
        {/* LYD is primary here because LYD is what leaves the guest's account;
            the USD it was quoted in sits beside it (CLAUDE.md §9). */}
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="text-[1.5rem] font-semibold text-stay tabular-nums leading-none">
            {amountLabel}
          </span>
          {usdLabel && (
            <span className="text-[13px] text-mute tabular-nums">({usdLabel})</span>
          )}
        </p>
        <p className="mt-2 text-xs text-mute leading-relaxed">
          {t('lydRateNote', { rate: rateLabel })}
        </p>
      </div>

      <p className="text-[13px] text-ink-soft leading-relaxed">
        {t('lydRedirectNote')}
      </p>

      <button
        type="submit"
        className="w-full bg-stay text-white rounded-[999px] py-4 text-sm font-semibold min-h-[44px] transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80"
      >
        {t('lydSubmit')}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-mute">
        <ExternalLink className="w-3 h-3 rtl:scale-x-[-1]" aria-hidden />
        {t('lydSecureNote')}
      </p>
    </form>
  );
}
