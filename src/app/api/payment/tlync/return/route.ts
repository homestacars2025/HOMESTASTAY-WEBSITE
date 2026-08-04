import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { settleTlyncPayment } from '@/lib/payment/tlync-settle';
import { routing } from '@/i18n/routing';

/**
 * Where TLYNC sends the guest's browser back (frontend_url).
 *
 * ⚠️ THIS ROUTE NOW SETTLES. That is a deliberate reversal of the original
 *   rule, and the reason is in the data: TLYNC's UAT does not POST
 *   backend_url. Payments its own receipt endpoint reports as 'success' sat at
 *   3ds_pending until their holds expired and the bookings were cancelled. A
 *   design where the only path to 'paid' is a callback that never arrives is
 *   not a safe design; it is a silent one.
 *
 *   The safety property is untouched, because it never lived in "only the
 *   callback may write". It lives in settleTlyncPayment always re-confirming
 *   against receipt/transaction before believing anything. This route can ask
 *   us to look; it cannot tell us what we saw. A replayed or hand-typed return
 *   URL therefore does exactly what a replayed callback does: another receipt
 *   check, and no second write.
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

  console.log('[tlync/return] INBOUND', {
    method: request.method,
    url: request.url,
    customRef: customRef || '(none)',
    userAgent: request.headers.get('user-agent') ?? '',
  });

  const to = (path: string) =>
    NextResponse.redirect(new URL(path, request.url), { status: 303 });

  if (!customRef) return to(`/${locale}/booking-failed?reason=session`);

  const outcome = await settleTlyncPayment(createAdminClient(), {
    customRef, trigger: 'return',
  });

  console.log('[tlync/return] outcome', { customRef, ...outcome });

  const result = outcome.status === 'paid' || outcome.status === 'already_paid'
    ? outcome.reference
      ? `/${locale}/booking/${encodeURIComponent(outcome.reference)}`
      : null
    : null;

  switch (outcome.status) {
    case 'paid':
    case 'already_paid':
      // Settled. The result page shows the real paid state, not a promise.
      return to(result ?? `/${locale}/booking-failed?reason=unknown`);

    case 'not_completed':
      // The guest backed out, confirmed by receipt. Their dates may still be
      // held, so this page invites them to try again rather than mourning.
      return to(`/${locale}/booking-failed?reason=tlync_cancelled`);

    case 'refund_required':
      // Money moved and the stay cannot be given: either the booking was
      // already paid, or the hold expired AND the dates were resold in the
      // gap. A manual refund is already queued and staff notified.
      return to(`/${locale}/booking-failed?reason=tlync_refund_manual`);

    case 'receipt_unavailable':
    case 'write_failed':
    case 'amount_mismatch':
      // We genuinely do not know, or we know and could not write it. Never
      // tell the guest they failed and never tell them they succeeded — the
      // 'pending' copy says we are checking and asks them not to pay again,
      // which is exactly true. The reconcile sweep settles it.
      return to(`/${locale}/booking-failed?reason=pending`);

    case 'already_refunded':
    case 'unknown_ref':
    case 'wrong_gateway':
    default:
      return to(`/${locale}/booking-failed?reason=unknown`);
  }
}

function localeOf(value: string | null): string {
  return value && (routing.locales as readonly string[]).includes(value)
    ? value
    : routing.defaultLocale;
}
