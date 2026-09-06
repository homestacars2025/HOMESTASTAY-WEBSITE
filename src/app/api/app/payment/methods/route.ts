import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/app/auth';
import { getAccountForUser } from '@/lib/booking/account';
import { isAccountLibyaEligible } from '@/lib/payment/libya-account';
import { isTlyncConfigured } from '@/lib/payment/tlync';
import { usdToLydRate } from '@/lib/payment/lyd-fx';

/**
 * Which payment rails this account can actually use.
 *
 * WHY THE APP NEEDS TO ASK BEFORE IT RENDERS
 *   The dinar rail is offered only to Libyan guests, and only while a usable
 *   LYD rate exists. Both facts live on the server. Without this endpoint the
 *   app would have to draw the button optimistically and discover the answer
 *   as a 400 from /start — a rejection on the screen where the guest was about
 *   to pay, which is the worst place to be surprised.
 *
 * ⚠️ THIS IS A RENDERING HINT, NOT AN ENTITLEMENT. Every start route re-runs
 * exactly these checks server-side, because a hidden button closes nothing —
 * the same rule lib/payment/libya.ts states for the website's own UI.
 *
 * Mirrors the website's condition precisely (see the booking result page:
 * `lydAvailable = lydFx !== null && libyaEligible`). If the two ever disagree,
 * a guest sees one thing on the site and another in the app for the same
 * account.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const caller = await authenticate(request);
  if (!caller) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { user, supabase: asUser } = caller;

  const account = await getAccountForUser(asUser, user);
  if (!account) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // ── Is there a rate at all ────────────────────────────────────────────────
  // Service-role for reference data only (currencies, app_settings) — not the
  // caller's rows, and no user input reaches the read. Skipped entirely when
  // TLYNC is unconfigured: there is nothing to price.
  const configured = isTlyncConfigured();
  const lydRateAvailable = configured
    ? (await usdToLydRate(createAdminClient())) !== null
    : false;

  // ── Is this guest Libyan ──────────────────────────────────────────────────
  // Nationality OR a +218 number, either alone being enough — a Libyan
  // national abroad keeps a foreign number, a resident may hold another
  // passport. Fails closed on a read error.
  const libyaEligible = configured ? await isAccountLibyaEligible(account) : false;

  // ── The phone TLYNC requires ──────────────────────────────────────────────
  // Reported separately so the app can send the guest to add a number instead
  // of hiding the option with no explanation. A Libyan guest with no phone is
  // eligible but cannot pay, and those are different problems with different
  // fixes.
  const hasPhone = account.phone !== null && account.phone.trim() !== '';

  return NextResponse.json({
    ok: true,
    // The single flag the app should gate the button on. Deliberately the AND
    // of both conditions, matching the website — never expose one without the
    // other, or the button appears during a rate outage.
    tlyncAvailable: libyaEligible && lydRateAvailable,
    // The two halves, so the app can say WHY rather than just hiding a button.
    libyaEligible,
    lydRateAvailable,
    hasPhone,
    // Card is unconditional: it needs no eligibility and no local rate.
    cardAvailable: true,
  });
}
