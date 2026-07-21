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

  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(`/${locale}/booking/failed?reason=${reason}`, request.url),
      { status: 303 },
    );

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
    // already_paid | not_holdable | not_found — all terminal, none retryable.
    return fail(String(attempt.status));
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

  if (!customer?.email || !customer.phone) return fail('server');

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
    return fail('bank');
  }
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

/** PostgREST returns an embedded to-one as either an object or a 1-element array. */
function one(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}
