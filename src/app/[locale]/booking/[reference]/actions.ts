'use server';

import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readBookingCookie } from '@/lib/booking/cookie';
import { sendBookingConfirmation } from '@/lib/booking/confirmation-email';

/**
 * Pays a held booking from the guest's wallet balance.
 *
 * ⚠️ THIS IS THE ONLY PAYMENT PATH WITH NO GATEWAY, NO 3DS AND NO CALLBACK.
 *   Everywhere else the money moves at a bank and we find out afterwards, which
 *   is why those paths are full of "we do not know yet" states. Here the debit,
 *   the payment row and the booking's paid transition all happen inside ONE
 *   database transaction — pay_booking_from_wallet — so there is no window in
 *   which the balance has been taken and the booking has not been paid.
 *
 * ⚠️ AND IT IS THE ONLY ONE THAT IS INSTANT AND FINAL.
 *   A card payment can be reversed at the bank; this cannot be un-clicked. The
 *   form therefore makes the guest confirm a second time before this runs.
 *
 * NO AMOUNT, NO DEDUCTION LOGIC HERE. The function reads the booking's own
 * total and does the arithmetic itself. Anything this file computed would be a
 * second opinion about what a guest owes, and the wrong one to trust.
 *
 * TWO CREDENTIALS, BOTH REQUIRED
 *   1. The signed booking cookie — the same capability the card and TLYNC
 *      routes use, and the only place the booking id may come from. A booking
 *      id in a form body would let a caller pay someone else's booking out of
 *      their own wallet, or probe which references exist.
 *   2. A real session — pay_booking_from_wallet matches the account's email
 *      against the booking's customer and raises insufficient_privilege
 *      otherwise. Which is why it runs on the SESSION client: handed a
 *      service-role connection there is no auth.uid() to check, and the one
 *      guarantee that ties a wallet to its owner would be gone.
 */

export type WalletPayResult =
  | {
      ok: true;
      status: 'paid' | 'already_paid';
      newBalanceUsd: number | null;
      entryNumber: string | null;
    }
  | {
      ok: false;
      status: 'insufficient_balance';
      balanceUsd: number | null;
      requiredUsd: number | null;
    }
  /** The hold expired, or the booking is not in a payable state. */
  | { ok: false; status: 'booking_not_holdable' }
  /** No cookie, no session, or the session does not own this booking. */
  | { ok: false; status: 'unauthorized' }
  | { ok: false; status: 'unknown_booking' }
  | { ok: false; status: 'error' };

export async function payBookingFromWalletAction(): Promise<WalletPayResult> {
  const bookingId = await readBookingCookie();
  if (!bookingId) return { ok: false, status: 'unauthorized' };

  const supabase = await createClient();

  // getUser(), not getSession(): this is an authorisation decision, and only
  // getUser() revalidates the token with the auth server.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 'unauthorized' };

  const { data, error } = await supabase.rpc('pay_booking_from_wallet', {
    p_booking_id: bookingId,
  });

  if (error) {
    if (error.code === '42501') {
      // Signed in, but not as the guest this booking belongs to. Same answer
      // as signed-out on purpose — it must not be usable to learn whose
      // booking a reference is.
      console.warn('[booking/wallet-pay] insufficient_privilege', {
        bookingId, profileId: user.id,
      });
      return { ok: false, status: 'unauthorized' };
    }

    console.error('[booking/wallet-pay] pay_booking_from_wallet failed', {
      bookingId, profileId: user.id,
      message: error.message, code: error.code, details: error.details,
    });
    return { ok: false, status: 'error' };
  }

  // jsonb — one object, not a row set.
  const payload = (Array.isArray(data) ? data[0] : data) as
    | {
        status?: string;
        new_balance_usd?: unknown;
        payment_id?: string;
        entry_number?: unknown;
        balance_usd?: unknown;
        required_usd?: unknown;
      }
    | null;

  switch (payload?.status) {
    case 'paid':
    case 'already_paid':
      // 'already_paid' is a double submit, not an error: the booking is paid
      // and the guest should land on the same page as the guest who paid once.
      // The wallet was debited exactly once — the function is idempotent.
      console.log('[booking/wallet-pay] settled from wallet', {
        bookingId, status: payload.status, entryNumber: payload.entry_number,
      });
      // The card and dinar paths email from their callbacks; this path had no
      // callback and so had been sending nothing at all — a guest who paid
      // from their balance got no confirmation and no contract documents,
      // which Madde 8 requires be delivered after payment. 'already_paid' is a
      // double submit and deliberately does not re-send.
      if (payload.status === 'paid') {
        after(() => sendWalletConfirmation(bookingId));
      }
      return {
        ok: true,
        status: payload.status,
        newBalanceUsd: num(payload.new_balance_usd),
        entryNumber:
          payload.entry_number === null || payload.entry_number === undefined
            ? null
            : String(payload.entry_number),
      };

    case 'insufficient_balance':
      // Not a failure to apologise for — the guest simply needs to top up, and
      // the form turns these two figures into exactly that instruction.
      return {
        ok: false,
        status: 'insufficient_balance',
        balanceUsd: num(payload.balance_usd),
        requiredUsd: num(payload.required_usd),
      };

    case 'booking_not_holdable':
      return { ok: false, status: 'booking_not_holdable' };

    case 'unknown_booking':
      return { ok: false, status: 'unknown_booking' };

    default:
      console.error('[booking/wallet-pay] unexpected status', {
        bookingId, status: payload?.status,
      });
      return { ok: false, status: 'error' };
  }
}

