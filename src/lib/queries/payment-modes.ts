import 'server-only';
import { createPublicClient } from '@/lib/supabase/public';
import type { PaymentModeQuote } from '@/lib/booking/payment-mode';

/**
 * The payment modes on offer for a stay, priced — quote_payment_modes.
 *
 * Called before the booking exists, to put real figures on the checkout
 * cards. The lira amounts come from the same calculation lock_booking_fx
 * performs at hold time, so what the guest chooses from and what is charged
 * are the same numbers rather than an estimate that later moves.
 *
 * ⚠️ The AUTHORITATIVE amounts are the ones set_booking_payment_mode returns
 * once the hold exists. These are for the choice; those are the contract.
 *
 * Runs on the anon client: the two allow_* columns and these totals are
 * customer-facing terms. Nothing owner-private is requested or returned.
 *
 * Returns null on any failure, and the caller then renders no chooser —
 * falling back to the single default mode rather than guessing a split.
 */
export async function quotePaymentModes(
  unitId: string,
  checkIn: string,
  checkOut: string,
): Promise<PaymentModeQuote | null> {
  const supabase = createPublicClient();

  const { data, error } = await supabase.rpc('quote_payment_modes', {
    p_unit_id:   unitId,
    p_check_in:  checkIn,
    p_check_out: checkOut,
  });

  if (error) {
    console.error('[quotePaymentModes]', {
      unitId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }

  // SETOF — PostgREST hands back an array even for the single row.
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row) return null;

  return {
    allowFullPrepay: row.allow_full_prepay !== false,
    allowDeposit:    row.allow_deposit === true,
    allowPayAtArrival: row.allow_pay_at_arrival === true,
    totalTry:        num(row.total_try),
    totalUsd:        num(row.total_usd),
    depositTry:      num(row.deposit_try),
    depositUsd:      num(row.deposit_usd),
    balanceDueTry:   num(row.balance_due_try),
    balanceDueUsd:   num(row.balance_due_usd),
    fxRate:          num(row.fx_rate),
  };
}

/** PostgREST can hand `numeric` back as a string; coerce once, here. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
