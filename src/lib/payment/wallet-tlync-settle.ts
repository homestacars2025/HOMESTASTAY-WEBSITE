import type { SupabaseClient } from '@supabase/supabase-js';
import { tlyncConfig, fetchReceipt } from './tlync';
import { loadTopupIntentByOrder } from '@/lib/wallet/topup';

/**
 * Settles a TLYNC WALLET TOP-UP.
 *
 * The sibling of settleTlyncPayment, kept as a separate function on purpose:
 * that one is booking-shaped all the way down — it revives expired holds,
 * writes booking_payments, sends a confirmation email and can trigger a
 * refund. A top-up shares none of that. Branching inside it would have meant
 * threading "is this a booking?" through every step of a path that currently
 * settles real money correctly.
 *
 * WHAT IS SHARED IS THE PART THAT MATTERS: fetchReceipt. The doctrine is
 * identical and non-negotiable —
 *
 *   ⚠️ THE CALLBACK IS A DOORBELL, NOT A VERDICT.
 *   TLYNC publishes no signature scheme, so an inbound POST tells us WHICH
 *   payment to look at and nothing more. Every status decision below is made
 *   from receipt/transaction, fetched server-to-server with our store token.
 *   Anyone can ring the bell; nobody can credit a wallet by doing so.
 *
 *   ⚠️ AND IT MAY NEVER RING AT ALL.
 *   In UAT TLYNC has gone silent on payments its own receipt endpoint confirms
 *   as 'success'. So this function is called from three places — the callback,
 *   the guest's return, and the reconcile sweep — and must be safe to call
 *   repeatedly. It is: complete_wallet_topup is idempotent at the intent level
 *   ('already_paid') and at the entry level (idempotency_key =
 *   merchant_order_id).
 */

export type WalletSettleTrigger = 'callback' | 'return' | 'reconcile';

export type WalletSettleOutcome =
  | { status: 'paid'; newBalanceUsd: number | null; entryNumber: string | null }
  | { status: 'already_paid' }
  /** TLYNC knows it and the guest did not finish. Intent failed, wallet untouched. */
  | { status: 'not_completed'; receipt: 'incomplete' | 'not_found' }
  /** We could not reach the receipt endpoint. NOT a verdict — nothing written. */
  | { status: 'receipt_unavailable'; message: string }
  /** Collected less than quoted. Never credited on a shortfall. */
  | { status: 'amount_mismatch'; expected: number | null; collected: number | null }
  | { status: 'unknown_ref' }
  | { status: 'write_failed' }
  | { status: 'error' };

