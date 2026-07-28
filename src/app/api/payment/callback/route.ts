import { NextResponse, after, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  kuveytConfig, provisionGateUrl, buildProvisionXml, postToBank,
  parseProvisionResponse, isApproved, hasRefundReferences, toMinorUnits,
  parseAuthenticationResponse,
} from '@/lib/payment/kuveyt-turk';
import { sendBookingConfirmation } from '@/lib/booking/confirmation-email';
import { performRefund } from '@/lib/payment/refund-service';

/**
 * The 3D Secure callback.
 *
 * A Route Handler accepting POST — NOT a Server Action. The bank performs a
 * genuine cross-site form POST here, which no Server Action can receive.
 *
 * NO COOKIES ARRIVE ON THIS REQUEST. A cross-site POST carries neither Lax
 * nor Strict cookies, which is exactly why MerchantOrderId is unique per
 * attempt and recoverable back to the booking — it is the only identity we
 * get. (The redirect we issue at the end IS a same-site top-level GET, so the
 * booking cookie is sent on that, and the result page can authorise normally.)
 *
 * Locale is unknowable here for the same reason, so the redirect deliberately
 * omits it and lets the intl middleware resolve it from Accept-Language.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// NOTE: an earlier version manually replaced '+' with ' ' here on the belief
// that formData() left '+' untouched. That belief was wrong — urlencoded
// parsing (formData AND URLSearchParams) already turns '+' into a space and
// decodes %XX, verified. Manual +→space is therefore redundant and would
// CORRUPT any value that legitimately contains '+' after decoding, e.g. a
// base64 MD. Values now come straight from URLSearchParams, already decoded.

/** PostgREST returns an embedded to-one as either an object or a 1-element array. */
function one(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/** `numeric` can arrive as a string; coerce once. */
function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: NextRequest) {
  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(`/booking-failed?reason=${encodeURIComponent(reason)}`, request.url),
      { status: 303 },
    );

  const contentType = request.headers.get('content-type') ?? '';

  // Read the raw body ONCE, then parse it ourselves. URLSearchParams has the
  // same urlencoded semantics as formData() — %XX decoded, '+' → space,
  // verified — but reading text() first lets us LOG the exact bytes the ACS
  // sent, which is the blind spot that hid this bug. No card number is ever in
  // this body (the PAN went to the ACS, not back to us), so nothing to mask.
  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch (err) {
    console.error('[payment/callback] unreadable callback body', {
      contentType, error: err instanceof Error ? err.message : String(err),
    });
    return fail('unknown');
  }

  const params = new URLSearchParams(rawBody);
  const fieldNames = [...params.keys()];

  // ── The actual fix ─────────────────────────────────────────────────────────
  // KT's 3D Model returns MerchantOrderId / MD / ResponseCode INSIDE a single
  // urlencoded field, AuthenticationResponse, whose decoded value is XML — not
  // as top-level form fields. The old code read the top level, found nothing,
  // and a fully-authenticated payment landed on reason=unknown. Read top-level
  // first (some KT models do send them), then fall back to the XML.
  // parseAuthenticationResponse decodes the double-URL-encoded field down to
  // real XML before extracting — see its comment. Pass the raw field value.
  const authField = params.get('AuthenticationResponse');
  const auth = authField ? parseAuthenticationResponse(authField) : null;

  const merchantOrderId = params.get('MerchantOrderId') || auth?.merchantOrderId || '';
  const md              = params.get('MD')              || auth?.md              || '';
  const responseCode    = params.get('ResponseCode')    || auth?.responseCode    || '';
  const responseMessage = params.get('ResponseMessage') || auth?.responseMessage || '';
  const source = params.get('MerchantOrderId') ? 'top-level'
    : auth?.merchantOrderId ? 'AuthenticationResponse'
    : 'none';

  // ── TEMPORARY DIAGNOSTIC — remove once confirmed on production ─────────────
  console.log('[callback:diag] content-type   :', contentType);
  console.log('[callback:diag] field names     :', fieldNames.join(', '));
  console.log('[callback:diag] AuthResponse XML:', auth?.raw ?? '(absent)');
  console.log('[callback:diag] extracted       :', JSON.stringify({
    merchantOrderId, source, mdPresent: Boolean(md), responseCode, responseMessage,
  }));
  // ───────────────────────────────────────────────────────────────────────────

  if (!merchantOrderId) {
    console.error('[payment/callback] no MerchantOrderId (top-level OR AuthenticationResponse)', {
      contentType, fieldNames, hadAuthField: Boolean(authField),
    });
    return fail('unknown');
  }

  const supabase = createAdminClient();

  // 3DS itself failed (wrong code, cancelled, issuer refused). No money has
  // moved, so this is a clean failure — record it and stop.
  if (!md || (responseCode && responseCode !== '00')) {
    console.warn('[payment/callback] 3DS declined', {
      merchantOrderId, responseCode, responseMessage,
    });
    await supabase
      .from('booking_payments')
      .update({
        status:           'failed',
        response_code:    responseCode || null,
        response_message: responseMessage || null,
        updated_at:       new Date().toISOString(),
      })
      .eq('merchant_order_id', merchantOrderId);
    return fail('declined');
  }

  const { data: attempt } = await supabase
    .from('booking_payments')
    .select('id, booking_id, amount_try, status')
    .eq('merchant_order_id', merchantOrderId)
    .maybeSingle();

  if (!attempt) {
    console.error('[payment/callback] unknown MerchantOrderId', { merchantOrderId });
    return fail('unknown');
  }

  // ⚠️ LOAD-BEARING, AND IT MUST HAPPEN BEFORE THE BANK CALL.
  // 'provision_pending' means "money may have moved". It is what the
  // reconciliation sweep looks for. Setting it after the ProvisionGate call
  // would leave open the exact window it exists to close: if this function
  // dies mid-call, a successful provision would otherwise be invisible.
  await supabase
    .from('booking_payments')
    .update({ status: 'provision_pending', updated_at: new Date().toISOString() })
    .eq('merchant_order_id', merchantOrderId);

  // Amount must equal Request 1's Amount EXACTLY. amount_minor is returned by
  // start_payment_attempt but not persisted, so it has to be re-derived here —
  // and it is re-derived from the SAME amount_try, on the decimal digits,
  // never through a double. See toMinorUnits for why Math.round(x * 100) is
  // not safe for this.
  const amountMinor = toMinorUnits(attempt.amount_try as string);

  let provision;
  try {
    const cfg = kuveytConfig();
    const xml = buildProvisionXml({ cfg, merchantOrderId, amountMinor, md });
    provision = parseProvisionResponse(await postToBank(provisionGateUrl(cfg), xml));
  } catch (err) {
    // The attempt stays at 'provision_pending' on purpose — that is precisely
    // the state reconciliation must investigate. Never mark it failed here:
    // we genuinely do not know whether the money moved.
    console.error('[payment/callback] PROVISION UNKNOWN — reconcile manually', {
      merchantOrderId,
      error: err instanceof Error ? err.message : String(err),
    });
    return fail('pending');
  }

  if (!isApproved(provision)) {
    console.warn('[payment/callback] provision declined', {
      merchantOrderId,
      responseCode: provision.responseCode,
      responseMessage: provision.responseMessage,
    });
    await supabase
      .from('booking_payments')
      .update({
        status:           'failed',
        response_code:    provision.responseCode,
        // Stored raw. This came from the ProvisionGate XML body, not a form
        // post, so it needs no plus-substitution — that fix belongs only to
        // the callback's own formData fields.
        response_message: provision.responseMessage,
        updated_at:       new Date().toISOString(),
      })
      .eq('merchant_order_id', merchantOrderId);
    return fail('declined');
  }

  // Approved but missing a reference we would need to refund. Do NOT record it
  // as paid: complete_payment would reject it anyway, and a payment we cannot
  // give back must never look settled.
  if (!hasRefundReferences(provision)) {
    console.error('[payment/callback] APPROVED BUT UNREFUNDABLE — reconcile', {
      merchantOrderId,
      orderId: provision.orderId,
      provisionNumber: provision.provisionNumber,
      rrn: provision.rrn,
      stan: provision.stan,
    });
    return fail('pending');
  }

  // ── The paid transition ───────────────────────────────────────────────────
  const { data: completedRows, error: completeError } = await supabase.rpc(
    'complete_payment',
    {
      p_merchant_order_id: merchantOrderId,
      p_bank_order_id:     provision.orderId,
      p_provision_number:  provision.provisionNumber,
      p_rrn:               provision.rrn,
      p_stan:              provision.stan,
    },
  );

  if (completeError) {
    console.error('[payment/callback] complete_payment errored — MONEY MOVED', {
      merchantOrderId, message: completeError.message, code: completeError.code,
    });
    return fail('pending');
  }

  const completed = (completedRows ?? [])[0];
  const reference = completed?.booking_reference;

  switch (completed?.status) {
    case 'paid':
      // The genuine paid edge, exactly once. Send the guest their confirmation
      // with both documents attached (Madde 8). 'already_paid' deliberately
      // does NOT reach here — that is a bank callback replay and the email has
      // already gone. after() runs this once the redirect is on its way, so a
      // slow PDF render never holds up the guest; sendBookingConfirmation
      // swallows its own errors and cannot break the paid path.
      after(async () => {
        const { data: b } = await supabase
          .from('bookings')
          .select('booking_reference, check_in, check_out, guests_count, total_amount_usd, amount_charged_try, customers(email)')
          .eq('id', completed.booking_id)
          .maybeSingle();

        const cust = one(b?.customers) as { email: string | null } | undefined;
        if (!b || !cust?.email) {
          console.error('[payment/callback] paid but no email to confirm to', {
            merchantOrderId, reference,
          });
          return;
        }

        await sendBookingConfirmation({
          reference:        b.booking_reference,
          email:            cust.email,
          checkIn:          b.check_in,
          checkOut:         b.check_out,
          guests:           b.guests_count,
          totalUsd:         numOrNull(b.total_amount_usd),
          amountChargedTry: numOrNull(b.amount_charged_try),
        });
      });
      return NextResponse.redirect(
        new URL(`/booking/${encodeURIComponent(reference)}`, request.url),
        { status: 303 },
      );

    case 'already_paid':
      // Callback replay — booking already paid, confirmation already sent.
      return NextResponse.redirect(
        new URL(`/booking/${encodeURIComponent(reference)}`, request.url),
        { status: 303 },
      );

    case 'duplicate_payment':
    case 'booking_canceled':
      // Money moved and MUST be refunded. Deliberately loud: these are the two
      // cases where a guest has been charged for a stay they will not get.
      console.error(`[payment/callback] ${completed.status} — REFUND REQUIRED`, {
        merchantOrderId, reference, amountTry: completed.amount_try,
      });
      // Fire the refund in-process (idempotent, and gated by REFUND_LIVE_ENABLED
      // until boatest passes — returns 'gated' with no bank call until then).
      // after() so it never delays the guest's redirect.
      after(() => performRefund({ merchantOrderId, reason: completed.status }));
      return NextResponse.redirect(
        new URL(`/booking-failed?reason=${completed.status}`, request.url),
        { status: 303 },
      );

    case 'already_refunded':
    case 'unknown_attempt':
    case 'invalid':
    default:
      console.error('[payment/callback] unexpected complete_payment status', {
        merchantOrderId, status: completed?.status,
      });
      return fail('pending');
  }
}
