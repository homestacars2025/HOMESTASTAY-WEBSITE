import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { settleTlyncPayment } from '@/lib/payment/tlync-settle';
import { settleWalletTopup } from '@/lib/payment/wallet-tlync-settle';
import { isAppOrder, isWalletOrder } from '@/lib/wallet/topup';
import { appReturnUrl, parseAppReturnUrl } from '@/lib/app/deep-link';
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

  // ── A wallet top-up lands here too ────────────────────────────────────────
  // Same 'WT-' prefix, same rule as everywhere else: the return is a browser
  // navigation, not a verdict — settleWalletTopup re-confirms with TLYNC's
  // receipt endpoint before a single unit is credited. Unlike the booking
  // branch, this one has a locale (it rides in the query string we built), so
  // the guest lands on their own wallet in their own language.
  if (isWalletOrder(customRef)) {
    const walletOutcome = await settleWalletTopup(createAdminClient(), {
      customRef, trigger: 'return',
    });

    console.log('[tlync/return] wallet outcome', { customRef, ...walletOutcome });

    // ── Web or app? ────────────────────────────────────────────────────────
    // ⚠️ THE SETTLEMENT ABOVE HAS ALREADY HAPPENED, and that ordering is the
    // whole point of routing TLYNC's frontend_url through here rather than
    // straight at the deep link: a browser sent directly to homesta:// never
    // passes through this server, so nothing would settle and the app would
    // wake beside a payment we had not recorded. Only the DESTINATION differs
    // below; the money question was answered from the receipt already.
    //
    // A web order id can never reach the app branch — isAppOrder tests for
    // 'WT-A-', and buildCustomRef only appends a suffix, so the prefix still
    // leads the string. Covered by the sixth case in
    // src/lib/wallet/__tests__/order-id.test.ts.
    //
    // The returnUrl is re-validated here, not trusted from the query: between
    // /start and this request it travelled out to TLYNC and came back, and an
    // unchecked value would let anyone craft a link from our own domain to
    // theirs. parseAppReturnUrl refuses http and https outright.
    const appBase = isAppOrder(customRef)
      ? parseAppReturnUrl(url.searchParams.get('app'))
      : null;

    const finish = (webPath: string, hint: string) => {
      if (isAppOrder(customRef)) {
        const deepLink = appReturnUrl(customRef, hint, appBase);
        if (deepLink) return NextResponse.redirect(deepLink, { status: 303 });
        // No app URL configured or supplied: fall through to the web page.
        // The app still learns the outcome by polling /status — it just does
        // not get the browser closed for it.
      }
      return to(webPath);
    };

    switch (walletOutcome.status) {
      case 'paid':
      case 'already_paid':
        return finish(`/${locale}/wallet?topup=success`, 'success');

      case 'not_completed':
        // The guest backed out, confirmed by receipt. Nothing was charged.
        return finish(`/${locale}/wallet?topup=failed&reason=cancelled`, 'failed');

      case 'receipt_unavailable':
      case 'write_failed':
      case 'amount_mismatch':
        // We do not know, or we know and could not write it. Never tell the
        // guest they failed and never tell them they succeeded — 'pending'
        // says we are checking and asks them not to pay again, which is
        // exactly true. The reconcile sweep settles it.
        return finish(`/${locale}/wallet?topup=pending`, 'pending');

      case 'unknown_ref':
      default:
        return finish(`/${locale}/wallet?topup=failed&reason=unknown`, 'failed');
    }
  }

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
