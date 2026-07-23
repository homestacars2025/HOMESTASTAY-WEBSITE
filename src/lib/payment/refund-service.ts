import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildRefundSoap, postRefundSoap, parseRefundResponse,
  isRefundApproved, isAlreadySettled, decideRefundType, toRefundConfig,
  type RefundConfig, type RefundOperation,
} from '@/lib/payment/kuveyt-refund';
import { toMinorUnits } from '@/lib/payment/kuveyt-turk';

/**
 * The refund state machine. Called by the /api/payment/refund route (owner
 * rejection, via pg_net) and — later — directly by the payment callback for the
 * duplicate_payment / booking_canceled anomalies. All three are FULL refunds.
 *
 * GATED: while REFUND_LIVE_ENABLED is not 'true' this never calls the bank —
 * SOAPAction and proxy routing to the BOA host are unconfirmed. It returns
 * 'gated' before any DB write, so the disabled phase is completely inert.
 */

export type RefundReason = 'rejected' | 'duplicate_payment' | 'booking_canceled';

export type RefundOutcome =
  | { status: 'refunded'; refundId: string; resRrn: string | null }
  | { status: 'already' }        // an active/succeeded refund already exists — no-op
  | { status: 'not_refundable'; detail: string }
  | { status: 'declined'; code: string | null; message: string | null }
  | { status: 'pending' }        // bank unreachable — money state unknown, reconcile
  | { status: 'gated' }
  | { status: 'error' };

function liveEnabled(): boolean {
  return process.env.REFUND_LIVE_ENABLED === 'true';
}

/** Reads prod credentials + proxy routing from env for one operation. */
function configFor(operation: RefundOperation): RefundConfig {
  return toRefundConfig(operation, {
    merchantId: process.env.KUVEYT_MERCHANT_ID    ?? '',
    customerId: process.env.KUVEYT_CUSTOMER_ID    ?? '',
    userName:   process.env.KUVEYT_API_USERNAME   ?? '',
    password:   process.env.KUVEYT_API_PASSWORD   ?? '',
    proxyBase:  process.env.KUVEYT_PROXY_BASE_URL ?? '',
    servicePath: process.env.KUVEYT_REFUND_SERVICE_PATH,
    soapActionBase: process.env.KUVEYT_REFUND_SOAP_ACTION_BASE,
  });
}

