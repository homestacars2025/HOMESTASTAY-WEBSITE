import { getTranslations } from 'next-intl/server';
import { walletDate, walletMoney, walletSignedMoney, signedAmount } from '@/lib/wallet/format';
import { ENTRY_LIMIT, type WalletEntry } from '@/lib/queries/wallet';

/**
 * The statement.
 *
 * A LIST, NOT A <table>. Mobile is 375px and this site's guests book from
 * their phones (Law 5); a four-column table there either scrolls sideways or
 * squeezes the amount — the one thing on the row that must stay readable. A
 * two-block row (what happened / what it did to the balance) survives 375px
 * and reads identically in Arabic, because every axis here is logical: `end`,
 * `text-end`, `border-b`, and flex-end all follow the writing direction. No
 * left/right anywhere in this file, by rule.
 *
 * A SERVER COMPONENT — no interactivity, no client bundle.
 */

interface WalletEntryListProps {
  locale: string;
  entries: WalletEntry[];
  /** More rows exist than we fetched. Said out loud, never hidden. */
  truncated: boolean;
}

/**
 * The entry types this UI has words for.
 *
 * A value outside this set still renders — as the generic "movement" label
 * rather than a raw enum token like `commission_credit` leaking into four
 * languages. The database is free to grow a new type without this page
 * shipping an untranslated string the day it does.
 */
const KNOWN_ENTRY_TYPES = new Set([
  'topup',
  'booking_charge',
  'cashback',
  'penalty',
  'adjustment',
  'withdrawal',
  'payout',
  'commission_credit',
  'refund_out',
]);

/** Statuses worth interrupting the reader for. `completed` is the silent norm. */
const FLAGGED_STATUSES = new Set(['pending', 'reversed']);

export async function WalletEntryList({ locale, entries, truncated }: WalletEntryListProps) {
  const t = await getTranslations({ locale, namespace: 'wallet' });

  // Two formatters, deliberately. A movement is signed (+/− is the whole
  // point); a running balance is a state and must never carry a leading '+'.
  const movement = walletSignedMoney(locale);
  const balance = walletMoney(locale);
  const date = walletDate(locale);

  if (entries.length === 0) {
    return (
      <div className="mt-10 flex flex-col items-center gap-3 rounded-[14px] border border-rule px-6 py-14 text-center">
        <p className="text-base font-medium text-ink">{t('emptyTitle')}</p>
        <p className="max-w-xs text-sm leading-relaxed text-mute">{t('emptySubtitle')}</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="wallet-history" className="mt-10">
      <h2
        id="wallet-history"
        className="font-mono text-[11px] uppercase tracking-[0.1em] text-mute"
      >
        {t('historyTitle')}
      </h2>

      <ul className="mt-4 border-t border-rule">
        {entries.map((entry) => {
          const isCredit = entry.direction === 'credit';
          const isReversed = entry.status === 'reversed';

          const typeLabel = KNOWN_ENTRY_TYPES.has(entry.entryType)
            ? t(`entryType.${entry.entryType}` as 'entryType.topup')
            : t('entryType.other');

          // A reversed entry did not move the balance in the end, so it must
          // not read as a live credit or debit. It goes quiet and struck
          // through instead of shouting green.
          const amountTone = isReversed
            ? 'text-mute line-through'
            : isCredit
              ? 'text-credit'
              : 'text-debit';

          return (
            <li
              key={entry.id}
              className="flex items-start justify-between gap-4 border-b border-rule py-4"
            >
              {/* What happened */}
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-medium text-ink">{typeLabel}</span>

                {entry.note && (
                  <span className="text-sm leading-relaxed text-ink-soft">{entry.note}</span>
                )}

                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute">
                  {date.format(new Date(entry.createdAt))}
                  {entry.entryNumber ? ` · ${entry.entryNumber}` : ''}
                </span>
              </div>

              {/* What it did to the balance.
                  items-end is cross-axis flex-end in a column — it follows
                  `direction`, so it lands correctly in Arabic without a
                  second rule. */}
              <div className="flex shrink-0 flex-col items-end gap-1 text-end">
                <span className={`text-sm font-medium tabular-nums ${amountTone}`}>
                  {movement.format(signedAmount(entry.amountUsd, entry.direction))}
                </span>

                {entry.balanceAfterUsd !== null && !isReversed && (
                  <span className="text-xs text-mute tabular-nums">
                    {t('runningBalance', { amount: balance.format(entry.balanceAfterUsd) })}
                  </span>
                )}

                {FLAGGED_STATUSES.has(entry.status) && (
                  <span className="rounded-[999px] border border-rule px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
                    {t(`status.${entry.status}` as 'status.pending')}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {truncated && (
        <p className="mt-4 text-xs leading-relaxed text-mute">
          {t('truncated', { count: ENTRY_LIMIT })}
        </p>
      )}
    </section>
  );
}
