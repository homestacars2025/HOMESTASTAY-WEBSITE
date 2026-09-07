import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchReceipt, tlyncConfig } from '@/lib/payment/tlync';
import { settleTlyncPayment } from '@/lib/payment/tlync-settle';
import { settleWalletTopup } from '@/lib/payment/wallet-tlync-settle';
import { isWalletOrder } from '@/lib/wallet/topup';

/**
 * One-time recovery for payments a receipt reading wrongly buried.
 *
 * THE DAMAGE THIS EXISTS TO UNDO
 *   Until the fix in tlync-settle.ts / wallet-tlync-settle.ts, a receipt of
 *   'incomplete' or 'not_found' wrote a terminal failure. TLYNC answers
 *   'incomplete' while a payment is still in flight, so any payment it went on
 *   to collect after that reading was recorded as failed and never settled.
 *   Thirty booking attempts and seven top-ups accumulated over a month.
 *
 * ⚠️ READ-ONLY BY DEFAULT, AND THAT IS THE WHOLE DESIGN.
 *   Without ?apply=1 this endpoint asks TLYNC about each reference and REPORTS.
 *   It writes nothing, settles nothing, and credits nothing. Thirty real
 *   payments deserve to be looked at before anything touches them, and a
 *   read-only pass that turns out to be wrong costs nothing at all.
 *
 * ⚠️ DELETE THIS ROUTE once the backlog is cleared. It exists to drain a
 *   specific, finite mess. The reconcile sweep is the permanent mechanism, and
 *   after the fix nothing new can land in the state this looks for.
 *
 * NOT A CRON. Run by hand, with the same secret the reconcile sweep uses.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * TLYNC allows 30 requests/minute per endpoint. Each reference costs ONE
 * receipt call in dry mode and one more if it settles, so the default keeps a
 * single run comfortably inside the budget even when applying.
 */
const DEFAULT_LIMIT = 25;

/** Spacing between receipt calls: 25 in a run at 2.5s apart is ~62s of wall time. */
const SPACING_MS = 2_500;

/** The two codes the old bug wrote. Nothing else is eligible for recovery. */
const BUGGED_BOOKING_CODES = ['tlync_incomplete', 'tlync_not_found'];
const BUGGED_WALLET_REASONS = ['tlync_incomplete', 'tlync_not_found'];

interface Row {
  ref: string;
  kind: 'booking' | 'wallet';
  /** booking_reference, or the intent id for a top-up. */
  owner: string | null;
  amountLyd: number | null;
  createdAt: string | null;
  currentStatus: string | null;
}

export async function POST(request: NextRequest) {
  const secret = process.env.TLYNC_RECONCILE_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  }
  if (request.headers.get('x-reconcile-secret') !== secret) {
    console.error('[tlync/recover] REJECTED unauthorized call');
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const apply = params.get('apply') === '1';
  const limit = clamp(Number(params.get('limit')) || DEFAULT_LIMIT, 1, 30);
  // Paging and a kind filter, because one run cannot cover the backlog inside
  // TLYNC's rate budget. Without `skip` a second run re-reads the same oldest
  // rows; without `kind` the bookings fill every slot and the wallet intents —
  // the ones that cannot self-recover — are never reached at all.
  const skip = Math.max(0, Number(params.get('skip')) || 0);
  const kindParam = params.get('kind');
  const kind: 'booking' | 'wallet' | 'both' =
    kindParam === 'booking' || kindParam === 'wallet' ? kindParam : 'both';

  const supabase = createAdminClient();
  const rows = await listBugged(supabase, limit, skip, kind);

  console.log('[tlync/recover] starting', {
    mode: apply ? 'APPLY — WILL WRITE' : 'dry — read only',
    count: rows.length,
  });

  const results: Array<Record<string, unknown>> = [];
  const summary: Record<string, number> = {};
  // Two payments confirmed for one booking is a DOUBLE CHARGE, not a windfall.
  const successByOwner = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (i > 0) await sleep(SPACING_MS);

    let receipt;
    try {
      receipt = await fetchReceipt(tlyncConfig(), { customRef: row.ref });
    } catch (err) {
      results.push({ ...row, receipt: 'threw', error: String(err) });
      summary.threw = (summary.threw ?? 0) + 1;
      continue;
    }

    summary[receipt.result] = (summary[receipt.result] ?? 0) + 1;

    const confirmed = receipt.result === 'success';
    if (confirmed && row.owner) {
      successByOwner.set(row.owner, (successByOwner.get(row.owner) ?? 0) + 1);
    }

    const entry: Record<string, unknown> = {
      ...row,
      receipt: receipt.result,
      // Narrowed on the discriminant itself — `confirmed` is a boolean and
      // TypeScript cannot carry it into the property access.
      collectedLyd: receipt.result === 'success' ? receipt.amount : null,
      paymentMethod: receipt.result === 'success' ? receipt.paymentMethod : null,
      // A wallet intent stuck at 'failed' cannot be credited even when TLYNC
      // confirms it — complete_wallet_topup refuses a terminal status. Saying
      // so per row is the difference between "we will fix it" and a promise
      // that quietly cannot be kept.
      recoverable: confirmed && !(row.kind === 'wallet' && row.currentStatus === 'failed'),
      ...(confirmed && row.kind === 'wallet' && row.currentStatus === 'failed'
        ? { blockedBy: 'wallet intent is terminal — return it to processing first' }
        : {}),
    };

    if (apply && confirmed && entry.recoverable === true) {
      const outcome = row.kind === 'wallet'
        ? await settleWalletTopup(supabase, { customRef: row.ref, trigger: 'reconcile' })
        : await settleTlyncPayment(supabase, { customRef: row.ref, trigger: 'reconcile' });
      entry.settled = outcome.status;
      console.log('[tlync/recover] settled', { ref: row.ref, outcome: outcome.status });
    }

    results.push(entry);
  }

  // Flagged after the loop, when every reference has been seen.
  for (const entry of results) {
    const owner = entry.owner as string | null;
    if (owner && (successByOwner.get(owner) ?? 0) > 1) {
      entry.doublePayment = true;
    }
  }

  const duplicates = [...successByOwner.entries()].filter(([, n]) => n > 1);
  if (duplicates.length > 0) {
    console.error('[tlync/recover] DOUBLE PAYMENTS — refund, do not credit twice', {
      owners: duplicates.map(([o, n]) => `${o}×${n}`),
    });
  }

  return NextResponse.json({
    ok: true,
    mode: apply ? 'apply' : 'dry',
    checked: results.length,
    summary,
    doublePayments: duplicates.map(([owner, count]) => ({ owner, count })),
    results,
  });
}