export async function settleWalletTopup(
  supabase: SupabaseClient,
  input: {
    /** TLYNC's custom_ref — which is this top-up's merchant_order_id. */
    customRef: string;
    transactionRef?: string | null;
    trigger: WalletSettleTrigger;
  },
): Promise<WalletSettleOutcome> {
  const { customRef, transactionRef, trigger } = input;

  const log = (msg: string, extra: Record<string, unknown> = {}) =>
    console.log(`[wallet/tlync-settle] ${msg}`, { customRef, trigger, ...extra });

  const intent = await loadTopupIntentByOrder(supabase, customRef);
  if (!intent) {
    console.error('[wallet/tlync-settle] unknown custom_ref', { customRef, trigger });
    return { status: 'unknown_ref' };
  }

  if (intent.status === 'paid') {
    log('intent already paid — nothing to do');
    return { status: 'already_paid' };
  }

  // ── The source of truth, asked on every path ─────────────────────────────
  let receipt;
  try {
    receipt = await fetchReceipt(tlyncConfig(), {
      customRef,
      transactionRef: transactionRef ?? undefined,
    });
  } catch (err) {
    // A config problem, not a payment verdict. Same rule as below: never write
    // an outcome on "we do not know".
    console.error('[wallet/tlync-settle] receipt call threw', {
      customRef, trigger, error: err instanceof Error ? err.message : String(err),
    });
    return { status: 'receipt_unavailable', message: 'receipt_threw' };
  }

  log('receipt', {
    result: receipt.result,
    ...(receipt.result === 'success'
      ? {
          amount: receipt.amount,
          paymentMethod: receipt.paymentMethod,
          transactionRef: receipt.transactionRef,
        }
      : receipt.result === 'error'
        ? { httpStatus: receipt.status, message: receipt.message }
        : {}),
  });

  if (receipt.result === 'error') {
    // We do not know. Leave the intent exactly as it is — the reconcile sweep
    // exists for precisely this state.
    console.error('[wallet/tlync-settle] RECEIPT UNAVAILABLE — intent left as-is', {
      customRef, trigger, status: receipt.status, message: receipt.message,
    });
    return { status: 'receipt_unavailable', message: receipt.message };
  }

  if (receipt.result === 'incomplete' || receipt.result === 'not_found') {
    const { error } = await supabase.rpc('fail_wallet_topup', {
      p_merchant_order_id: customRef,
      p_reason: `tlync_${receipt.result}`,
    });
    if (error) {
      console.error('[wallet/tlync-settle] fail_wallet_topup errored', {
        customRef, trigger, message: error.message, code: error.code,
      });
    }
    log('not completed — intent failed, wallet untouched', { receipt: receipt.result });
    return { status: 'not_completed', receipt: receipt.result };
  }

  // ── Confirmed success ─────────────────────────────────────────────────────
  // The underpayment guard runs only when TLYNC actually tells us an amount.
  // An ABSENT amount is not a zero payment — conflating the two is what stalled
  // confirmed booking payments. When the amount is unknown we trust the
  // 'success' verdict and credit what was quoted, which is what the guest
  // agreed to pay.
  const expectedLyd = intent.amountMinor;

  if (
    expectedLyd !== null &&
    receipt.amount !== null &&
    receipt.amount + 0.01 < expectedLyd
  ) {
    // Crediting a wallet for more than was collected is the one mistake here
    // that creates money out of nothing. Refuse and leave it for a human.
    console.error('[wallet/tlync-settle] AMOUNT MISMATCH — wallet NOT credited', {
      customRef, trigger, expectedLyd, receiptLyd: receipt.amount,
    });
    return { status: 'amount_mismatch', expected: expectedLyd, collected: receipt.amount };
  }

  if (receipt.amount === null) {
    console.warn('[wallet/tlync-settle] receipt carried no amount — settling on the quoted figure', {
      customRef, trigger, quotedLyd: expectedLyd,
    });
  }

  // ── The credit ────────────────────────────────────────────────────────────
  const { data, error } = await supabase.rpc('complete_wallet_topup', {
    p_merchant_order_id: customRef,
  });

  if (error) {
    console.error('[wallet/tlync-settle] complete_wallet_topup errored — MONEY MOVED', {
      customRef, trigger, message: error.message, code: error.code,
    });
    return { status: 'write_failed' };
  }

  const payload = (Array.isArray(data) ? data[0] : data) as
    | { status?: string; new_balance_usd?: unknown; entry_number?: string | null }
    | null;

  switch (payload?.status) {
    case 'paid':
      log('wallet credited', { entryNumber: payload.entry_number });
      return {
        status: 'paid',
        newBalanceUsd: num(payload.new_balance_usd),
        entryNumber: payload.entry_number ?? null,
      };
    case 'already_paid':
      return { status: 'already_paid' };
    case 'unknown_order':
      console.error('[wallet/tlync-settle] complete_wallet_topup does not know this order', {
        customRef, trigger,
      });
      return { status: 'unknown_ref' };
    default:
      // failed | expired | canceled — TLYNC says success but the intent is not
      // creditable. Deliberately loud: the guest may have been charged.
      console.error('[wallet/tlync-settle] receipt success but intent not creditable', {
        customRef, trigger, status: payload?.status,
      });
      return { status: 'error' };
  }
}

/** PostgREST hands `numeric` back as a string. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
