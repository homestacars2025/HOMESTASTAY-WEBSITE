import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  tlyncConfig, fetchReceipt, parseAmountNote, encodeAmountNote,
} from '@/lib/payment/tlync';
import { sendBookingConfirmation } from '@/lib/booking/confirmation-email';

/**
 * Settling a TLYNC payment — the ONE place a TLYNC booking becomes paid.
 *
 * WHY THIS IS NO LONGER CALLBACK-ONLY
 *   The original design let only backend_url mark a payment paid. That rule
 *   was written to keep an untrusted browser out of the decision — and it is
 *   right about that. But it also assumed TLYNC would actually POST
 *   backend_url, and in UAT it does not: payments confirmed 'success' by
 *   receipt/transaction sat at 3ds_pending for days with no callback ever
 *   arriving, until their holds expired and the bookings were cancelled.
 *
 *   The security intent is preserved exactly, because the protection was never
 *   "the callback is trustworthy" — it was "we re-confirm with TLYNC before
 *   believing anything". That check lives here, at the top, and runs no matter
 *   who called. A browser can ask us to look; it cannot tell us what we saw.
 *   So a guest returning from TLYNC, a callback, and a reconciliation sweep all
 *   go through this same door.
 *
 * IDEMPOTENT. Every entry point can fire concurrently and repeatedly: the
 * status guard on the paid UPDATE, the partial unique index on (booking_id)
 * WHERE status='paid', and the `.is('paid_at', null)` guard on the booking all
 * mean the second caller changes nothing and sends no second email.
 */

/** The 12-hour owner window. Identical to complete_payment's, by requirement. */
const OWNER_DECISION_HOURS = 12;

export type SettleTrigger = 'callback' | 'return' | 'reconcile';

export type SettleOutcome =
  | { status: 'paid';                reference: string | null; revived: boolean }
  | { status: 'already_paid';        reference: string | null }
  | { status: 'not_completed';       receipt: 'incomplete' | 'not_found' }
  | { status: 'receipt_unavailable'; message: string }
  | { status: 'amount_mismatch';     expected: number | null; collected: number | null }
  | { status: 'refund_required';     reference: string | null; reason: 'double_payment' | 'expired' }
  | { status: 'unknown_ref' }
  | { status: 'wrong_gateway' }
  | { status: 'already_refunded' }
  | { status: 'write_failed';        message: string };

