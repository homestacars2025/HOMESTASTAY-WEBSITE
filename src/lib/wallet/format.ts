/**
 * Wallet formatting. Shared by the balance card and the statement rows so a
 * figure is never spelled two different ways on the same screen.
 *
 * EVERY number and date goes through Intl — CLAUDE.md §6. That is not a style
 * preference here: in Arabic these render with Arabic-Indic digits and a
 * locale-correct sign position, and hand-built strings get both wrong.
 */

/**
 * en → en-GB, everything else unchanged.
 *
 * Same mapping the booking result page uses. Plain 'en' is US-shaped
 * (MM/DD/YYYY, $ tight to the digits) and this site's English is British.
 */
function intlLocale(locale: string): string {
  return locale === 'en' ? 'en-GB' : locale;
}

/**
 * Prices are stored in USD and only in USD (§9). The wallet is a USD ledger —
 * balance_usd, amount_usd, balance_after_usd — so nothing here converts, and
 * no display-currency switch reaches this module. If wallet display currency
 * is ever added it belongs at the boundary, not in a formatter.
 */
export function walletMoney(locale: string): Intl.NumberFormat {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * The signed variant, for statement rows.
 *
 * THE SIGN IS INTL'S JOB, NOT OURS. Prepending '+' or '−' by hand puts it on
 * the wrong side in Arabic and breaks bidirectional reordering next to the
 * currency symbol. Pass a signed number and let the formatter place it.
 */
export function walletSignedMoney(locale: string): Intl.NumberFormat {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'always',
  });
}

export function walletDate(locale: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
  });
}

/**
 * A credit adds, a debit subtracts. amount_usd is stored unsigned — direction
 * is the column that carries the arithmetic — so the sign is derived here,
 * once, and never inferred from the magnitude.
 */
export function signedAmount(amountUsd: number, direction: 'credit' | 'debit'): number {
  const magnitude = Math.abs(amountUsd);
  return direction === 'debit' ? -magnitude : magnitude;
}
