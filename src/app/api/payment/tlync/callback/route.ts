import { NextResponse, after, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  tlyncConfig, fetchReceipt, parseAmountNote, encodeAmountNote,
} from '@/lib/payment/tlync';
import { sendBookingConfirmation } from '@/lib/booking/confirmation-email';

/**
 * TLYNC's server-to-server callback (backend_url).
 *
 * ⚠️ THE CALLBACK IS A DOORBELL, NOT A VERDICT.
 *   TLYNC publishes no signature scheme for this POST, so its body is treated
 *   as untrusted in full: it tells us WHICH payment to look at and nothing
 *   more. Every status decision below comes from receipt/transaction, called
 *   server-to-server with our store token. Anyone can POST here; nobody can
 *   make a booking paid by doing so.
 *
 * Resolution is by custom_ref, which we generated and stored in
 * booking_payments.merchant_order_id. No cookies arrive on this request — the
 * ref is the only identity there is.
 *
 * Idempotent by construction: TLYNC may retry, and a replay must produce the
 * same answer, no second email, and above all no second owner notification.
 *
 * Returns plain JSON — this endpoint is never seen by a guest. The browser
 * journey is /api/payment/tlync/return.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The 12-hour owner window. Identical to complete_payment's, by requirement. */
const OWNER_DECISION_HOURS = 12;

