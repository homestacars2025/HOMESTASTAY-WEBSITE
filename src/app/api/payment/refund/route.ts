import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { performRefund, type RefundReason } from '@/lib/payment/refund-service';

/**
 * Refund trigger — SERVER ONLY, moves money.
 *
 * Called by Supabase (resolve_owner_reply → pg_net) when an owner rejects a
 * paid booking, and reusable in-process by the payment callback for the
 * duplicate_payment / booking_canceled anomalies.
 *
 * Protected by a shared secret because an unauthenticated caller could drain
 * every paid booking. The actual bank call is gated inside performRefund until
 * SOAPAction + proxy routing are confirmed — this route returns 503 for a
 * gated refund.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_REASONS: readonly RefundReason[] = ['rejected', 'duplicate_payment', 'booking_canceled'];

function authorised(request: NextRequest): boolean {
  const secret = process.env.REFUND_TRIGGER_SECRET;
  if (!secret) return false; // no secret configured → route is closed, never open
  const provided = request.headers.get('x-refund-secret') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { merchantOrderId?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const merchantOrderId = typeof body.merchantOrderId === 'string' ? body.merchantOrderId : '';
  const reason = body.reason as RefundReason;

  if (!merchantOrderId || !VALID_REASONS.includes(reason)) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
  }

  const outcome = await performRefund({ merchantOrderId, reason });

  // Map the state-machine outcome to an HTTP status the caller (pg_net) can act
  // on: 2xx = handled, 5xx = retry-worthy. 'pending' and 'error' are the only
  // ones a retry could help; 'gated' is a deliberate 503.
  const httpStatus =
    outcome.status === 'gated'   ? 503 :
    outcome.status === 'pending' ? 502 :
    outcome.status === 'error'   ? 500 :
    outcome.status === 'not_refundable' ? 422 :
    200; // refunded | already | declined are all terminal, handled results

  return NextResponse.json(outcome, { status: httpStatus });
}
