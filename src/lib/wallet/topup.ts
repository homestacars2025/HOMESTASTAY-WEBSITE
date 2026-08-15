import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Wallet top-up plumbing shared by the Server Action, both gateway routes and
 * both callback branches. SERVER ONLY.
 *
 * THE ONE IDEA IN THIS FILE: `WT-`.
 *   A top-up and a booking payment come back through the SAME bank callback
 *   URL, because OkUrl/FailUrl are hashed into HashData and must stay byte
 *   identical — a second URL for wallet payments would be a second hash to get
 *   wrong. The prefix on merchant_order_id is therefore what tells the two
 *   apart, at the top of the callback, before anything else is read. It also
 *   rides on every record the bank and TLYNC hold, which is what makes a
 *   top-up findable during reconciliation.
 */

/**
 * The discriminator. Changing this string breaks every in-flight payment and
 * orphans every historical one — the callback would route a top-up into the
 * booking path and `complete_payment` would answer `unknown_attempt` on money
 * that has already moved.
 */
export const WALLET_ORDER_PREFIX = 'WT-';

export function isWalletOrder(merchantOrderId: string): boolean {
  return merchantOrderId.startsWith(WALLET_ORDER_PREFIX);
}

/**
 * A fresh merchant order id for a top-up.
 *
 * Bookings get theirs from start_payment_attempt; a top-up's is generated here
 * because attach_topup_order takes it as an argument rather than minting it.
 *
 * Shape: WT-<base36 ms>-<8 hex>. Short enough for the bank's field (well under
 * 32 chars even after TLYNC's own 9-character suffix), sorted-by-time for a
 * human reading a statement, and unguessable in its tail — the TLYNC callback
 * endpoint is public, so a guessable ref would be an invitation even though
 * the receipt check is what actually stops a forgery.
 */
export function newWalletOrderId(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `${WALLET_ORDER_PREFIX}${stamp}-${suffix}`;
}

// ── Intent lookup ─────────────────────────────────────────────────────────────

/**
 * public.topup_intent_status. `pending` is the only state a payment may start
 * from; `processing` means a gateway already has it.
 */
export type TopupIntentStatus =
  | 'pending'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'canceled';

/**
 * The columns this codebase reads from wallet_topup_intents.
 *
 * Explicit, not select('*'): the names are confirmed against the live table, so
 * a typo should now fail loudly at the query instead of arriving as a silent
 * undefined. Note fx_rate_to_usd — the column does NOT share its argument's
 * name (start_wallet_topup takes p_fx_rate).
 *
 * amount_minor is numeric(14,2) and holds the LOCAL-CURRENCY figure with its
 * decimals — 3421.50 lira, NOT 342150 kuruş. The conversion to integer minor
 * units happens once, at the bank boundary, via toMinorUnits. The `,2` in the
 * type is the proof: a kuruş column would be numeric(14,0) or bigint.
 */
const INTENT_COLUMNS =
  'id, profile_id, amount_usd, amount_minor, currency_code, fx_rate_to_usd, ' +
  'gateway, merchant_order_id, payment_id, status, ledger_entry_number, ' +
  'failure_reason, created_at, updated_at, paid_at, expires_at';

export interface TopupIntent {
  id: string;
  profileId: string;
  amountUsd: number;
  status: TopupIntentStatus;
  gateway: string | null;
  currencyCode: string | null;
  /** Local-currency figure WITH decimals (3421.50 lira), never minor units. */
  amountMinor: number | null;
  /** From fx_rate_to_usd. Local units per 1 USD, fixed when the intent opened. */
  fxRate: number | null;
  merchantOrderId: string | null;
  /** Set once credited — the ledger_entries row this top-up became. */
  ledgerEntryNumber: string | null;
  failureReason: string | null;
}

