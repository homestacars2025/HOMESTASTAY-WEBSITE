import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  kuveytConfig, provisionGateUrl, buildProvisionXml, postToBank, parseProvisionResponse,
  isApproved, hasRefundReferences, toMinorUnits,
} from '@/lib/payment/kuveyt-turk';
import { num, str } from '@/lib/transfers/model';

/**
 * The TRANSFER branch of the shared Kuveyt callback (api/payment/callback):
 * every order id that starts with "TRF" comes here, before any booking or
 * wallet table is read. The same three steps as the stay branch:
 *
 *   1. the 3-D Secure verdict    (code '00' + an MD, else failed)
 *   2. ProvisionGate             (the bank's server-side approval — the trust)
 *   3. transfer_complete_payment (service role, idempotent)
 *
 * against transfer_payments. Failures are written to that row (status
 * 'failed', response_code, response_message).
 *
 * THE CALLBACK KNOWS NO LOCALE, NO SESSION, AND NOT WHETHER THE APP STARTED
 * THIS (a cross-site POST carries no cookies). It hands over to
 * /api/payment/transfer/return — a top-level GET that DOES get the Lax return
 * cookie — which sends the guest to the app or to the result page.
 */

type Hint = 'success' | 'failed' | 'pending' | 'refund';

export async function handleTransferPayment({
  request, supabase, merchantOrderId, md, responseCode, responseMessage,
}: {
  request: NextRequest;
  supabase: SupabaseClient;
  merchantOrderId: string;
  md: string;
  responseCode: string;
  responseMessage: string;
}): Promise<NextResponse> {
  let transferId: string | null = null;

  const back = (r: Hint, reason?: string) => {
    const q = new URLSearchParams({ order: merchantOrderId, r });
    if (reason) q.set('reason', reason);
    if (transferId) q.set('transfer', transferId);
    return NextResponse.redirect(new URL(`/api/payment/transfer/return?${q}`, request.url), { status: 303 });
  };

  const markFailed = async (code: string, message: string) => {
    const { error } = await supabase
      .from('transfer_payments')
      .update({ status: 'failed', response_code: code || null, response_message: message || null })
      .eq('merchant_order_id', merchantOrderId)
      .neq('status', 'paid');
    if (error) console.error('[transfer/callback] could not record the failure', { merchantOrderId, code: error.code });
  };

  // The attempt (and which transfer it pays — the column name is read
  // defensively, it is only needed for the redirect).
  const { data: row, error: rowErr } = await supabase
    .from('transfer_payments')
    .select('*')
    .eq('merchant_order_id', merchantOrderId)
    .maybeSingle();
  if (rowErr) console.error('[transfer/callback] attempt unreadable', { merchantOrderId, code: rowErr.code });
  const attempt = (row ?? null) as Record<string, unknown> | null;
  transferId = attempt ? str(attempt.transfer_id) ?? str(attempt.transfer_booking_id) ?? str(attempt.booking_id) : null;

  // ── 1. 3-D Secure itself failed — no money moved ─────────────────────────
  if (!md || (responseCode && responseCode !== '00')) {
    console.warn('[transfer/callback] 3DS declined', { merchantOrderId, responseCode, responseMessage });
    await markFailed(responseCode, responseMessage || '3ds_declined');
    return back('failed', 'declined');
  }

  if (!attempt) {
    console.error('[transfer/callback] unknown merchant order id', { merchantOrderId });
    return back('failed', 'unknown');
  }

  // A replayed callback on a paid attempt: never a second ProvisionGate call.
  if (attempt.status === 'paid') return back('success');

  const amountTry = num(attempt.amount_try);
  if (amountTry === null || amountTry <= 0) {
    console.error('[transfer/callback] attempt has no TRY amount', { merchantOrderId });
    return back('pending', 'server');
  }

  // ── 2. ProvisionGate — Request 2's amount equals Request 1's exactly ─────
  let provision;
  try {
    const cfg = kuveytConfig();
    const xml = buildProvisionXml({ cfg, merchantOrderId, amountMinor: toMinorUnits(amountTry.toFixed(2)), md });
    provision = parseProvisionResponse(await postToBank(provisionGateUrl(cfg), xml));
  } catch (err) {
    // DELIBERATELY NOT FAILED: we do not know whether the money moved.
    console.error('[transfer/callback] PROVISION UNKNOWN — reconcile manually', {
      merchantOrderId, error: err instanceof Error ? err.message : String(err),
    });
    return back('pending');
  }

  if (!isApproved(provision)) {
    console.warn('[transfer/callback] provision declined', {
      merchantOrderId, responseCode: provision.responseCode, responseMessage: provision.responseMessage,
    });
    await markFailed(provision.responseCode ?? '', provision.responseMessage ?? 'provision_declined');
    return back('failed', 'declined');
  }

  // Same rule as stays: a payment we could not give back is not recorded as
  // paid on our side — it is left for a human, loudly.
  if (!hasRefundReferences(provision)) {
    console.error('[transfer/callback] APPROVED WITHOUT REFUND REFERENCES — needs manual resolution', {
      merchantOrderId, orderId: provision.orderId, provisionNumber: provision.provisionNumber, rrn: provision.rrn, stan: provision.stan,
    });
    return back('pending');
  }

  console.log('[transfer/callback] provision approved', {
    merchantOrderId, orderId: provision.orderId, provisionNumber: provision.provisionNumber, rrn: provision.rrn, stan: provision.stan,
  });

  // ── 3. The paid transition ───────────────────────────────────────────────
  const { data, error } = await supabase.rpc('transfer_complete_payment', {
    p_merchant_order_id: merchantOrderId,
    p_bank_order_id:     provision.orderId,
    p_provision_number:  provision.provisionNumber,
    p_rrn:               provision.rrn,
    p_stan:              provision.stan,
  });
  if (error) {
    console.error('[transfer/callback] transfer_complete_payment errored — MONEY MOVED', {
      merchantOrderId, message: error.message, code: error.code,
    });
    return back('pending');
  }

  const status = (Array.isArray(data) ? data[0] : data)?.status ?? data;
  switch (status) {
    case 'ok':
    case 'already_paid':
      return back('success');
    case 'transfer_canceled':
    case 'duplicate':
    case 'refunded':
      // Charged, but the reservation cannot take it (paid after the window,
      // a second payment, …): the database keeps the money flagged for a
      // refund by staff. The guest is told plainly.
      console.error('[transfer/callback] CHARGED — refund case', { merchantOrderId, status, rrn: provision.rrn });
      return back('refund', String(status));
    default:
      console.error('[transfer/callback] CHARGED BUT NOT COMPLETED — needs manual resolution', {
        merchantOrderId, status, orderId: provision.orderId, rrn: provision.rrn,
      });
      return back('pending');
  }
}
