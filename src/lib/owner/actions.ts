'use server';

import { createAdminClient } from '@/lib/supabase/admin';

// ─────────────────────────────────────────────────────────────────────────────
// Owner decision mutations. Step 2 of the two-step flow — only ever reached by
// an explicit POST from the confirm button, never by loading a URL.
//
// ATOMICITY
//   Each decision is ONE UPDATE statement, which PostgREST executes in a single
//   transaction. Every precondition lives in the WHERE clause rather than in a
//   read-then-write, so two concurrent taps cannot both win: the first commits,
//   the second matches zero rows and is reported as a conflict. There is no
//   window in which a booking is half-decided.
//
// NOT LOGGED
//   The token is a credential. It never appears in a log line, an analytics
//   event, or a returned error. Post-success we log the booking_reference,
//   which is not secret and is what support will search on.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_RE = /^[0-9a-f]{24}$/i;

export type DecisionResult =
  | { ok: true; kind: 'approved'; reference: string | null }
  | { ok: true; kind: 'rejected'; reference: string | null }
  /** Rejected, money already taken: decision recorded, status left alone for
   *  the refund flow to finish. See rejectBooking. */
  | { ok: true; kind: 'rejected_refund_pending'; reference: string | null }
  | { ok: false; reason: 'invalid' | 'conflict' | 'error' };

/** Columns every decision update returns, for the result page. */
const RETURNING = 'booking_reference, paid_at, status, owner_decision';

/**
 * Approve: the booking becomes confirmed and the link is spent.
 *
 * status → 'confirmed', decision recorded, decision_token → NULL (so the
 * WhatsApp button cannot be replayed), owner_decision_due_at → NULL (so no
 * expiry job can later act on a decided booking). One statement, all or nothing.
 */
export async function approveBooking(token: string): Promise<DecisionResult> {
  if (!TOKEN_RE.test(token)) return { ok: false, reason: 'invalid' };

  const now = new Date().toISOString();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('bookings')
    .update({
      status: 'confirmed',
      owner_decision: 'approved',
      owner_decided_at: now,
      decision_token: null,
      owner_decision_due_at: null,
    })
    .eq('decision_token', token)
    // Preconditions as WHERE, not as a prior read — this is what makes
    // concurrent taps safe.
    .eq('status', 'hold')
    .is('owner_decision', null)
    .gt('owner_decision_due_at', now)
    .select(RETURNING)
    .maybeSingle();

  if (error) {
    console.error('[approveBooking] update failed', { code: error.code });
    return { ok: false, reason: 'error' };
  }

  // Zero rows: already decided, expired, or no longer on hold. The page
  // re-reads to show the owner which.
  if (!data) return { ok: false, reason: 'conflict' };

  console.info('[approveBooking] approved', { reference: data.booking_reference });
  return { ok: true, kind: 'approved', reference: data.booking_reference };
}

/**
 * Reject. Two distinct outcomes depending on whether money has moved.
 *
 *   paid_at IS NULL      → safe to cancel outright. Nothing to give back.
 *   paid_at IS NOT NULL  → record the decision ONLY. Status stays 'hold' and
 *                          the refund flow (not yet built) completes the
 *                          cancellation once the money is actually back.
 *
 * The paid branch deliberately does NOT set homesta.refund_authorized. That
 * setting is the guard_paid_booking_cancel trigger's escape hatch and it
 * belongs to the refund path alone — a page that cannot move money must not be
 * able to authorise a cancellation that implies money moved.
 *
 * Branch selection is done by two mutually exclusive guarded UPDATEs rather
 * than by reading paid_at first. A payment landing between a read and a write
 * would otherwise let the unpaid branch cancel a booking that had just been
 * paid for. Only one of the two can match.
 */
export async function rejectBooking(token: string): Promise<DecisionResult> {
  if (!TOKEN_RE.test(token)) return { ok: false, reason: 'invalid' };

  const now = new Date().toISOString();
  const admin = createAdminClient();

  const base = {
    owner_decision: 'rejected',
    owner_decided_at: now,
    decision_token: null,
    owner_decision_due_at: null,
  };

  // ── Branch 1: unpaid → cancel outright ──────────────────────────────────
  // `canceled`, one 'l' — matches bookings_status_check. guard_paid_booking_cancel
  // does not fire here precisely because paid_at IS NULL.
  const unpaid = await admin
    .from('bookings')
    .update({
      ...base,
      status: 'canceled',
      cancelled_reason: 'Owner rejected the booking',
    })
    .eq('decision_token', token)
    .eq('status', 'hold')
    .is('owner_decision', null)
    .gt('owner_decision_due_at', now)
    .is('paid_at', null)
    .select(RETURNING)
    .maybeSingle();

  if (unpaid.error) {
    console.error('[rejectBooking] unpaid branch failed', { code: unpaid.error.code });
    return { ok: false, reason: 'error' };
  }

  if (unpaid.data) {
    console.info('[rejectBooking] rejected (unpaid, canceled)', {
      reference: unpaid.data.booking_reference,
    });
    return { ok: true, kind: 'rejected', reference: unpaid.data.booking_reference };
  }

  // ── Branch 2: paid → record the decision, leave status alone ────────────
  // status is untouched, so the booking stays 'hold' and keeps holding the unit
  // via bookings_no_overlap until the refund completes. That is intentional:
  // releasing the dates before the guest has their money back would let the
  // unit resell while a refund is still outstanding.
  const paid = await admin
    .from('bookings')
    .update(base)
    .eq('decision_token', token)
    .eq('status', 'hold')
    .is('owner_decision', null)
    .gt('owner_decision_due_at', now)
    .not('paid_at', 'is', null)
    .select(RETURNING)
    .maybeSingle();

  if (paid.error) {
    console.error('[rejectBooking] paid branch failed', { code: paid.error.code });
    return { ok: false, reason: 'error' };
  }

  if (!paid.data) return { ok: false, reason: 'conflict' };

  // ── REFUND HOOK ─────────────────────────────────────────────────────────
  // This is where the refund is initiated, once that flow exists. At this
  // point the decision is durably recorded and the link is spent, so the
  // refund can be retried safely without re-deciding anything.
  //
  // The refund path — NOT this action — must then, in its own transaction:
  //     SET LOCAL homesta.refund_authorized = 'on';
  //     UPDATE bookings SET status = 'canceled', cancelled_reason = '...'
  //      WHERE id = $1;
  // and only after the bank confirms the reversal (SaleReversal same-day, or
  // DrawBack after day-close).
  console.info('[rejectBooking] rejected (paid, awaiting refund)', {
    reference: paid.data.booking_reference,
  });

  return {
    ok: true,
    kind: 'rejected_refund_pending',
    reference: paid.data.booking_reference,
  };
}
