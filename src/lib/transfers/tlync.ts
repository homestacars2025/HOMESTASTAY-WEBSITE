import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  tlyncConfig, tlyncDiagnostics, initiatePayment, fetchReceipt, isTlyncConfigured,
} from '@/lib/payment/tlync';
import { usdToLydRate } from '@/lib/payment/lyd-fx';
import { tlyncBackendUrl, tlyncFrontendUrl } from '@/lib/payment/urls';
import { isAccountLibyaEligible } from '@/lib/payment/libya-account';
import type { BookingAccount } from '@/lib/booking/account';
import { initTransferPayment, readPaymentAttempt } from '@/lib/transfers/server';
import { PAID_STATES } from '@/lib/transfers/model';

/**
 * TLYNC (Libya, LYD) for AIRPORT TRANSFERS. SERVER ONLY.
 *
 * The same rail as stays and wallet top-ups, with the same doctrine:
 *   • the dinar option is for Libyan guests — the SAME rule the app's
 *     /api/app/payment/methods reports (isAccountLibyaEligible: profile phone
 *     +218, or nationality LY on the account's customer record), and the same
 *     "a usable LYD rate exists" condition;
 *   • the rate is the SAME one the stay flow uses (usdToLydRate), passed to
 *     transfer_payment_init, which prices the attempt — the LYD figure is the
 *     database's, never this code's;
 *   • the callback and the return are DOORBELLS: every verdict comes from
 *     receipt/transaction, server-to-server;
 *   • 'incomplete' / 'not_found' are NOT failures (that mistake cost real
 *     money on stays — see wallet-tlync-settle.ts). Only a gateway refusal at
 *     initiate, when no page was ever shown, is written as failed. Time —
 *     the transfer's payment window, in the database — ends the rest.
 *
 * The TRF… merchant_order_id from transfer_payment_init IS the custom_ref:
 * every attempt already has its own fresh id, and transfer_complete_payment /
 * transfer_payment_fail look the row up by exactly that value.
 */

export type StartTlyncResult =
  | { ok: true; merchantOrderId: string; payUrl: string; amountLyd: number; amountUsd: number | null; fxRateLyd: number }
  | { ok: false; status: number; error: string };

