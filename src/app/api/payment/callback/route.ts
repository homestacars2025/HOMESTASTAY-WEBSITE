import { NextResponse, after, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  kuveytConfig, provisionGateUrl, buildProvisionXml, postToBank,
  parseProvisionResponse, isApproved, hasRefundReferences, toMinorUnits,
} from '@/lib/payment/kuveyt-turk';
import { sendBookingConfirmation } from '@/lib/booking/confirmation-email';

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

/**
 * request.formData() has ALREADY url-decoded these values once. Decoding again
 * corrupts anything containing a legitimate '%'.
 *
 * What it does not do for this bank's payload is turn '+' back into a space,
 * so Turkish messages arrive as "Kart+doğrulandı." instead of
 * "Kart doğrulandı.". Replace the plus and nothing else.
 */
function bankText(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.replace(/\+/g, ' ') : '';
}

function raw(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

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

  // The bank always posts application/x-www-form-urlencoded, but formData()
  // THROWS on any other content-type. A 500 back to the bank is the worst
  // response — it retries, and a retry storm against a callback that may have
  // already provisioned is exactly the mess to avoid. Fail gracefully instead.
  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    console.error('[payment/callback] unreadable callback body', {
      contentType: request.headers.get('content-type'),
      error: err instanceof Error ? err.message : String(err),
    });
    return fail('unknown');
  }

  // MD and MerchantOrderId are opaque tokens — never plus-substituted.
  const merchantOrderId = raw(form.get('MerchantOrderId'));
  const md              = raw(form.get('MD'));
  const responseCode    = raw(form.get('ResponseCode'));
  const responseMessage = bankText(form.get('ResponseMessage'));

  if (!merchantOrderId) {
    console.error('[payment/callback] no MerchantOrderId in callback');
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