export async function performRefund(params: {
  merchantOrderId: string;
  reason: RefundReason;
}): Promise<RefundOutcome> {
  const { merchantOrderId, reason } = params;
  const supabase = createAdminClient();

  // ── Load the paid attempt and validate it can be refunded ──────────────────
  const { data: payment } = await supabase
    .from('booking_payments')
    .select('id, booking_id, status, amount_try, merchant_order_id, rrn, stan, provision_number, bank_order_id, paid_at')
    .eq('merchant_order_id', merchantOrderId)
    .maybeSingle();

  if (!payment) return { status: 'not_refundable', detail: 'unknown merchant_order_id' };
  if (payment.status !== 'paid') {
    return { status: 'not_refundable', detail: `payment status is ${payment.status}, not paid` };
  }
  // Every bank reference is mandatory — without them a refund is impossible.
  if (!payment.rrn || !payment.stan || !payment.provision_number || !payment.bank_order_id) {
    return { status: 'not_refundable', detail: 'missing bank references on the paid attempt' };
  }

  // ── GATE ───────────────────────────────────────────────────────────────────
  // Removed once SOAPAction + proxy routing to boa.kuveytturk.com.tr are
  // confirmed on boatest. Until then no bank call and no DB write.
  if (!liveEnabled()) {
    console.warn('[refund] gated — REFUND_LIVE_ENABLED is off; no bank call made', {
      merchantOrderId, reason,
    });
    return { status: 'gated' };
  }

  const amountMinor = toMinorUnits(payment.amount_try as string);

  // ── Idempotency claim ──────────────────────────────────────────────────────
  // Insert the pending row; the partial unique index means a second caller
  // (pg_net retry, callback replay) inserts zero rows → we no-op.
  let txnType = decideRefundType(new Date(payment.paid_at as string), new Date(), false);

  const { data: claimed, error: claimError } = await supabase
    .from('booking_refunds')
    .insert({
      booking_payment_id:   payment.id,
      booking_id:           payment.booking_id,
      reason,
      txn_type:             txnType,
      amount_try:           payment.amount_try,
      status:               'pending',
      merchant_order_id:    merchantOrderId,
      req_rrn:              payment.rrn,
      req_stan:             payment.stan,
      req_provision_number: payment.provision_number,
      req_order_id:         payment.bank_order_id,
    })
    .select('id')
    .maybeSingle();

  if (claimError) {
    // Unique-violation → an active refund already exists. Anything else is real.
    if (claimError.code === '23505') return { status: 'already' };
    console.error('[refund] could not claim refund row', { merchantOrderId, error: claimError.message });
    return { status: 'error' };
  }
  if (!claimed) return { status: 'already' };
  const refundId = claimed.id as string;

  // ── Bank call, with SaleReversal → DrawBack fallback ───────────────────────
  const callBank = async (op: RefundOperation) => {
    const cfg = configFor(op);
    const soap = buildRefundSoap({
      cfg, operation: op,
      rrn: payment.rrn!, stan: payment.stan!,
      provisionNumber: payment.provision_number!, orderId: payment.bank_order_id!,
      merchantOrderId, amountMinor,
    });
    return parseRefundResponse(await postRefundSoap(cfg, soap));
  };

  let result;
  try {
    result = await callBank(txnType);

    // Same-day SaleReversal rejected because the batch already settled → the
    // day heuristic was wrong; retry as DrawBack. One fallback, no loop.
    if (!isRefundApproved(result) && txnType === 'SaleReversal' && isAlreadySettled(result)) {
      console.warn('[refund] SaleReversal already settled — falling back to DrawBack', { merchantOrderId });
      txnType = 'DrawBack';
      await supabase.from('booking_refunds').update({ txn_type: 'DrawBack' }).eq('id', refundId);
      result = await callBank('DrawBack');
    }
  } catch (err) {
    // Bank unreachable / timeout: leave the row 'pending'. We do NOT know
    // whether the reversal went through, so never mark succeeded OR failed —
    // this is the row a reconciliation sweep must investigate.
    console.error('[refund] BANK UNREACHABLE — left pending, reconcile', {
      merchantOrderId, refundId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: 'pending' };
  }

  // ── Record the outcome ─────────────────────────────────────────────────────
  if (isRefundApproved(result)) {
    await supabase.from('booking_refunds').update({
      status:               'succeeded',
      res_rrn:              result.rrn,
      res_stan:             result.stan,
      res_provision_number: result.provisionNumber,
      res_order_id:         result.orderId,
      res_transaction_time: result.transactionTime,
      res_business_key:     result.businessKey,
      res_response_code:    result.responseCode,
      res_response_message: result.responseMessage,
    }).eq('id', refundId);

    // Flip the payment only from 'paid' — a guard against a concurrent change.
    const newStatus = txnType === 'PartialDrawback' ? 'partially_refunded' : 'refunded';
    await supabase
      .from('booking_payments')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', payment.id)
      .eq('status', 'paid');

    return { status: 'refunded', refundId, resRrn: result.rrn };
  }

  // Declined by the bank. Money did not go back. Mark failed, leave the payment
  // 'paid', and surface loudly for manual handling.
  console.error('[refund] DECLINED by bank', {
    merchantOrderId, refundId, code: result.responseCode, message: result.responseMessage,
  });
  await supabase.from('booking_refunds').update({
    status:               'failed',
    res_response_code:    result.responseCode,
    res_response_message: result.responseMessage,
  }).eq('id', refundId);

  return { status: 'declined', code: result.responseCode, message: result.responseMessage };
}