export async function POST(request: NextRequest) {
  // ── Optional network-level narrowing ──────────────────────────────────────
  // TLYNC has not published its egress IPs. If they ever do, set
  // TLYNC_CALLBACK_IPS and this becomes a real filter; unset, it is a no-op
  // and the receipt check remains the only thing standing between a forged
  // POST and a booking — which is by design, not by omission.
  const allowed = (process.env.TLYNC_CALLBACK_IPS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  if (allowed.length > 0) {
    const ip =
      request.headers.get('x-real-ip')?.trim() ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      '';
    if (!allowed.includes(ip)) {
      console.warn('[tlync/callback] rejected callback from unlisted ip', { ip });
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }
  }

  // ── Read the body once, tolerate either encoding ──────────────────────────
  const contentType = request.headers.get('content-type') ?? '';
  let raw = '';
  try {
    raw = await request.text();
  } catch (err) {
    console.error('[tlync/callback] unreadable body', {
      contentType, error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, error: 'unreadable' }, { status: 400 });
  }

  const payload = parseBody(raw, contentType);

  const customRef =
    pick(payload, 'custom_ref') ?? pick(payload, 'customRef') ?? '';
  const transactionRef =
    pick(payload, 'transaction_ref') ?? pick(payload, 'transactionRef') ??
    pick(payload, 'transaction_id') ?? null;

  if (!customRef) {
    console.error('[tlync/callback] no custom_ref in callback', {
      contentType, keys: Object.keys(payload), body: raw.slice(0, 500),
    });
    return NextResponse.json({ ok: false, error: 'no_ref' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: attempt } = await supabase
    .from('booking_payments')
    .select('id, booking_id, status, amount_try, amount_usd, amount_lyd, fx_rate_lyd, response_message, payment_gateway')
    .eq('merchant_order_id', customRef)
    .maybeSingle();

  if (!attempt) {
    console.error('[tlync/callback] unknown custom_ref', { customRef });
    return NextResponse.json({ ok: false, error: 'unknown_ref' }, { status: 404 });
  }

  // A Kuveyt attempt must never be completed through this route: it would
  // record a card payment with no bank references, which is a payment we
  // could not refund.
  if (attempt.payment_gateway !== 'tlync') {
    console.error('[tlync/callback] ref belongs to a non-tlync attempt — refusing', {
      customRef, gateway: attempt.payment_gateway,
    });
    return NextResponse.json({ ok: false, error: 'wrong_gateway' }, { status: 409 });
  }

  if (attempt.status === 'paid') {
    // Callback replay. Same answer, no writes, no second email.
    return NextResponse.json({ ok: true, status: 'already_paid' });
  }

  if (attempt.status === 'refunded' || attempt.status === 'partially_refunded') {
    console.error('[tlync/callback] refunded attempt reported as paid — not writing', {
      customRef, status: attempt.status,
    });
    return NextResponse.json({ ok: false, error: 'already_refunded' }, { status: 409 });
  }

  // ── The source of truth ───────────────────────────────────────────────────
  const receipt = await fetchReceipt(tlyncConfig(), {
    customRef,
    transactionRef: transactionRef ?? undefined,
  });

  if (receipt.result === 'error') {
    // We do not know. Never write a verdict on "do not know" — leave the
    // attempt where it is and answer 502 so TLYNC retries.
    console.error('[tlync/callback] RECEIPT UNKNOWN — reconcile if it repeats', {
      customRef, status: receipt.status, message: receipt.message,
    });
    return NextResponse.json({ ok: false, error: 'receipt_unavailable' }, { status: 502 });
  }

  if (receipt.result === 'incomplete' || receipt.result === 'not_found') {
    console.warn('[tlync/callback] payment not completed', {
      customRef, receipt: receipt.result,
    });
    await supabase
      .from('booking_payments')
      .update({
        status:        'failed',
        response_code: `tlync_${receipt.result}`,
        updated_at:    new Date().toISOString(),
      })
      .eq('merchant_order_id', customRef)
      .neq('status', 'paid');
    // The hold is left to expire on its own, exactly as a declined card does.
    return NextResponse.json({ ok: true, status: receipt.result });
  }

  // ── Confirmed success. Check we were paid what we asked for ───────────────
  // amount_lyd / fx_rate_lyd are the source of truth, written with the
  // custom_ref before TLYNC was ever called. The note fallback exists only for
  // attempts started before those columns did, and can go once none are live.
  const note = parseAmountNote(attempt.response_message as string | null);
  const expected = {
    lyd:  num(attempt.amount_lyd)  ?? note?.lyd  ?? null,
    rate: num(attempt.fx_rate_lyd) ?? note?.rate ?? null,
  };

  if (expected.lyd !== null && receipt.amount !== null && receipt.amount + 0.01 < expected.lyd) {
    // Underpaid. Recording this as paid would hand over a stay for less than
    // its price and, worse, tell the guest they are done.
    console.error('[tlync/callback] AMOUNT MISMATCH — not marking paid', {
      customRef, expectedLyd: expected.lyd, receiptLyd: receipt.amount,
    });
    return NextResponse.json({ ok: false, error: 'amount_mismatch' }, { status: 409 });
  }

  // What actually moved. Normally identical to what we asked for;
  // underpayment already returned above, so a difference here can only be an
  // overpayment or a rounding cent. The collected figure wins, because
  // amount_lyd is what staff will refund by hand.
  const settledLyd = receipt.amount ?? expected.lyd;

  if (settledLyd !== null && expected.lyd !== null && Math.abs(settledLyd - expected.lyd) > 0.01) {
    console.warn('[tlync/callback] collected amount differs from quoted', {
      customRef, expectedLyd: expected.lyd, collectedLyd: settledLyd,
    });
  }

  const auditNote = encodeAmountNote({
    lyd:    settledLyd ?? 0,
    rate:   expected.rate ?? 0,
    method: receipt.paymentMethod,
    tx:     receipt.transactionRef ?? transactionRef,
  });

  // ── The paid transition ───────────────────────────────────────────────────
  // Two statements rather than one RPC: complete_payment demands RRN, Stan and
  // a provision number, which are card-network references TLYNC does not have
  // and must never be faked into that table.
  //
  // Payment row first, booking second — the same ordering complete_payment
  // uses, and the reason the partial unique index on (booking_id) WHERE
  // status = 'paid' can still do its job.
  const { data: paidRows, error: paidError } = await supabase
    .from('booking_payments')
    .update({
      status:          'paid',
      paid_at:         new Date().toISOString(),
      // VERBATIM from TLYNC — this string tells staff which Libyan portal a
      // manual refund has to be issued from.
      payment_method:  receipt.paymentMethod,
      // TLYNC's transaction reference lands in bank_order_id because
      // refund_on_owner_reject reads exactly that column into
      // manual_refunds.tlync_transaction_ref.
      bank_order_id:   receipt.transactionRef ?? transactionRef,
      // Re-asserted from the receipt so the row records what was collected,
      // not only what was quoted. This is the number a manual refund replays.
      ...(settledLyd !== null ? { amount_lyd: settledLyd } : {}),
      response_code:   'tlync_success',
      response_message: auditNote,
      updated_at:      new Date().toISOString(),
    })
    .eq('merchant_order_id', customRef)
    .neq('status', 'paid')
    .select('id, booking_id, amount_try');

  if (paidError) {
    // 23505 on booking_payments_one_paid_per_booking: another attempt already
    // paid for this booking. The money here is real and has to go back.
    if (paidError.code === '23505') {
      console.error('[tlync/callback] DUPLICATE PAYMENT — MANUAL REFUND REQUIRED', {
        customRef, bookingId: attempt.booking_id,
      });
      await queueManualRefund(supabase, {
        bookingId: attempt.booking_id as string,
        paymentId: attempt.id as string,
        customRef,
        transactionRef: receipt.transactionRef ?? transactionRef,
        paymentMethod: receipt.paymentMethod,
        amountTry: num(attempt.amount_try),
        amountLyd: settledLyd,
        reason: 'double_payment',
      });
      return NextResponse.json({ ok: false, error: 'duplicate_payment' }, { status: 409 });
    }

    console.error('[tlync/callback] could not mark attempt paid — MONEY MOVED', {
      customRef, message: paidError.message, code: paidError.code,
    });
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 500 });
  }

  if (!paidRows || paidRows.length === 0) {
    // Raced with another delivery of the same callback, which won. Its side
    // effects have run; ours must not run again.
    return NextResponse.json({ ok: true, status: 'already_paid' });
  }

  // ── The booking ───────────────────────────────────────────────────────────
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, booking_reference, status, paid_at, check_in, check_out, guests_count, total_amount_usd, amount_charged_try, customers(email)')
    .eq('id', attempt.booking_id)
    .maybeSingle();

  if (!booking) {
    console.error('[tlync/callback] paid attempt has no booking', { customRef });
    return NextResponse.json({ ok: false, error: 'no_booking' }, { status: 500 });
  }

  if (booking.paid_at) {
    console.error('[tlync/callback] booking already paid — MANUAL REFUND REQUIRED', {
      customRef, reference: booking.booking_reference,
    });
    await queueManualRefund(supabase, {
      bookingId: booking.id as string,
      paymentId: attempt.id as string,
      customRef,
      transactionRef: receipt.transactionRef ?? transactionRef,
      paymentMethod: receipt.paymentMethod,
      amountTry: num(attempt.amount_try),
      amountLyd: settledLyd,
      reason: 'double_payment',
    });
    return NextResponse.json({ ok: false, error: 'duplicate_payment' }, { status: 409 });
  }

  if (booking.status !== 'hold') {
    // The hold expired while the guest was on TLYNC's page. The payment is
    // recorded — never discard a real payment — but paid_at stays NULL so no
    // owner is prompted for a dead booking, mirroring complete_payment.
    console.error('[tlync/callback] paid onto a cancelled booking — MANUAL REFUND REQUIRED', {
      customRef, reference: booking.booking_reference, bookingStatus: booking.status,
    });
    await queueManualRefund(supabase, {
      bookingId: booking.id as string,
      paymentId: attempt.id as string,
      customRef,
      transactionRef: receipt.transactionRef ?? transactionRef,
      paymentMethod: receipt.paymentMethod,
      amountTry: num(attempt.amount_try),
      amountLyd: settledLyd,
      reason: 'expired',
    });
    return NextResponse.json({ ok: false, error: 'booking_canceled' }, { status: 409 });
  }

  // The paid_at NULL → NOT NULL edge fires trg_notify_booking_paid exactly
  // once, which is the existing owner prompt — identical for both gateways.
  // payment_gateway is set in the SAME statement so the trigger's NEW row
  // already knows which gateway paid.
  const { error: bookingError } = await supabase
    .from('bookings')
    .update({
      paid_at:               new Date().toISOString(),
      payment_gateway:       'tlync',
      owner_decision_due_at: new Date(Date.now() + OWNER_DECISION_HOURS * 3_600_000).toISOString(),
      hold_expires_at:       null,
    })
    .eq('id', booking.id)
    .is('paid_at', null);

  if (bookingError) {
    console.error('[tlync/callback] attempt is paid but booking did not transition', {
      customRef, reference: booking.booking_reference,
      message: bookingError.message, code: bookingError.code,
    });
    return NextResponse.json({ ok: false, error: 'booking_write_failed' }, { status: 500 });
  }

  // Guest confirmation, once, on the genuine paid edge. after() so a slow PDF
  // render never holds the response open; it swallows its own errors.
  const email = (one(booking.customers) as { email: string | null } | undefined)?.email;
  if (email) {
    after(async () => {
      await sendBookingConfirmation({
        reference:        booking.booking_reference as string,
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
    console.error('[tlync/callback] paid but no email to confirm to', {
      customRef, reference: booking.booking_reference,
    });
  }

  console.log('[tlync/callback] paid', {
    customRef,
    reference: booking.booking_reference,
    method: receipt.paymentMethod,
  });

  return NextResponse.json({ ok: true, status: 'paid' });
}

/**
 * Opens a manual refund and pings staff.
 *
 * NOT the refund machinery — that is the DB's (refund_on_owner_reject) and
 * staff's. This covers the two cases the DB trigger cannot see, because both
 * happen at payment time and neither involves an owner decision: money landing
 * on a booking that was already paid, and money landing on a hold that had
 * already expired. Without this, a real payment in a currency with no refund
 * API would sit unrecorded and unrefunded.
 *
 * The partial unique index keeps one open refund per booking; a conflict here
 * means one is already queued, which is the desired end state either way.
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
): Promise<void> {
  const { data: reference } = await supabase
    .from('bookings')
    .select('booking_reference')
    .eq('id', input.bookingId)
    .maybeSingle();

  const { data: rows, error } = await supabase
    .from('manual_refunds')
    .insert({
      booking_id:            input.bookingId,
      booking_reference:     reference?.booking_reference ?? null,
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
      console.warn('[tlync/callback] manual refund already open for booking', {
        bookingId: input.bookingId,
      });
      return;
    }
    console.error('[tlync/callback] COULD NOT QUEUE MANUAL REFUND — chase by hand', {
      bookingId: input.bookingId, customRef: input.customRef,
      message: error.message, code: error.code,
    });
    return;
  }

  const refundId = rows?.[0]?.id;
  if (!refundId) return;

  const { error: notifyError } = await supabase.rpc('notify_manual_refund', {
    p_refund_id: refundId,
  });

  if (notifyError) {
    // The row exists and is visible to staff; only the ping failed.
    console.error('[tlync/callback] manual refund queued but staff not notified', {
      refundId, message: notifyError.message,
    });
  }
}

/** urlencoded or JSON — TLYNC's callback encoding is not documented. */
function parseBody(raw: string, contentType: string): Record<string, unknown> {
  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      // Fall through to urlencoded — a mislabelled body is still worth reading.
    }
  }

  const params = new URLSearchParams(raw);
  const out: Record<string, unknown> = {};
  for (const [key, value] of params) out[key] = value;

  // A JSON body sent without the header parses as one nonsense key. Retry it.
  if (Object.keys(out).length <= 1 && raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      // Genuinely unparseable; the caller logs the raw body.
    }
  }

  return out;
}

function pick(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
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
