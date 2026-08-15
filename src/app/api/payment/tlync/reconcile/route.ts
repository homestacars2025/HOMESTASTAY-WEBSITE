import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { settleTlyncPayment } from '@/lib/payment/tlync-settle';
import { settleWalletTopup } from '@/lib/payment/wallet-tlync-settle';

/**
 * The TLYNC reconciliation sweep — the safety net under both other paths.
 *
 * WHY IT EXISTS
 *   TLYNC's UAT does not POST backend_url, so the guest's return from TLYNC is
 *   what settles a payment in practice. But a guest who pays and then closes
 *   the tab never comes back — and their money would sit collected at TLYNC,
 *   unrecorded here, until the hold expired and the booking was cancelled.
 *   This asks TLYNC about every unresolved attempt and settles whatever it
 *   confirms.
 *
 * WHAT IT IS SAFE TO CALL
 *   settleTlyncPayment re-confirms every payment against receipt/transaction
 *   and is idempotent, so running this twice, or ten times, changes nothing
 *   beyond the first settlement. It is rate-limit aware: TLYNC allows 30
 *   requests/minute per endpoint, and this caps its batch well under that.
 *
 * HOW TO RUN IT
 *   POST with the x-reconcile-secret header. The obvious home is a pg_cron job
 *   using pg_net, alongside the existing refund_url one — every 5 minutes,
 *   matching expire_holds. A Vercel Cron works too where the plan allows the
 *   frequency.
 *
 * Unset TLYNC_RECONCILE_SECRET closes the route completely: a sweep that
 * anyone can trigger is a way to burn a rate limit.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Comfortably under TLYNC's 30 req/min, leaving room for live traffic. */
const MAX_BATCH = 10;

/** How far back to look. Older than this is a reconciliation for a human. */
const LOOKBACK_HOURS = 48;

export async function POST(request: NextRequest) {
  const secret = process.env.TLYNC_RECONCILE_SECRET;

  if (!secret) {
    console.error('[tlync/reconcile] TLYNC_RECONCILE_SECRET not set — route closed');
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  }

  if (request.headers.get('x-reconcile-secret') !== secret) {
    console.warn('[tlync/reconcile] rejected unauthenticated sweep');
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString();

  // Attempts that were handed to TLYNC and never resolved either way.
  const { data: pending, error } = await supabase
    .from('booking_payments')
    .select('merchant_order_id, created_at')
    .eq('payment_gateway', 'tlync')
    .in('status', ['initiated', '3ds_pending'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(MAX_BATCH);

  if (error) {
    console.error('[tlync/reconcile] could not list unresolved attempts', {
      message: error.message, code: error.code,
    });
    return NextResponse.json({ ok: false, error: 'query_failed' }, { status: 500 });
  }

  const refs = (pending ?? []).map((row) => row.merchant_order_id as string);
  console.log('[tlync/reconcile] sweeping', { count: refs.length, lookbackHours: LOOKBACK_HOURS });

  const results: Record<string, number> = {};
  const settled: string[] = [];

  // Sequential, not parallel: the rate limit is per endpoint, and a sweep that
  // trips it would take the live payment path down with it.
  for (const customRef of refs) {
    const outcome = await settleTlyncPayment(supabase, { customRef, trigger: 'reconcile' });
    results[outcome.status] = (results[outcome.status] ?? 0) + 1;
    if (outcome.status === 'paid') settled.push(customRef);
  }

  if (settled.length > 0) {
    console.warn('[tlync/reconcile] settled payments the guest never came back for', {
      count: settled.length, refs: settled,
    });
  }

  // ── The same sweep, for wallet top-ups ────────────────────────────────────
  // A second query rather than a branch inside the first: top-up intents live
  // in their own table, so there is nothing to share but the loop. The guest
  // who pays for a top-up and closes the tab is the exact case this catches —
  // their money is collected at TLYNC and their wallet is empty until this
  // runs.
  const wallet = await sweepWalletTopups(supabase, since, MAX_BATCH - refs.length);

  return NextResponse.json({
    ok: true,
    swept: refs.length,
    settled: settled.length,
    outcomes: results,
    wallet,
  });
}

async function sweepWalletTopups(
  supabase: ReturnType<typeof createAdminClient>,
  since: string,
  budget: number,
): Promise<{ swept: number; settled: number; outcomes: Record<string, number> }> {
  const empty = { swept: 0, settled: 0, outcomes: {} };

  // The booking sweep has first claim on the rate-limit budget: an unsettled
  // booking loses the guest their dates, an unsettled top-up loses them
  // nothing but time. Zero left is a valid answer — the next run picks it up.
  if (budget <= 0) return empty;

  const { data, error } = await supabase
    .from('wallet_topup_intents')
    .select('merchant_order_id, created_at')
    .eq('gateway', 'tlync')
    .eq('status', 'processing')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(budget);

  if (error) {
    console.error('[tlync/reconcile] could not list unresolved top-ups', {
      message: error.message, code: error.code,
    });
    return empty;
  }

  const refs = (data ?? [])
    .map((row) => row.merchant_order_id as string | null)
    .filter((ref): ref is string => Boolean(ref));

  const outcomes: Record<string, number> = {};
  let settled = 0;

  // Sequential, for the same reason as above: the rate limit is per endpoint.
  for (const customRef of refs) {
    const outcome = await settleWalletTopup(supabase, { customRef, trigger: 'reconcile' });
    outcomes[outcome.status] = (outcomes[outcome.status] ?? 0) + 1;
    if (outcome.status === 'paid') settled += 1;
  }

  if (settled > 0) {
    console.warn('[tlync/reconcile] credited top-ups the guest never came back for', {
      count: settled,
    });
  }

  return { swept: refs.length, settled, outcomes };
}
