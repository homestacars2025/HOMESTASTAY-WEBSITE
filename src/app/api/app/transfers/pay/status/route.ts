import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/lib/app/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { readPaymentAttempt } from '@/lib/transfers/server';
import { AWAITING_PAYMENT, PAID_STATES, UUID_RE, isTransferOrder, parseTransfer } from '@/lib/transfers/model';

/**
 * GET /api/app/transfers/pay/status?transferId=<uuid>[&merchantOrderId=TRF…]
 * Authorization: Bearer <app access token>
 *
 * What the app asks after the browser closes (the wallet's /topup/status
 * twin). The truth is transfer_get AS THE USER — the deep link is only a
 * doorbell. With merchantOrderId (from /pay/start) the attempt's own outcome
 * is added, so a declined card reads as `failed` instead of `pending`.
 *
 *   200 {
 *     ok: true,
 *     transferId,
 *     state: 'paid' | 'pending' | 'processing' | 'failed' | 'expired' | 'canceled' | 'refund' | 'other',
 *     transferStatus,           // the raw transfer_bookings status
 *     payment: { merchantOrderId, status, responseCode, responseMessage } | null,
 *     transfer: <transfer_get's own JSON, unchanged>
 *   }
 *   401 unauthorized · 403 not_customer · 404 not_found
 *
 * Poll every ~2 s for up to ~30 s while state is 'pending' or 'processing':
 * the callback settles the transfer a moment after the browser closes.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bad = (status: number, error: string) =>
  NextResponse.json({ ok: false, error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: NextRequest) {
  const caller = await authenticate(request);
  if (!caller) return bad(401, 'unauthorized');
  if (!caller.usesGuestArea) return bad(403, 'not_customer');

  const q = request.nextUrl.searchParams;
  const transferId = (q.get('transferId') ?? '').trim();
  const orderIn = (q.get('merchantOrderId') ?? q.get('order') ?? '').trim();
  if (!UUID_RE.test(transferId)) return bad(404, 'not_found');

  // ── The truth, as the user ───────────────────────────────────────────────
  const { data, error } = await caller.supabase.rpc('transfer_get', { p_transfer_id: transferId });
  if (error) {
    if (error.code !== '42501') console.error('[app/transfers/status] transfer_get failed', { code: error.code, message: error.message });
    return bad(404, 'not_found');
  }
  const transfer = parseTransfer(data);
  if (!transfer) return bad(404, 'not_found');

  // ── The attempt (only one that belongs to this transfer) ─────────────────
  let payment: Awaited<ReturnType<typeof readPaymentAttempt>> = null;
  if (orderIn && isTransferOrder(orderIn) && /^[A-Za-z0-9_-]{4,64}$/.test(orderIn)) {
    const row = await readPaymentAttempt(createAdminClient(), orderIn);
    if (row && (row.transferId === null || row.transferId === transferId)) payment = row;
  }

  return NextResponse.json(
    {
      ok: true,
      transferId,
      state: stateOf(transfer.status, payment?.status ?? null),
      transferStatus: transfer.status,
      payment: payment && {
        merchantOrderId: payment.merchantOrderId,
        status: payment.status,
        responseCode: payment.responseCode,
        responseMessage: payment.responseMessage,
      },
      transfer: data,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

function stateOf(transferStatus: string, attemptStatus: string | null): string {
  if (PAID_STATES.has(transferStatus)) return 'paid';
  if (transferStatus === 'cancelled' || transferStatus === 'canceled') return 'canceled';
  if (transferStatus === 'refund_pending' || transferStatus === 'refunded') return 'refund';
  if (transferStatus === 'expired' || transferStatus === 'payment_expired') return 'expired';
  if (transferStatus === 'payment_failed') return 'failed';
  if (AWAITING_PAYMENT.has(transferStatus)) {
    if (attemptStatus === 'failed') return 'failed';
    // The bank approved, the transfer row has not caught up yet.
    if (attemptStatus === 'paid') return 'processing';
    return 'pending';
  }
  return 'other';
}
