import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readBookingCookie } from '@/lib/booking/cookie';
import {
  kuveytConfig, payGateUrl, buildPayGateXml, postToBank, splitE164,
} from '@/lib/payment/kuveyt-turk';
import { callbackUrl } from '@/lib/payment/urls';

/**
 * Starts a 3D Secure payment.
 *
 * A Route Handler taking a real form POST, not a Server Action, because the
 * response IS the bank's 3DS page — it has to become the document. Iframes
 * have been banned by the bank since 31.12.2022, so this is a full top-level
 * navigation and the browser must land on the bank's HTML directly.
 *
 * The booking id comes ONLY from the signed httpOnly cookie. If it came from
 * the form body, a caller could start a payment against someone else's hold
 * and read back what that guest is being charged.
 *
 * CARD DATA IS NEVER PERSISTED. It arrives, goes into the XML, and is gone
 * when this request ends. Nothing here is logged.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const locale = str(form.get('locale')) || 'en';

  /**
   * Nothing was charged, and the booking is still held — so the guest goes
   * BACK TO THEIR BOOKING with the reason, where the payment form is still
   * there to try again. The dead end this replaces was worse in two ways: it
   * pointed at /booking/failed, a route that does not exist (the page is
   * /booking-failed), so a failed payment landed on a 404; and even with the
   * path fixed it would strand a guest on a page with no way back to a
   * booking that is still perfectly payable.
   *
   * The reference is only known once start_payment_attempt has returned, so
   * failures before that still use the standalone page.
   */
  const failTo = (reason: string, reference?: string) =>
    NextResponse.redirect(
      new URL(
        reference
          ? `/${locale}/booking/${encodeURIComponent(reference)}?error=${encodeURIComponent(reason)}`
          : `/${locale}/booking-failed?reason=${encodeURIComponent(reason)}`,
        request.url,
      ),
      { status: 303 },
    );

  const fail = (reason: string) => failTo(reason);

  const bookingId = await readBookingCookie();
  if (!bookingId) return fail('session');

  const supabase = createAdminClient();

  // ── The attempt row, written BEFORE anything reaches the bank ──────────────
  // start_payment_attempt also extends the hold, so a guest who spent 20
  // minutes on the form still gets a full window for the 3DS round trip.
  const { data: attemptRows, error: attemptError } = await supabase.rpc(
    'start_payment_attempt',
    { p_booking_id: bookingId },
  );

  if (attemptError) {
    console.error('[payment/start] start_payment_attempt failed', {
      bookingId, message: attemptError.message, code: attemptError.code,
    });
    return fail('server');
  }

  const attempt = (attemptRows ?? [])[0];
  if (!attempt) return fail('server');

  if (attempt.status !== 'started') {
    // already_paid | not_holdable | not_found | mode_not_priced — terminal,
    // none retryable, so these keep the standalone explanation page.
    return fail(String(attempt.status));
  }

  // From here the booking is known and still payable: every failure goes back
  // to it rather than to a dead end.
  const reference = String(attempt.booking_reference ?? '') || undefined;

  /**
   * An optional floor, in lira, below which we do not call the bank at all.
   *
   * ⚠️ UNSET BY DEFAULT, AND DELIBERATELY SO. Kuveyt Türk's own minimum is not
   * documented anywhere we can read, and inventing one would block real
   * payments. Set KUVEYT_MIN_TRY once the bank confirms a figure and the guest
   * is told plainly instead of being sent to a 3DS page that rejects them.
   */
  const minTry = Number(process.env.KUVEYT_MIN_TRY ?? '');
  const amountTry = Number(attempt.amount_try);
  if (Number.isFinite(minTry) && minTry > 0 && Number.isFinite(amountTry) && amountTry < minTry) {
    console.warn('[payment/start] below the configured card minimum', {
      merchantOrderId: attempt.merchant_order_id, amountTry, minTry,
    });
    await markAttemptFailed(supabase, attempt.merchant_order_id, 'below_min_try');
    return failTo('amount_too_small', reference);
  }

  // ── Guest + booking context for CardHolderData (mandatory for 3DS 2.0) ────
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, customer_id, customers(email, phone)')
    .eq('id', bookingId)
    .maybeSingle();

  const customer = one(booking?.customers) as
    | { email: string | null; phone: string | null }
    | undefined;

  if (!customer?.email || !customer.phone) return failTo('server', reference);

  const { cc, subscriber } = splitE164(customer.phone);

  // ── Card fields ───────────────────────────────────────────────────────────
  const card = {
    number:      str(form.get('cardNumber')).replace(/\s+/g, ''),
    expireYear:  str(form.get('expireYear')).slice(-2),
    expireMonth: str(form.get('expireMonth')).padStart(2, '0'),
    cvv:         str(form.get('cvv')),
    holderName:  str(form.get('holderName')).trim(),
  };

  if (
    !/^\d{13,19}$/.test(card.number) ||
    !/^\d{2}$/.test(card.expireYear) ||
    !/^(0[1-9]|1[0-2])$/.test(card.expireMonth) ||
    !/^\d{3,4}$/.test(card.cvv) ||
    card.holderName.length < 2 || card.holderName.length > 45
  ) {
    return fail('card');
  }

  const holder = {
    billAddrCity:     str(form.get('billCity')).trim()     || 'Istanbul',
    billAddrLine1:    str(form.get('billLine1')).trim()    || '-',
    billAddrPostCode: str(form.get('billPostCode')).trim() || '34000',
    billAddrState:    str(form.get('billState')).trim()    || '34',
    email:            customer.email,
    phoneCc:          cc,
    phoneSubscriber:  subscriber,
  };

  // x-forwarded-for is a chain; the client is the first entry.
  const clientIp =
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '0.0.0.0';

  // ── Bank call ─────────────────────────────────────────────────────────────
  // ONE variable feeds both the hash and the XML tags. OkUrl and FailUrl must
  // be byte-identical between them; deriving either twice is how that breaks.
  // Same URL for both — the callback reads ResponseCode to tell them apart,
  // because a query string would change the bytes.
  const url = callbackUrl();

  try {
    const cfg = kuveytConfig();

    const xml = buildPayGateXml({
      cfg,
      merchantOrderId: attempt.merchant_order_id,
      amountMinor:     String(attempt.amount_minor),
      okUrl:           url,
      failUrl:         url,
      card,
      holder,
      clientIp,
    });

    const html = await postToBank(payGateUrl(cfg), xml);

    // A 2xx from PayGate is NOT proof of a real 3DS challenge — an error
    // (HashDataError, bad credential) also comes back 200, as an HTML page.
    // The distinguishing test is the form's TARGET: a genuine response
    // auto-posts to the bank's ACS (an external acs/*3d* URL); an error page
    // does not. Detected and logged only, never blocking — 3DS is confirmed
    // working and a false positive here must not break it. The response
    // contains no card number (the PAN went to the bank, not back).
    const formAction = html.match(/<form[^>]*\baction=["']([^"']+)["']/i)?.[1] ?? null;
    const looksLikeAcsRedirect =
      /acs|3d|secure|mpi|threeds/i.test(formAction ?? '') ||
      /PaReq|creq|threeDS/i.test(html);
    console.log('[start:diag] payGate 2xx', {
      merchantOrderId: attempt.merchant_order_id,
      bytes: html.length,
      formAction,
      looksLikeAcsRedirect,
    });
    if (!looksLikeAcsRedirect) {
      console.warn('[start:diag] PayGate response does not look like an ACS redirect — possible error page', {
        merchantOrderId: attempt.merchant_order_id,
        head: html.slice(0, 1500),
      });
    }

    // The attempt has now genuinely been sent to the bank.
    await supabase
      .from('booking_payments')
      .update({ status: '3ds_pending', updated_at: new Date().toISOString() })
      .eq('merchant_order_id', attempt.merchant_order_id);

    // The bank's 3DS page becomes the document. Full top-level, no iframe.
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type':  'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[payment/start] bank call failed', {
      merchantOrderId: attempt.merchant_order_id,
      error: err instanceof Error ? err.message : String(err),
    });
    // The attempt never reached the bank, so it must not be left sitting at
    // 'initiated' — a row in that state is indistinguishable from one still
    // in flight, both to us and to anyone reading the table later.
    await markAttemptFailed(supabase, attempt.merchant_order_id, 'bank_unreachable');
    return failTo('bank', reference);
  }
}

/**
 * Close out an attempt that never reached the bank. No money moved: the row
 * is the only thing that needs correcting, and leaving it 'initiated' is what
 * made a dead payment look like a live one.
 *
 * Failure to write this is logged and swallowed — the guest is already being
 * sent somewhere useful, and an unwritten status must not become a 500.
 */
async function markAttemptFailed(
  supabase: ReturnType<typeof createAdminClient>,
  merchantOrderId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from('booking_payments')
    .update({
      status: 'failed',
      response_message: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('merchant_order_id', merchantOrderId)
    .eq('status', 'initiated');

  if (error) {
    console.error('[payment/start] could not mark the attempt failed', {
      merchantOrderId, reason, message: error.message, code: error.code,
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