export async function settleTlyncPayment(
  supabase: SupabaseClient,
  input: {
    customRef: string;
    /** From a callback body, when there is one. The receipt is asked either way. */
    transactionRef?: string | null;
    trigger: SettleTrigger;
  },
): Promise<SettleOutcome> {
  const { customRef, trigger } = input;
  const transactionRef = input.transactionRef ?? null;
  const log = (msg: string, extra: Record<string, unknown> = {}) =>
    console.log(`[tlync/settle] ${msg}`, { customRef, trigger, ...extra });

  const { data: attempt } = await supabase
    .from('booking_payments')
    .select('id, booking_id, status, amount_try, amount_usd, amount_lyd, fx_rate_lyd, response_message, payment_gateway')
    .eq('merchant_order_id', customRef)
    .maybeSingle();

  if (!attempt) {
    console.error('[tlync/settle] unknown custom_ref', { customRef, trigger });
    return { status: 'unknown_ref' };
  }

  // A Kuveyt attempt must never be settled here: it would record a card
  // payment with no bank references, which is a payment we could not refund.
  if (attempt.payment_gateway !== 'tlync') {
    console.error('[tlync/settle] ref belongs to a non-tlync attempt — refusing', {
      customRef, trigger, gateway: attempt.payment_gateway,
    });
    return { status: 'wrong_gateway' };
  }

  if (attempt.status === 'paid') {
    const { data: b } = await supabase
      .from('bookings').select('booking_reference').eq('id', attempt.booking_id).maybeSingle();
    log('already paid — nothing to do');
    return { status: 'already_paid', reference: b?.booking_reference ?? null };
  }

  if (attempt.status === 'refunded' || attempt.status === 'partially_refunded') {
    console.error('[tlync/settle] refunded attempt reported as paid — not writing', {
      customRef, trigger, status: attempt.status,
    });
    return { status: 'already_refunded' };
  }

  // ── The source of truth, asked on every path ─────────────────────────────
  const receipt = await fetchReceipt(tlyncConfig(), {
    customRef,
    transactionRef: transactionRef ?? undefined,
  });

  log('receipt', {
    result: receipt.result,
    ...(receipt.result === 'success'
      ? {
          amount: receipt.amount,
          paymentMethod: receipt.paymentMethod,
          transactionRef: receipt.transactionRef,
          // ⚠️ TEMPORARY: TLYNC's receipt shape is undocumented and reading it
          // wrong is what stalled every payment. Keep this until the parsed
          // fields are confirmed non-null in production, then drop it.
          rawReceipt: receipt.raw,
        }
      : receipt.result === 'error'
      ? { httpStatus: receipt.status, message: receipt.message }
      : {}),
  });

  if (receipt.result === 'error') {
    // We do not know. Never write a verdict on "do not know".
    console.error('[tlync/settle] RECEIPT UNAVAILABLE — attempt left as-is', {
      customRef, trigger, status: receipt.status, message: receipt.message,
    });
    return { status: 'receipt_unavailable', message: receipt.message };
  }

  if (receipt.result === 'incomplete' || receipt.result === 'not_found') {
    await supabase
      .from('booking_payments')
      .update({
        status:        'failed',
        response_code: `tlync_${receipt.result}`,
        updated_at:    new Date().toISOString(),
      })
      .eq('merchant_order_id', customRef)
      .neq('status', 'paid');
    log('not completed — attempt marked failed', { receipt: receipt.result });
    return { status: 'not_completed', receipt: receipt.result };
  }

  // ── Confirmed success ─────────────────────────────────────────────────────
  const note = parseAmountNote(attempt.response_message as string | null);
  const expected = {
    lyd:  num(attempt.amount_lyd)  ?? note?.lyd  ?? null,
    rate: num(attempt.fx_rate_lyd) ?? note?.rate ?? null,
  };

  // The underpayment guard runs only when TLYNC actually tells us an amount.
  // An ABSENT amount is not a zero payment — conflating the two refused to
  // settle payments TLYNC had confirmed as 'success'. When the amount is
  // unknown we trust the 'success' verdict and record what we quoted, which is
  // what the guest agreed to pay.
  if (expected.lyd !== null && receipt.amount !== null && receipt.amount + 0.01 < expected.lyd) {
    console.error('[tlync/settle] AMOUNT MISMATCH — not marking paid', {
      customRef, trigger, expectedLyd: expected.lyd, receiptLyd: receipt.amount,
    });
    return { status: 'amount_mismatch', expected: expected.lyd, collected: receipt.amount };
  }

  if (receipt.amount === null) {
    console.warn('[tlync/settle] receipt carried no amount — settling on the quoted figure', {
      customRef, trigger, quotedLyd: expected.lyd,
    });
  }

  const settledLyd = receipt.amount ?? expected.lyd;

  if (settledLyd !== null && expected.lyd !== null && Math.abs(settledLyd - expected.lyd) > 0.01) {
    console.warn('[tlync/settle] collected amount differs from quoted', {
      customRef, trigger, expectedLyd: expected.lyd, collectedLyd: settledLyd,
    });
  }

  const resolvedTxRef = receipt.transactionRef ?? transactionRef;

  // ── The paid transition ───────────────────────────────────────────────────
  // Payment row first, booking second — the ordering complete_payment uses,
  // and what lets the partial unique index do its job.
  const { data: paidRows, error: paidError } = await supabase
    .from('booking_payments')
    .update({
      status:          'paid',
      paid_at:         new Date().toISOString(),
      // VERBATIM from TLYNC — tells staff which Libyan portal a manual refund
      // has to be issued from.
      payment_method:  receipt.paymentMethod,
      // Lands in bank_order_id because refund_on_owner_reject reads exactly
      // that column into manual_refunds.tlync_transaction_ref.
      bank_order_id:   resolvedTxRef,
      ...(settledLyd !== null ? { amount_lyd: settledLyd } : {}),
      response_code:   'tlync_success',
      response_message: encodeAmountNote({
        lyd: settledLyd ?? 0, rate: expected.rate ?? 0,
        method: receipt.paymentMethod, tx: resolvedTxRef,
      }),
      updated_at:      new Date().toISOString(),
    })
    .eq('merchant_order_id', customRef)
    .neq('status', 'paid')
    .select('id, booking_id, amount_try');

  const refundInput = {
    paymentId: attempt.id as string,
    customRef,
    transactionRef: resolvedTxRef,
    paymentMethod: receipt.paymentMethod,
    amountTry: num(attempt.amount_try),
    amountLyd: settledLyd,
  };

  if (paidError) {
    // 23505 on booking_payments_one_paid_per_booking: another attempt already
    // paid for this booking. The money here is real and has to go back.
    if (paidError.code === '23505') {
      console.error('[tlync/settle] DUPLICATE PAYMENT — MANUAL REFUND REQUIRED', {
        customRef, trigger, bookingId: attempt.booking_id,
      });
      const reference = await queueManualRefund(supabase, {
        ...refundInput, bookingId: attempt.booking_id as string, reason: 'double_payment',
      });
      return { status: 'refund_required', reference, reason: 'double_payment' };
    }

    console.error('[tlync/settle] could not mark attempt paid — MONEY MOVED', {
      customRef, trigger, message: paidError.message, code: paidError.code,
    });
    return { status: 'write_failed', message: paidError.message };
  }

  if (!paidRows || paidRows.length === 0) {
    // Raced with another trigger, which won. Its side effects have run.
    const { data: b } = await supabase
      .from('bookings').select('booking_reference').eq('id', attempt.booking_id).maybeSingle();
    log('lost the race to another trigger — already settled');
    return { status: 'already_paid', reference: b?.booking_reference ?? null };
  }

  // ── The booking ───────────────────────────────────────────────────────────
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, booking_reference, status, paid_at, cancelled_reason, check_in, check_out, guests_count, total_amount_usd, amount_charged_try, customers(email)')
    .eq('id', attempt.booking_id)
    .maybeSingle();

  if (!booking) {
    console.error('[tlync/settle] paid attempt has no booking', { customRef, trigger });
    return { status: 'write_failed', message: 'no booking for paid attempt' };
  }

  const reference = (booking.booking_reference as string) ?? null;

  if (booking.paid_at) {
    console.error('[tlync/settle] booking already paid — MANUAL REFUND REQUIRED', {
      customRef, trigger, reference,
    });
    await queueManualRefund(supabase, {
      ...refundInput, bookingId: booking.id as string, reason: 'double_payment',
    });
    return { status: 'refund_required', reference, reason: 'double_payment' };
  }

  const paidFields = {
    paid_at:               new Date().toISOString(),
    payment_gateway:       'tlync',
    owner_decision_due_at: new Date(Date.now() + OWNER_DECISION_HOURS * 3_600_000).toISOString(),
  };

  let revived = false;

  if (booking.status !== 'hold') {
    // ── Recovery ───────────────────────────────────────────────────────────
    // The guest paid, but expire_holds() cancelled the booking while they were
    // still on TLYNC's page. Discarding a real payment because a cron beat it
    // is the worst outcome available: the guest is out of pocket and has no
    // stay. So the hold is reinstated in the same statement that marks it paid.
    //
    // bookings_no_overlap covers status IN ('confirmed','hold') only, which
    // makes this safe by construction: if someone else took the dates in the
    // gap, Postgres raises 23P01 and we refund instead of double-selling. That
    // constraint is the authority here, not a SELECT we could race against.
    const expiredHold =
      booking.status === 'canceled' &&
      /hold expired/i.test(String(booking.cancelled_reason ?? ''));

    if (!expiredHold) {
      console.error('[tlync/settle] paid onto a booking we cannot revive — MANUAL REFUND REQUIRED', {
        customRef, trigger, reference,
        bookingStatus: booking.status, cancelledReason: booking.cancelled_reason,
      });
      await queueManualRefund(supabase, {
        ...refundInput, bookingId: booking.id as string, reason: 'expired',
      });
      return { status: 'refund_required', reference, reason: 'expired' };
    }

    const { error: reviveError } = await supabase
      .from('bookings')
      .update({
        ...paidFields,
        status: 'hold',
        // The hold expired for a reason that no longer applies: it is paid.
        cancelled_reason: null,
        // Deliberately not set to null — bookings_set_hold_expiry re-derives it
        // when status becomes 'hold'. Harmless: expire_holds() only touches
        // rows with paid_at IS NULL, and this one is paid.
      })
      .eq('id', booking.id)
      .is('paid_at', null);

    if (reviveError) {
      // 23P01 exclusion_violation: the dates were resold in the gap.
      console.error('[tlync/settle] COULD NOT REVIVE EXPIRED HOLD — MANUAL REFUND REQUIRED', {
        customRef, trigger, reference,
        code: reviveError.code, message: reviveError.message,
      });
      await queueManualRefund(supabase, {
        ...refundInput, bookingId: booking.id as string, reason: 'expired',
      });
      return { status: 'refund_required', reference, reason: 'expired' };
    }

    revived = true;
    console.warn('[tlync/settle] revived an expired hold after a confirmed payment', {
      customRef, trigger, reference,
    });
  } else {
    // The paid_at NULL → NOT NULL edge fires trg_notify_booking_paid exactly
    // once — the existing owner prompt, identical for both gateways.
    // payment_gateway goes in the SAME statement so the trigger's NEW row
    // already knows which gateway paid.
    const { error: bookingError } = await supabase
      .from('bookings')
      .update({ ...paidFields, hold_expires_at: null })
      .eq('id', booking.id)
      .is('paid_at', null);

    if (bookingError) {
      console.error('[tlync/settle] attempt is paid but booking did not transition', {
        customRef, trigger, reference,
        message: bookingError.message, code: bookingError.code,
      });
      return { status: 'write_failed', message: bookingError.message };
    }
  }

  // Guest confirmation, once, on the genuine paid edge. after() so a slow PDF
  // render never holds the response open; it swallows its own errors.
  const email = (one(booking.customers) as { email: string | null } | undefined)?.email;
  if (email) {
    after(async () => {
      await sendBookingConfirmation({
        reference,
        email,
        checkIn:          booking.check_in as string,
        checkOut:         booking.check_out as string,
        guests:           booking.guests_count as number,
        totalUsd:         num(booking.total_amount_usd),
        amountChargedTry: num(booking.amount_charged_try),
        gateway:          'tlync',
        amountChargedLyd: settledLyd,
      });
    });
  } else {
    console.error('[tlync/settle] paid but no email to confirm to', {
      customRef, trigger, reference,
    });
  }

  console.log('[tlync/settle] PAID', {
    customRef, trigger, reference, revived,
    method: receipt.paymentMethod, amountLyd: settledLyd,
  });

  return { status: 'paid', reference, revived };
}