/**
 * The confirmation email for a wallet payment.
 *
 * Reads with the ADMIN client: this runs after the response in after(), where
 * the request's session client is no longer the right tool, and the row it
 * needs (figures + the guest's email) is not one the session may read in full.
 * sendBookingConfirmation swallows its own errors — a missing email must never
 * look like a failed payment, because the money has already moved.
 */
async function sendWalletConfirmation(bookingId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: b, error } = await admin
    .from('bookings')
    .select('booking_reference, check_in, check_out, guests_count, total_amount_usd, amount_charged_try, payment_mode, prepay_amount_try, prepay_amount_usd, balance_due_try, balance_due_usd, customers(email)')
    .eq('id', bookingId)
    .maybeSingle();

  const email = (one(b?.customers) as { email?: string | null } | undefined)?.email;
  if (error || !b || !email) {
    console.error('[booking/wallet-pay] paid but no email to confirm to', {
      bookingId, message: error?.message,
    });
    return;
  }

  await sendBookingConfirmation({
    bookingId,
    reference: b.booking_reference as string,
    email,
    checkIn:  b.check_in as string,
    checkOut: b.check_out as string,
    guests:   b.guests_count as number,
    totalUsd: num(b.total_amount_usd),
    // A wallet payment is in USD. amount_charged_try on this path is the
    // placeholder the function writes (amount_try = amount_usd), so no lira
    // figure is passed and the email shows the dollar total — the only
    // currency this guest ever saw.
    amountChargedTry: null,
    // The deposit when that is what was debited, the stay's total otherwise.
    amountChargedUsd: b.payment_mode === 'deposit'
      ? num(b.prepay_amount_usd) ?? num(b.total_amount_usd)
      : num(b.total_amount_usd),
    gateway: 'wallet',
    paymentMode: b.payment_mode === 'deposit' ? 'deposit' : 'full_prepay',
    balanceDueTry: num(b.balance_due_try),
    balanceDueUsd: num(b.balance_due_usd),
  });
}

/** PostgREST returns an embedded to-one as either an object or a 1-element array. */
function one(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/** PostgREST hands `numeric` back as a string; coerce once, here. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// ── Pay at arrival ───────────────────────────────────────────────────────────

export type CommitArrivalResult =
  | { ok: true; ownerDecisionDueAt: string | null }
  | {
      ok: false;
      status:
        | 'unauthorized'
        | 'not_found'
        | 'wrong_mode'
        | 'already_committed'
        | 'not_holdable'
        | 'error';
    };

/**
 * Send a pay-at-arrival booking to its owner — commit_pay_at_arrival.
 *
 * This is what "paying" is for this mode: no card, no gateway, no money. The
 * RPC commits the booking and sets the owner's decision deadline, which is
 * the same edge a paid booking reaches — from there the flows are identical.
 *
 * IDENTITY IS THE COOKIE, AS IT IS ON THE PAYMENT ROUTES. A pay-at-arrival
 * booking can be made anonymously, so there is no session to check; the
 * signed httpOnly cookie is what proves this visitor started this booking,
 * and nothing in the request body can name a different one.
 *
 * 'already_committed' is NOT an error for the guest: a double tap means the
 * request is with the owner, which is exactly what they asked for. It is
 * reported so the page can say so rather than pretend to send a second one.
 */
export async function commitPayAtArrivalAction(): Promise<CommitArrivalResult> {
  const bookingId = await readBookingCookie();
  if (!bookingId) return { ok: false, status: 'unauthorized' };

  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('commit_pay_at_arrival', {
    p_booking_id: bookingId,
  });

  if (error) {
    console.error('[booking/commit-arrival] rpc failed', {
      bookingId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, status: 'error' };
  }

  const payload = (Array.isArray(data) ? data[0] : data) as
    | { status?: unknown; owner_decision_due_at?: unknown }
    | null;

  const status = String(payload?.status ?? '');

  if (status === 'ok' || status === 'already_committed') {
    if (status === 'already_committed') {
      console.warn('[booking/commit-arrival] already committed', { bookingId });
    }
    return {
      ok: true,
      ownerDecisionDueAt:
        typeof payload?.owner_decision_due_at === 'string'
          ? payload.owner_decision_due_at
          : null,
    };
  }

  console.error('[booking/commit-arrival] refused', { bookingId, status });
  switch (status) {
    case 'not_found':
    case 'wrong_mode':
    case 'not_holdable':
      return { ok: false, status };
    default:
      return { ok: false, status: 'error' };
  }
}
