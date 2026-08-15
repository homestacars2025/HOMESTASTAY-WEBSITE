import { getTranslations } from 'next-intl/server';
import { walletMoney } from '@/lib/wallet/format';
import type { WalletAccount } from '@/lib/queries/wallet';

/**
 * The balance, at the top of the page, as one figure.
 *
 * A SERVER COMPONENT. Nothing here is interactive, so nothing here ships to
 * the browser (Law 1). The balance is also never cached — that discipline
 * lives on the page (force-dynamic); this component simply renders what it is
 * handed.
 *
 * WHY THE FIGURE IS INK AND NOT --stay
 *   §7 puts prices in the accent, and a balance is price-shaped. But this
 *   screen already spends red on debits, where red means "money left". Putting
 *   the headline balance in the same red would read as a warning about the
 *   guest's own money. Ink is the calm, correct answer; the accent still earns
 *   its moment elsewhere on the page.
 */

interface WalletBalanceCardProps {
  locale: string;
  /** null = no wallet row yet. Renders a real zero, not an empty slot. */
  account: WalletAccount | null;
}

export async function WalletBalanceCard({ locale, account }: WalletBalanceCardProps) {
  const t = await getTranslations({ locale, namespace: 'wallet' });
  const money = walletMoney(locale);

  // No wallet row is not "no balance information" — it is a balance of zero,
  // and saying so plainly beats a dash the guest has to interpret.
  const balance = account?.balanceUsd ?? 0;
  const isClosed = account !== null && account.status !== 'active';

  return (
    <section
      aria-labelledby="wallet-balance-label"
      className="rounded-[14px] border border-rule bg-paper-warm px-6 py-7 md:px-8 md:py-9"
    >
      <p
        id="wallet-balance-label"
        className="font-mono text-[11px] uppercase tracking-[0.1em] text-mute"
      >
        {t('balanceLabel')}
      </p>

      {/* tabular-nums: digits keep one width, so a balance that changes does
          not shuffle the layout under the reader's eye. */}
      <p className="mt-3 text-[clamp(2rem,7vw,3rem)] font-medium leading-[1.05] tracking-[-0.045em] text-ink tabular-nums">
        {money.format(balance)}
      </p>

      {account?.accountCode && (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-mute">
          {t('accountCode')} · {account.accountCode}
        </p>
      )}

      {isClosed && (
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">{t('statusClosed')}</p>
      )}
    </section>
  );
}