/**
 * Opens a manual refund and pings staff. Returns the booking reference.
 *
 * NOT the refund machinery — that is the DB's (refund_on_owner_reject) and
 * staff's. This covers the cases that trigger cannot see, because they happen
 * at payment time and involve no owner decision: money landing on an
 * already-paid booking, and money landing on a hold that expired and could not
 * be reinstated. Without it, a real payment in a currency with no refund API
 * would sit unrecorded and unrefunded.
 */
async function queueManualRefund(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    paymentId: string;
    customRef: string;
    transactionRef: string | null;
    paymentMethod: string | null;
    amountTry: number | null;
    amountLyd: number | null;
    reason: 'double_payment' | 'expired';
  },
): Promise<string | null> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('booking_reference')
    .eq('id', input.bookingId)
    .maybeSingle();

  const reference = (booking?.booking_reference as string) ?? null;

  const { data: rows, error } = await supabase
    .from('manual_refunds')
    .insert({
      booking_id:            input.bookingId,
      booking_reference:     reference,
      booking_payment_id:    input.paymentId,
      gateway:               'tlync',
      payment_method:        input.paymentMethod,
      amount_try:            input.amountTry,
      amount_lyd:            input.amountLyd,
      currency:              'LYD',
      tlync_custom_ref:      input.customRef,
      tlync_transaction_ref: input.transactionRef,
      reason:                input.reason,
      status:                'pending',
    })
    .select('id');

  if (error) {
    if (error.code === '23505') {
      console.warn('[tlync/settle] manual refund already open for booking', {
        bookingId: input.bookingId,
      });
      return reference;
    }
    console.error('[tlync/settle] COULD NOT QUEUE MANUAL REFUND — chase by hand', {
      bookingId: input.bookingId, customRef: input.customRef,
      message: error.message, code: error.code,
    });
    return reference;
  }

  const refundId = rows?.[0]?.id;
  if (refundId) {
    const { error: notifyError } = await supabase.rpc('notify_manual_refund', {
      p_refund_id: refundId,
    });
    if (notifyError) {
      console.error('[tlync/settle] manual refund queued but staff not notified', {
        refundId, message: notifyError.message,
      });
    }
  }

  return reference;
}

/** PostgREST returns an embedded to-one as either an object or a 1-element array. */
function one(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/** `numeric` can arrive as a string; coerce once. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
