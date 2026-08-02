import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readBookingCookie } from '@/lib/booking/cookie';
import {
  tlyncConfig, initiatePayment, buildCustomRef, encodeAmountNote,
} from '@/lib/payment/tlync';
import { usdToLydRate, convertUsdToLyd } from '@/lib/payment/lyd-fx';
import { tlyncBackendUrl, tlyncFrontendUrl } from '@/lib/payment/urls';

/**
 * Starts a TLYNC (Libya, LYD) payment.
 *
 * The Kuveyt sibling of this route posts card data to the bank and returns the
 * bank's own 3DS page as the document. TLYNC is a hosted-page aggregator, so
 * this route takes NO payment data at all: it prices the booking in LYD, asks
 * TLYNC for a payment page, and redirects the guest to it. The guest chooses
 * Tadawul / MobiCash / … there, not here.
 *
 * As with the bank, the booking id comes ONLY from the signed httpOnly cookie
 * and the amount comes ONLY from the server. Nothing in the request body can
 * influence what is charged.
 *
 * NOTHING HERE MARKS ANYTHING PAID. This route ends with the guest on TLYNC's
 * page and an attempt row waiting for the callback to verify.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const locale = str(form.get('locale')) || 'en';

  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(`/${locale}/booking-failed?reason=${reason}`, request.url),
      { status: 303 },
    );

  const bookingId = await readBookingCookie();
  if (!bookingId) return fail('session');

  const supabase = createAdminClient();

  // ── The attempt row, written BEFORE anything reaches TLYNC ────────────────
  // Shared with the Kuveyt path on purpose: it is what serialises two taps on
  // Pay, rejects an already-paid booking, and extends the hold so a guest who
  // spent 20 minutes on the form still gets a full window on TLYNC's page.
  const { data: attemptRows, error: attemptError } = await supabase.rpc(
    'start_payment_attempt',
    { p_booking_id: bookingId },
  );

  if (attemptError) {
    console.error('[tlync/start] start_payment_attempt failed', {
      bookingId, message: attemptError.message, code: attemptError.code,
    });
    return fail('server');
  }

  const attempt = (attemptRows ?? [])[0];
  if (!attempt) return fail('server');
  if (attempt.status !== 'started') return fail(String(attempt.status));

  // ── Price it in LYD ───────────────────────────────────────────────────────
  const totalUsd = num(attempt.total_usd);
  if (totalUsd === null || totalUsd <= 0) {
    console.error('[tlync/start] booking has no USD total to convert', { bookingId });
    return fail('server');
  }

  const fx = await usdToLydRate(supabase);
  if (!fx) {
    // No rate source configured. Refusing to sell beats inventing a rate —
    // the same call lock_booking_fx makes for a stale TRY rate.
    await markFailed(supabase, attempt.merchant_order_id, 'tlync_no_rate');
    return fail('lyd_unavailable');
  }

  const amountLyd = convertUsdToLyd(totalUsd, fx.rate);
  if (!(amountLyd > 0)) {
    await markFailed(supabase, attempt.merchant_order_id, 'tlync_bad_amount');
    return fail('server');
  }

  // ── Guest contact — TLYNC requires both ───────────────────────────────────
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, customers(email, phone)')
    .eq('id', bookingId)
    .maybeSingle();

  const customer = one(booking?.customers) as
    | { email: string | null; phone: string | null }
    | undefined;

  if (!customer?.email || !customer.phone) {
    await markFailed(supabase, attempt.merchant_order_id, 'tlync_no_contact');
    return fail('server');
  }

  // ── Claim the attempt for TLYNC ───────────────────────────────────────────
  // merchant_order_id BECOMES the custom_ref. That is not a stylistic choice:
  // refund_on_owner_reject reads booking_payments.merchant_order_id into
  // manual_refunds.tlync_custom_ref, which is how staff locate a payment they
  // have to return by hand. Written before the initiate call, so a payment that
  // somehow completes without us hearing back is still resolvable.
  const customRef = buildCustomRef(attempt.merchant_order_id);

  const { error: claimError } = await supabase
    .from('booking_payments')
    .update({
      merchant_order_id: customRef,
      payment_gateway:   'tlync',
      // The LYD figures have no column of their own — see encodeAmountNote.
      response_message:  encodeAmountNote({ lyd: amountLyd, rate: fx.rate }),
      updated_at:        new Date().toISOString(),
    })
    .eq('merchant_order_id', attempt.merchant_order_id);

  if (claimError) {
    console.error('[tlync/start] could not claim attempt for tlync', {
      merchantOrderId: attempt.merchant_order_id,
      message: claimError.message, code: claimError.code,
    });
    return fail('server');
  }

  // ── TLYNC ─────────────────────────────────────────────────────────────────
  let initiated;
  try {
    initiated = await initiatePayment(tlyncConfig(), {
      amountLyd,
      phone:       customer.phone,
      email:       customer.email,
      backendUrl:  tlyncBackendUrl(),
      frontendUrl: tlyncFrontendUrl(locale, customRef),
      customRef,
    });
  } catch (err) {
    console.error('[tlync/start] initiate threw', {
      customRef, error: err instanceof Error ? err.message : String(err),
    });
    await markFailed(supabase, customRef, 'tlync_unreachable');
    return fail('gateway');
  }

  if (!initiated.ok) {
    console.error('[tlync/start] initiate refused', {
      customRef, status: initiated.status, message: initiated.message,
    });
    await markFailed(supabase, customRef, 'tlync_refused');
    return fail('gateway');
  }

  // Handed off. '3ds_pending' is the shared "sent to the payment provider,
  // result unknown" state; deliberately NOT 'provision_pending', which means
  // "money may have moved" and is the bucket the Kuveyt reconciliation looks
  // at — a TLYNC attempt that is only sitting on a hosted page does not
  // belong there.
  await supabase
    .from('booking_payments')
    .update({ status: '3ds_pending', updated_at: new Date().toISOString() })
    .eq('merchant_order_id', customRef);

  console.log('[tlync/start] redirecting guest to hosted page', {
    customRef, amountLyd, rateSource: fx.source,
  });

  // 303 so the browser turns this POST into a GET on TLYNC's page.
  return NextResponse.redirect(initiated.url, { status: 303 });
}

/** Marks an attempt dead. Never touches the booking — the hold expires on its own. */
async function markFailed(
  supabase: ReturnType<typeof createAdminClient>,
  merchantOrderId: string,
  code: string,
): Promise<void> {
  const { error } = await supabase
    .from('booking_payments')
    .update({
      status:        'failed',
      response_code: code,
      updated_at:    new Date().toISOString(),
    })
    .eq('merchant_order_id', merchantOrderId)
    .neq('status', 'paid');

  if (error) {
    console.error('[tlync/start] could not mark attempt failed', {
      merchantOrderId, code, message: error.message,
    });
  }
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
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