/**
 * Every row the old bug could have buried, oldest first.
 *
 * NO TIME WINDOW, unlike the reconcile sweep: the backlog starts in early
 * August and a 48-hour lookback cannot see it. Bounded by `limit` instead,
 * which is what keeps the run inside TLYNC's rate budget.
 */
async function listBugged(
  supabase: ReturnType<typeof createAdminClient>,
  limit: number,
  skip: number,
  kind: 'booking' | 'wallet' | 'both',
): Promise<Row[]> {
  const rows: Row[] = [];

  if (kind === 'wallet') return listWallet(supabase, limit, skip);

  const { data: bookings, error: bookingError } = await supabase
    .from('booking_payments')
    .select('merchant_order_id, amount_lyd, created_at, status, response_code, bookings(booking_reference)')
    .eq('payment_gateway', 'tlync')
    .eq('status', 'failed')
    .in('response_code', BUGGED_BOOKING_CODES)
    .order('created_at', { ascending: true })
    .range(skip, skip + limit - 1);

  if (bookingError) {
    console.error('[tlync/recover] booking listing failed', { message: bookingError.message });
  }

  for (const b of bookings ?? []) {
    const ref = b.merchant_order_id as string | null;
    if (!ref) continue;
    const booking = Array.isArray(b.bookings) ? b.bookings[0] : b.bookings;
    rows.push({
      ref,
      kind: 'booking',
      owner: (booking as { booking_reference?: string } | null)?.booking_reference ?? null,
      amountLyd: num(b.amount_lyd),
      createdAt: (b.created_at as string | null) ?? null,
      currentStatus: (b.status as string | null) ?? null,
    });
  }

  if (kind === 'booking') return rows;

  const remaining = limit - rows.length;
  if (remaining <= 0) return rows;

  rows.push(...(await listWallet(supabase, remaining, 0)));
  return rows;
}

/** The wallet half, split out so `kind=wallet` can reach it directly. */
async function listWallet(
  supabase: ReturnType<typeof createAdminClient>,
  limit: number,
  skip: number,
): Promise<Row[]> {
  const rows: Row[] = [];

  const { data: intents, error: intentError } = await supabase
    .from('wallet_topup_intents')
    .select('merchant_order_id, amount_minor, created_at, status, failure_reason, id')
    .eq('gateway', 'tlync')
    .or(
      "status.eq.processing," +
      `and(status.eq.failed,failure_reason.in.(${BUGGED_WALLET_REASONS.join(',')}))`,
    )
    .order('created_at', { ascending: true })
    .range(skip, skip + limit - 1);

  if (intentError) {
    console.error('[tlync/recover] intent listing failed', { message: intentError.message });
  }

  for (const i of intents ?? []) {
    const ref = i.merchant_order_id as string | null;
    if (!ref) continue;
    rows.push({
      ref,
      kind: isWalletOrder(ref) ? 'wallet' : 'wallet',
      owner: (i.id as string | null) ?? null,
      amountLyd: num(i.amount_minor),
      createdAt: (i.created_at as string | null) ?? null,
      currentStatus: (i.status as string | null) ?? null,
    });
  }

  return rows;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
