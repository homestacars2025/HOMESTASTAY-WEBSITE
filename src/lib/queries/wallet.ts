import { createClient } from '@/lib/supabase/server';

/**
 * Customer wallet reads — SERVER ONLY, and deliberately UNDER RLS.
 *
 * WHY server.ts AND NOT admin.ts
 *   Every other money-adjacent read in this codebase uses the service-role
 *   client, because it is reading a booking identified by a signed cookie
 *   rather than by a session. The wallet is the opposite case: the row IS the
 *   session's row, RLS already scopes ledger_accounts/ledger_entries to
 *   auth.uid(), and service_role would throw that guarantee away in exchange
 *   for nothing. A read that the database can authorise should be authorised
 *   by the database.
 *
 * WHY public.ts IS ALSO WRONG
 *   It is cookie-less by design, so it has no session and would see nothing.
 *   And nothing here may ever be cached — see the page's force-dynamic.
 *
 * The profile_id / party_type filters below are therefore REDUNDANT WITH RLS,
 * and kept anyway: if a policy is ever loosened by accident, the query still
 * only asks for this user's customer wallet. Defence in depth costs one
 * indexed comparison.
 *
 * READ-ONLY. No function here writes, and none calls wallet_topup /
 * wallet_charge / wallet_cashback / wallet_adjust — this module is the display
 * surface only.
 */

/**
 * Cap on the statement. An unbounded select on a ledger grows without limit
 * and this page is force-dynamic, so it pays that cost on every single view.
 * We fetch one MORE than we show, purely to know whether we truncated —
 * silently cutting a financial history is exactly the kind of quiet lie a
 * statement must not tell, so the UI says so when it happens.
 */
export const ENTRY_LIMIT = 50;

// ── Row shapes ────────────────────────────────────────────────────────────────
// Written by hand, narrowly. There are no generated database types in this
// repo, and `any` on a financial row would erase the one place a wrong column
// name should fail loudly.

/** public.ledger_direction */
export type LedgerDirection = 'credit' | 'debit';

/** public.ledger_entry_status */
export type LedgerEntryStatus = 'completed' | 'pending' | 'reversed';

/**
 * public.ledger_entry_type.
 *
 * Some of these can never appear on a customer wallet (payout, commission_credit
 * belong to owner/agency accounts). They are listed because the COLUMN can hold
 * them, not because this page expects them — and the UI falls back to a generic
 * label for anything not in this union rather than rendering a raw enum value.
 */
export type LedgerEntryType =
  | 'topup'
  | 'booking_charge'
  | 'cashback'
  | 'penalty'
  | 'adjustment'
  | 'withdrawal'
  | 'payout'
  | 'commission_credit'
  | 'refund_out';

export interface WalletAccount {
  id: string;
  accountCode: string | null;
  status: string;
  currency: string;
  /** Already coerced to a number — see coerceAmount. */
  balanceUsd: number;
}

export interface WalletEntry {
  id: string;
  entryNumber: string | null;
  entryType: string;
  direction: LedgerDirection;
  amountUsd: number;
  status: string;
  bookingId: string | null;
  note: string | null;
  createdAt: string;
  balanceAfterUsd: number | null;
}

export type WalletView =
  | {
      ok: true;
      /** null = this customer has no wallet row yet. Not an error. */
      account: WalletAccount | null;
      entries: WalletEntry[];
      /** True when the ledger has more rows than ENTRY_LIMIT. */
      truncated: boolean;
    }
  /** A read failed. The page shows a service message, never a stack trace. */
  | { ok: false; reason: 'unavailable' };

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * PostgREST hands `numeric` back as a STRING, always. Every money value on
 * these two tables is numeric, so nothing may reach a formatter or a
 * comparison before passing through here. Same shape as the coercion in
 * lib/queries/stays.ts and the payment routes — one idea, spelled the same way
 * in every file that touches money.
 */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * A balance that will not coerce is NOT zero.
 *
 * Zero is a real, meaningful balance, and showing it for "we could not parse
 * what the database sent" would tell the guest their money is gone. Callers
 * get null and must render the failure state instead.
 */
function coerceAmount(value: unknown): number | null {
  return num(value);
}

/**
 * A permissions failure and a network failure are the same thing to the guest:
 * the wallet did not load. They are NOT the same thing to us, so the code is
 * logged — 42501 (permission denied) or PGRST301 (JWT rejected) means a policy
 * or a session problem, not an outage, and would otherwise be invisible.
 */
