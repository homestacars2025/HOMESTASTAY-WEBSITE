import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { tlyncConfig, fetchReceipt } from '@/lib/payment/tlync';
import { routing } from '@/i18n/routing';

/**
 * Where TLYNC sends the guest's browser back (frontend_url).
 *
 * ⚠️ THIS ROUTE WRITES NOTHING. Not a status, not a paid_at, not a failure.
 *   A browser redirect can be replayed, bookmarked, or hand-typed by anyone
 *   who saw the URL; only the server-to-server callback, backed by a receipt
 *   check, may change what a payment is. All this route decides is which page
 *   the guest lands on.
 *
 * It does READ the receipt, because the alternative is telling a guest who
 * cancelled that we are confirming their payment. Reading is free of
 * consequence; writing is not.
 *
 * TLYNC's method for this redirect is undocumented, so both verbs are handled.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const url = new URL(request.url);
  const locale = localeOf(url.searchParams.get('locale'));
  const customRef = url.searchParams.get('ref')?.trim() ?? '';

  const to = (path: string) =>
    NextResponse.redirect(new URL(path, request.url), { status: 303 });

  if (!customRef) return to(`/${locale}/booking-failed?reason=session`);

  const supabase = createAdminClient();

  const { data: attempt } = await supabase
    .from('booking_payments')
    .select('status, bookings(booking_reference)')
    .eq('merchant_order_id', customRef)
    .eq('payment_gateway', 'tlync')
    .maybeSingle();

  if (!attempt) {
    console.warn('[tlync/return] unknown ref', { customRef });
    return to(`/${locale}/booking-failed?reason=unknown`);
  }

  const reference =
    (one(attempt.bookings) as { booking_reference: string | null } | undefined)
      ?.booking_reference ?? null;

  if (!reference) return to(`/${locale}/booking-failed?reason=unknown`);

  const result = `/${locale}/booking/${encodeURIComponent(reference)}`;

  // The callback got here first — the booking page will show the paid state.
  if (attempt.status === 'paid') return to(result);

  const receipt = await fetchReceipt(tlyncConfig(), { customRef });

  switch (receipt.result) {
    case 'success':
      // Paid at TLYNC, not yet written here. The callback is the only thing
      // allowed to write it, so the guest is told we are confirming rather
      // than told they are done.
      return to(`${result}?pending=tlync`);

    case 'incomplete':
    case 'not_found':
      // The guest backed out. Their dates are still held for a few minutes,
      // so this page invites them to try again rather than mourning.
      return to(`/${locale}/booking-failed?reason=tlync_cancelled`);

    default:
      // We could not reach TLYNC. Saying "we are checking" is the only honest
      // message; the callback will settle it.
      console.error('[tlync/return] receipt unavailable', {
        customRef, status: receipt.status, message: receipt.message,
      });
      return to(`${result}?pending=tlync`);
  }
}

function localeOf(value: string | null): string {
  return value && (routing.locales as readonly string[]).includes(value)
    ? value
    : routing.defaultLocale;
}

/** PostgREST returns an embedded to-one as either an object or a 1-element array. */
function one(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}