/**
 * Load an intent and prove it belongs to the caller.
 *
 * WHY THERE IS NO SIGNED COOKIE HERE, UNLIKE THE BOOKING FLOW
 *   A booking has no session — anyone can book — so the booking id has to
 *   travel in a signed httpOnly cookie or a caller could start a payment
 *   against a stranger's hold. A top-up is the opposite: it REQUIRES an
 *   account, so the session itself is the credential and the intent id can
 *   travel in the form body, checked against auth.uid() here. Adding a cookie
 *   would be ceremony that proves nothing the session has not already proved.
 *
 * Returns null when the intent does not exist OR belongs to someone else —
 * deliberately indistinguishable, so this cannot be used to probe which ids
 * are real.
 */
export async function loadOwnedIntent(
  supabase: SupabaseClient,
  intentId: string,
  profileId: string,
): Promise<TopupIntent | null> {
  const { data, error } = await supabase
    .from('wallet_topup_intents')
    .select(INTENT_COLUMNS)
    .eq('id', intentId)
    .maybeSingle();

  if (error) {
    console.error('[wallet/topup] intent lookup failed', {
      intentId, message: error.message, code: error.code,
    });
    return null;
  }

  // Mapped BEFORE the ownership check, not after: toIntent is the only thing
  // that knows this table's column names, and reading profile_id off the raw
  // row here would be a second place that has to know them.
  const intent = data ? toIntent(data) : null;

  if (!intent || intent.profileId !== profileId) {
    console.warn('[wallet/topup] intent missing or not owned by caller', {
      intentId, found: Boolean(data),
    });
    return null;
  }

  return intent;
}

/**
 * Row → TopupIntent, in one place so both lookups agree.
 *
 * reason: PostgREST rows are loosely typed and a narrow local shape is clearer
 * than fighting generics — the same call lib/queries/stays.ts makes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toIntent(data: any): TopupIntent | null {
  const amountUsd = num(data.amount_usd);
  if (amountUsd === null || amountUsd <= 0) {
    console.error('[wallet/topup] intent has no usable amount', { intentId: data.id });
    return null;
  }

  return {
    id: data.id as string,
    profileId: data.profile_id as string,
    amountUsd,
    status: data.status as TopupIntentStatus,
    gateway: (data.gateway as string | null) ?? null,
    currencyCode: (data.currency_code as string | null) ?? null,
    amountMinor: num(data.amount_minor),
    // fx_rate_to_usd, NOT fx_rate. The column and the RPC argument (p_fx_rate)
    // do not share a name, and reading the argument's name here returned null
    // on every intent — which the pay page turns into a 404, since an intent
    // with no rate is one it refuses to render.
    fxRate: num(data.fx_rate_to_usd),
    merchantOrderId: (data.merchant_order_id as string | null) ?? null,
    // bigint: PostgREST hands it back as a string, and it stays one — this is
    // an identifier to display and match on, never a number to do sums with.
    ledgerEntryNumber:
      data.ledger_entry_number === null || data.ledger_entry_number === undefined
        ? null
        : String(data.ledger_entry_number),
    failureReason: (data.failure_reason as string | null) ?? null,
  };
}

/**
 * Load an intent by the order id the gateway knows it as.
 *
 * The callback path's lookup — it has no session to check against, because a
 * cross-site POST from a bank or an aggregator carries no cookies. That is
 * exactly why the order id is unguessable and why the settle path re-confirms
 * the payment with the gateway before crediting anything: possession of an
 * order id proves nothing on its own.
 *
 * SERVICE-ROLE ONLY. There is no ownership check here to make.
 */
export async function loadTopupIntentByOrder(
  supabase: SupabaseClient,
  merchantOrderId: string,
): Promise<TopupIntent | null> {
  const { data, error } = await supabase
    .from('wallet_topup_intents')
    .select(INTENT_COLUMNS)
    .eq('merchant_order_id', merchantOrderId)
    .maybeSingle();

  if (error) {
    console.error('[wallet/topup] intent lookup by order failed', {
      merchantOrderId, message: error.message, code: error.code,
    });
    return null;
  }

  return data ? toIntent(data) : null;
}

/** PostgREST hands `numeric` back as a string; app_settings.value is text too. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}