function logReadFailure(
  scope: string,
  error: { message: string; code?: string; details?: string | null; hint?: string | null },
  context: Record<string, unknown>,
): void {
  const isAuthz = error.code === '42501' || error.code === 'PGRST301';
  console.error(`[wallet] ${scope} read failed${isAuthz ? ' — RLS/GRANT' : ''}`, {
    ...context,
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

// ── The read ──────────────────────────────────────────────────────────────────

/**
 * Just the balance — for surfaces that need to know whether a wallet can cover
 * something, not what it has been doing.
 *
 * The booking page calls this on every render of an unpaid booking, so it
 * deliberately does not touch ledger_entries: a statement nobody is going to
 * display is a second query for nothing.
 *
 * Returns null for "no wallet, or we could not read one" — both mean the same
 * thing to the caller, which is: do not offer to pay from it. A wallet that
 * exists with a zero balance returns 0, and that is a different answer.
 */
export async function getWalletBalanceUsd(profileId: string): Promise<number | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('ledger_accounts')
    .select('balance_usd, status')
    .eq('profile_id', profileId)
    .eq('party_type', 'customer_wallet')
    .maybeSingle();

  if (error) {
    logReadFailure('balance', error, { profileId });
    return null;
  }

  // A closed wallet cannot pay. Offering its balance would be showing money
  // that is not spendable.
  if (!data || data.status !== 'active') return null;

  return coerceAmount(data.balance_usd);
}

/**
 * The whole page in one call: the wallet and its statement.
 *
 * Two round trips rather than one embedded select, on purpose: the entries
 * query needs account_id, and "no wallet yet" is a first-class outcome that
 * must not cost a join. A brand-new customer answers in one query.
 *
 * @param profileId auth.uid() of the signed-in, email-confirmed user. The
 *   caller has already proved this server-side via requireConfirmedUser.
 */
export async function getWalletView(profileId: string): Promise<WalletView> {
  const supabase = await createClient();

  // ── The wallet ──────────────────────────────────────────────────────────
  // maybeSingle(), not single(): no row is the normal state for a customer who
  // has never been credited, and single() would turn that into an error.
  const { data: accountRow, error: accountError } = await supabase
    .from('ledger_accounts')
    .select('id, account_code, status, currency, balance_usd')
    .eq('profile_id', profileId)
    .eq('party_type', 'customer_wallet')
    .maybeSingle();

  if (accountError) {
    logReadFailure('account', accountError, { profileId });
    return { ok: false, reason: 'unavailable' };
  }

  if (!accountRow) {
    return { ok: true, account: null, entries: [], truncated: false };
  }

  const balanceUsd = coerceAmount(accountRow.balance_usd);
  if (balanceUsd === null) {
    console.error('[wallet] balance_usd did not coerce to a number', {
      profileId,
      accountId: accountRow.id,
      received: accountRow.balance_usd,
    });
    return { ok: false, reason: 'unavailable' };
  }

  const account: WalletAccount = {
    id: accountRow.id as string,
    accountCode: (accountRow.account_code as string | null) ?? null,
    status: accountRow.status as string,
    currency: (accountRow.currency as string | null) ?? 'USD',
    balanceUsd,
  };

  // ── The statement ───────────────────────────────────────────────────────
  const { data: entryRows, error: entriesError } = await supabase
    .from('ledger_entries')
    .select(
      'id, entry_number, entry_type, direction, amount_usd, status, booking_id, note, created_at, balance_after_usd',
    )
    .eq('account_id', account.id)
    .order('created_at', { ascending: false })
    // Ties on created_at are possible — two entries written in one transaction
    // share a timestamp. entry_number breaks them so the order is stable
    // between renders instead of whatever the planner returns that time.
    .order('entry_number', { ascending: false })
    .limit(ENTRY_LIMIT + 1);

  if (entriesError) {
    // The balance loaded and the statement did not. Showing a balance with a
    // silently empty history would read as "you have never used this wallet",
    // which is a worse answer than "we could not load it".
    logReadFailure('entries', entriesError, { profileId, accountId: account.id });
    return { ok: false, reason: 'unavailable' };
  }

  const rows = entryRows ?? [];
  const truncated = rows.length > ENTRY_LIMIT;

  const entries: WalletEntry[] = rows.slice(0, ENTRY_LIMIT).map((row) => ({
    id: row.id as string,
    entryNumber: (row.entry_number as string | null) ?? null,
    entryType: row.entry_type as string,
    direction: row.direction as LedgerDirection,
    // An entry whose amount will not coerce still renders — as a row with no
    // figure. Dropping it would leave a gap in a statement, and a statement
    // with a hole in it is worse than one that admits a bad cell.
    amountUsd: coerceAmount(row.amount_usd) ?? 0,
    status: row.status as string,
    bookingId: (row.booking_id as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    createdAt: row.created_at as string,
    balanceAfterUsd: coerceAmount(row.balance_after_usd),
  }));

  return { ok: true, account, entries, truncated };
}