export async function startTransferTlync({
  admin, transferId, account, locale, appReturn,
}: {
  admin: SupabaseClient;
  transferId: string;
  account: BookingAccount;
  locale: string;
  /** Already validated by parseAppReturnUrl, or null. */
  appReturn: string | null;
}): Promise<StartTlyncResult> {
  const no = (status: number, error: string): StartTlyncResult => ({ ok: false, status, error });

  // ── Allowed? Checked BEFORE an attempt row exists ────────────────────────
  if (!isTlyncConfigured()) return no(400, 'invalid_gateway');
  if (!(await isAccountLibyaEligible(account))) {
    console.warn('[transfers/tlync] refused — account is not Libya-eligible', { profileId: account.profileId, transferId });
    return no(400, 'invalid_gateway');
  }
  const phone = account.phone?.trim() ?? '';
  if (!phone) return no(400, 'phone_required');

  // ── The rate the stay flow uses ──────────────────────────────────────────
  const fx = await usdToLydRate(admin);
  if (!fx) return no(503, 'rate_unavailable');

  // ── The attempt, priced by the database ──────────────────────────────────
  const attempt = await initTransferPayment(admin, transferId, { gateway: 'tlync', fxRateLyd: fx.rate });
  switch (attempt.status) {
    case 'ok': break;
    case 'not_payable':
      return no(200, attempt.transferStatus && PAID_STATES.has(attempt.transferStatus) ? 'already_paid' : 'not_payable');
    case 'expired': return no(200, 'expired');
    case 'not_found':
    case 'forbidden': return no(404, 'not_found');
    default: return no(500, 'server_error');
  }
  const customRef = attempt.merchantOrderId;
  const amountLyd = attempt.amountLyd as number; // checked > 0 by initTransferPayment

  // ── TLYNC ────────────────────────────────────────────────────────────────
  let cfg;
  try {
    cfg = tlyncConfig();
  } catch (err) {
    console.error('[transfers/tlync] config invalid', { customRef, error: err instanceof Error ? err.message : String(err) });
    await failTransferPayment(admin, customRef, 'tlync_unconfigured', 'tlync_unconfigured');
    return no(502, 'gateway_unavailable');
  }
  const diagnostics = tlyncDiagnostics(cfg);
  console.log('[transfers/tlync] target', { customRef, ...diagnostics });

  // Our return route, never the deep link directly: it settles from the
  // receipt FIRST, then wakes the app. `via=app` tells it to wake the app even
  // when the app sent no returnUrl (the APP_TRANSFER_RETURN_URL fallback).
  const frontend = new URL(tlyncFrontendUrl(locale, customRef, appReturn));
  frontend.searchParams.set('via', 'app');

  let initiated;
  try {
    initiated = await initiatePayment(cfg, {
      amountLyd,
      phone,
      email: account.email,
      backendUrl: tlyncBackendUrl(),
      frontendUrl: frontend.toString(),
      customRef,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[transfers/tlync] initiate threw', { customRef, endpoint: diagnostics.initiateUrl, error: detail });
    // No page was ever handed to the guest: nothing can be paid on this ref.
    await failTransferPayment(admin, customRef, 'tlync_unreachable', detail);
    return no(502, 'gateway_unavailable');
  }

  if (!initiated.ok) {
    console.error('[transfers/tlync] initiate refused', {
      customRef, httpStatus: initiated.status, endpoint: initiated.endpoint, sent: initiated.sent, rawBody: initiated.raw,
    });
    await failTransferPayment(admin, customRef, 'tlync_refused', `status=${initiated.status} body=${initiated.raw}`);
    return no(502, 'gateway_unavailable');
  }

  console.log('[transfers/tlync] hosted page issued', { customRef, amountLyd, rate: fx.rate, rateSource: fx.source });
  return { ok: true, merchantOrderId: customRef, payUrl: initiated.url, amountLyd, amountUsd: attempt.amountUsd, fxRateLyd: fx.rate };
}

// ── Settlement ───────────────────────────────────────────────────────────────

export type TransferSettleTrigger = 'callback' | 'return' | 'reconcile';

export type TransferSettleOutcome = { transferId: string | null } & (
  | { status: 'paid' | 'already_paid' }
  /** Charged, but the transfer cannot take it — the database flags it for a refund. */
  | { status: 'refund_required'; dbStatus: string }
  /** TLYNC knows it and it is not finished (yet). Nothing written. */
  | { status: 'not_completed' }
  /** We could not ask TLYNC. NOT a verdict — nothing written. */
  | { status: 'receipt_unavailable' }
  /** Collected less than quoted. Never completed on a shortfall. */
  | { status: 'amount_mismatch' }
  | { status: 'unknown_ref' | 'wrong_gateway' | 'write_failed' | 'error' }
);

export async function settleTransferTlync(
  admin: SupabaseClient,
  { customRef, transactionRef, trigger }: { customRef: string; transactionRef?: string | null; trigger: TransferSettleTrigger },
): Promise<TransferSettleOutcome> {
  const row = await readPaymentAttempt(admin, customRef);
  if (!row) {
    console.error('[transfers/tlync-settle] unknown custom_ref', { customRef, trigger });
    return { status: 'unknown_ref', transferId: null };
  }
  const transferId = row.transferId;
  if (row.gateway !== 'tlync') {
    console.error('[transfers/tlync-settle] not a tlync attempt', { customRef, trigger, gateway: row.gateway });
    return { status: 'wrong_gateway', transferId };
  }
  if (row.status === 'paid') return { status: 'already_paid', transferId };

  // ── The source of truth ──────────────────────────────────────────────────
  let receipt;
  try {
    receipt = await fetchReceipt(tlyncConfig(), { customRef, transactionRef: transactionRef ?? undefined });
  } catch (err) {
    console.error('[transfers/tlync-settle] receipt call threw', { customRef, trigger, error: err instanceof Error ? err.message : String(err) });
    return { status: 'receipt_unavailable', transferId };
  }

  if (receipt.result === 'error') {
    console.error('[transfers/tlync-settle] RECEIPT UNAVAILABLE — attempt left as-is', { customRef, trigger, status: receipt.status, message: receipt.message });
    return { status: 'receipt_unavailable', transferId };
  }
  if (receipt.result === 'incomplete' || receipt.result === 'not_found') {
    // Not a failure: TLYNC has no failure verdict, and 'incomplete' can turn
    // into a collected payment a minute later. Left for the sweep.
    console.log('[transfers/tlync-settle] not completed yet — untouched', { customRef, trigger, receipt: receipt.result });
    return { status: 'not_completed', transferId };
  }

  // ── Confirmed success ────────────────────────────────────────────────────
  const expected = row.amountLyd;
  if (expected !== null && receipt.amount !== null && receipt.amount + 0.01 < expected) {
    console.error('[transfers/tlync-settle] AMOUNT MISMATCH — transfer NOT completed', { customRef, trigger, expected, collected: receipt.amount });
    return { status: 'amount_mismatch', transferId };
  }

  const { data, error } = await admin.rpc('transfer_complete_payment', {
    p_merchant_order_id: customRef,
    p_bank_order_id: null,
    p_provision_number: null,
    p_rrn: null,
    p_stan: null,
  });
  if (error) {
    console.error('[transfers/tlync-settle] transfer_complete_payment errored — MONEY MOVED', { customRef, trigger, message: error.message, code: error.code });
    return { status: 'write_failed', transferId };
  }

  // Best effort: which Libyan method and which TLYNC transaction — what staff
  // need to find the payment for a manual refund. Never blocks settlement.
  const note = `tlync method=${receipt.paymentMethod ?? '?'} tx=${receipt.transactionRef ?? transactionRef ?? '?'} lyd=${receipt.amount ?? expected ?? '?'}`;
  const { error: noteErr } = await admin
    .from('transfer_payments')
    .update({ response_message: note.slice(0, 500) })
    .eq('merchant_order_id', customRef);
  if (noteErr) console.warn('[transfers/tlync-settle] could not record the receipt note', { customRef, code: noteErr.code });

  const status = String((Array.isArray(data) ? data[0] : data)?.status ?? data);
  switch (status) {
    case 'ok':
      console.log('[transfers/tlync-settle] transfer paid', { customRef, trigger, method: receipt.paymentMethod });
      return { status: 'paid', transferId };
    case 'already_paid':
      return { status: 'already_paid', transferId };
    case 'transfer_canceled':
    case 'duplicate':
    case 'refunded':
      console.error('[transfers/tlync-settle] CHARGED — refund case', { customRef, trigger, status });
      return { status: 'refund_required', dbStatus: status, transferId };
    default:
      console.error('[transfers/tlync-settle] CHARGED BUT NOT COMPLETED — needs manual resolution', { customRef, trigger, status });
      return { status: 'error', transferId };
  }
}

/** transfer_payment_fail — only where NO money can have moved. */
export async function failTransferPayment(admin: SupabaseClient, merchantOrderId: string, code: string, message: string): Promise<void> {
  const { error } = await admin.rpc('transfer_payment_fail', {
    p_merchant_order_id: merchantOrderId,
    p_response_code: code,
    p_response_message: message.slice(0, 2000),
  });
  if (error) console.error('[transfers/tlync] transfer_payment_fail errored', { merchantOrderId, code, message: error.message });
}
