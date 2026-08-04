import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readBookingCookie } from '@/lib/booking/cookie';
import {
  tlyncConfig, tlyncDiagnostics, initiatePayment, buildCustomRef, encodeAmountNote,
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

/**
 * How long the dates stay held once the guest is sent to TLYNC.
 *
 * Sized for the real journey — leave the site, open a bank or wallet app,
 * wait for an OTP, come back — not for a card 3DS round trip. The 20 minutes
 * start_payment_attempt grants was not enough and cost real payments.
 */
const TLYNC_HOLD_MINUTES = 60;

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
      // ⚠️ LOAD-BEARING, AND IT MUST BE WRITTEN HERE, BEFORE TLYNC IS CALLED.
      // amount_lyd is what the manual-refund flow tells staff to give back —
      // there is no refund API, so this number IS the refund instruction. A
      // payment that completed while our write path died must still carry it,
      // which is why it goes down with the custom_ref rather than on the paid
      // edge. fx_rate_lyd sits beside it so the figure can be re-derived from
      // amount_usd and audited later.
      amount_lyd:        amountLyd,
      fx_rate_lyd:       fx.rate,
      // Human-readable duplicate of the same two numbers, for a dashboard
      // cell. NOT read by anything any more — the columns above are the
      // source of truth.
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
  let cfg;
  try {
    cfg = tlyncConfig();
  } catch (err) {
    console.error('[tlync/start] config invalid', {
      customRef, error: err instanceof Error ? err.message : String(err),
    });
    await markFailed(supabase, customRef, 'tlync_unconfigured');
    return fail('gateway');
  }

  // Logged on EVERY initiate, success or not: which host, which path, which
  // header shape. A refusal caused by the wrong base URL is indistinguishable
  // from a bad token unless this line is already in the log next to it.
  const diagnostics = tlyncDiagnostics(cfg);
  console.log('[tlync/start] target', { customRef, ...diagnostics });
  if (diagnostics.warning) {
    console.error('[tlync/start] BASE URL LOOKS WRONG', {
      customRef, warning: diagnostics.warning,
    });
  }

  // ── The hold has to outlive the payment page ──────────────────────────────
  // start_payment_attempt extends the hold to now()+20min, which was sized for
  // a 3DS round trip: one OTP, one page, back in two minutes. Paying inside
  // Libya is not that — the guest leaves for a bank app, an OTP, sometimes a
  // different device. Twenty minutes ran out mid-payment, expire_holds()
  // cancelled the booking underneath them (it runs every 5 minutes), and the
  // payment landed on a dead booking.
  //
  // Updating hold_expires_at alone does NOT re-fire bookings_set_hold_expiry —
  // that trigger is ON UPDATE OF status, hold_duration_minutes — so this
  // extension sticks. GREATEST() means it can only ever lengthen a hold.
  const holdUntil = new Date(Date.now() + TLYNC_HOLD_MINUTES * 60_000).toISOString();
  const { error: holdError } = await supabase
    .from('bookings')
    .update({ hold_expires_at: holdUntil })
    .eq('id', bookingId)
    .eq('status', 'hold')
    .lt('hold_expires_at', holdUntil);

  if (holdError) {
    // Not fatal: a short hold is a worse outcome than no payment, but the
    // settle path can now revive an expired hold, so this is recoverable.
    console.error('[tlync/start] could not extend hold for the tlync round trip', {
      customRef, message: holdError.message, code: holdError.code,
    });
  }

  const backendUrl  = tlyncBackendUrl();
  const frontendUrl = tlyncFrontendUrl(locale, customRef);

  // The exact URLs handed to TLYNC. backend_url must be a public production
  // origin — it is derived from PAYMENT_CALLBACK_ORIGIN, which is guarded
  // against the apex host and a missing scheme, but a wrong value here is
  // invisible until a payment silently never settles.
  console.log('[tlync/start] urls', {
    customRef, backendUrl, frontendUrl,
    holdExtendedTo: holdUntil,
    backendUrlIsPublic: /^https:\/\/[^/]+\.[^/]+\//.test(`${backendUrl}/`) &&
      !/localhost|127\.0\.0\.1|\.local/i.test(backendUrl),
  });

  let initiated;
  try {
    initiated = await initiatePayment(cfg, {
      amountLyd,
      phone:       customer.phone,
      email:       customer.email,
      backendUrl,
      frontendUrl,
      customRef,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[tlync/start] initiate threw', {
      customRef, endpoint: diagnostics.initiateUrl, error: detail,
    });
    await markFailed(
      supabase, customRef, 'tlync_unreachable',
      `tlync_unreachable url=${diagnostics.initiateUrl} error=${detail}`,
    );
    return fail('gateway');
  }

  if (!initiated.ok) {
    // ⚠️ TEMPORARY DEBUG CAPTURE — remove once initiate is confirmed working.
    // 'tlync_refused' alone told us nothing, so TLYNC's own words go to the
    // log AND to response_message. That column normally holds the LYD amount
    // note, which is dead weight on a failed attempt, so nothing is lost —
    // but this is a debugging affordance, not a design, and it goes when the
    // integration is green.
    console.error('[tlync/start] initiate refused — RAW TLYNC RESPONSE', {
      customRef,
      httpStatus:  initiated.status,
      endpoint:    initiated.endpoint,
      baseUrl:     diagnostics.baseUrl,
      env:         diagnostics.env,
      storeId:     diagnostics.storeId,
      tokenLength: diagnostics.tokenLength,
      tokenHasBearerPrefix: diagnostics.tokenHasBearerPrefix,
      tokenHasWhitespace:   diagnostics.tokenHasWhitespace,
      sent:        initiated.sent,
      rawBody:     initiated.raw,
    });

    await markFailed(
      supabase, customRef, 'tlync_refused',
      `tlync_refused status=${initiated.status} url=${initiated.endpoint} ` +
        `sent=${JSON.stringify(initiated.sent)} body=${initiated.raw}`,
    );
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

/**
 * Marks an attempt dead. Never touches the booking — the hold expires on its own.
 *
 * `detail` is the TEMPORARY debug capture: TLYNC's verbatim refusal, stored on
 * the dead attempt so a failure can be diagnosed from the row without needing
 * the log window it happened in. Capped at 2000 chars.
 */
async function markFailed(
  supabase: ReturnType<typeof createAdminClient>,
  merchantOrderId: string,
  code: string,
  detail?: string,
): Promise<void> {
  const { error } = await supabase
    .from('booking_payments')
    .update({
      status:        'failed',
      response_code: code,
      ...(detail ? { response_message: detail.slice(0, 2000) } : {}),
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
