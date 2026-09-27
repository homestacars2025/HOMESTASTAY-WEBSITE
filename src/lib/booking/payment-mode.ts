/**
 * The two ways a booking can be paid, and the states that follow from them.
 *
 * DEFINED BY THE DATABASE, MIRRORED HERE. bookings.payment_mode,
 * booking_payment_status (a computed field) and the amounts all come from the
 * STAY database; this module only gives them names and type-safety on the way
 * in. Nothing here derives a figure — every amount a guest sees is one the
 * database returned (quote_payment_modes before the hold,
 * set_booking_payment_mode after it).
 *
 * THE SPLIT IS NOT OURS TO COMPUTE, EVER. The deposit is Homesta's share and
 * the balance is the owner's cost exactly; deriving either in the app would
 * mean knowing units.cost_price / commission_percent, which are owner-private
 * and never reach a guest surface (CLAUDE.md §8, §9).
 */

/** bookings.payment_mode */
export type PaymentMode = 'full_prepay' | 'deposit' | 'pay_at_arrival';

/**
 * The computed field booking_payment_status, and the one answer to "is this
 * booking paid?".
 *
 * ⚠️ Boolean(paid_at) IS NO LONGER THAT ANSWER. A deposit booking has paid_at
 * set and is NOT paid in full — it is 'deposit_paid', with cash still due to
 * the owner at arrival. Read this field instead, everywhere.
 */
export type BookingPaymentStatus =
  | 'unpaid'
  | 'paid_full'
  | 'deposit_paid'
  | 'deposit_forfeited'
  /** pay_at_arrival: the owner approved, the whole sum is due in cash on arrival. */
  | 'due_at_arrival'
  /** The guest never arrived. */
  | 'no_show';

/**
 * The message key naming each mode, under booking.mode.name.
 *
 * ONE NAME PER MODE, USED WHEREVER A MODE IS NAMED — the chooser, the booking
 * details, anywhere a badge appears. Spelled once so the surfaces cannot drift
 * into three different words for the same thing.
 */
export const PAYMENT_MODE_NAME_KEY: Record<PaymentMode, string> = {
  full_prepay:    'name.full_prepay',
  deposit:        'name.deposit',
  pay_at_arrival: 'name.pay_at_arrival',
};

/** What create_booking_hold produces before any mode is chosen. */
export const DEFAULT_PAYMENT_MODE: PaymentMode = 'full_prepay';

export function isPaymentMode(value: unknown): value is PaymentMode {
  return value === 'full_prepay' || value === 'deposit' || value === 'pay_at_arrival';
}

export function isBookingPaymentStatus(value: unknown): value is BookingPaymentStatus {
  return (
    value === 'unpaid' || value === 'paid_full' ||
    value === 'deposit_paid' || value === 'deposit_forfeited' ||
    value === 'due_at_arrival' || value === 'no_show'
  );
}

/**
 * True only while money is still owed ONLINE — the one condition under which a
 * payment form may be rendered. A deposit booking is past this point even
 * though cash is still due at arrival: that cash is the owner's to collect,
 * and offering a card form for it would take it twice.
 */
export function awaitsOnlinePayment(status: BookingPaymentStatus): boolean {
  return status === 'unpaid';
}

/**
 * pay_at_arrival takes NO money online, ever — the database refuses a payment
 * attempt on such a booking. So a payment form must never render for it, no
 * matter what the status says, and the 'unpaid' it starts in means "the
 * request has not been sent to the owner yet", not "waiting to be charged".
 */
export function takesOnlinePayment(mode: PaymentMode | null | undefined): boolean {
  return mode !== 'pay_at_arrival';
}

/** A booking that has been paid for in some way — deposit or in full. */
export function hasPaidOnline(status: BookingPaymentStatus): boolean {
  return status === 'paid_full' || status === 'deposit_paid';
}

/** Committed and with the owner (or past them) — not a booking to pay for now. */
export function isCommitted(status: BookingPaymentStatus): boolean {
  return hasPaidOnline(status) || status === 'due_at_arrival';
}

// ── Pre-hold pricing ─────────────────────────────────────────────────────────

/**
 * What quote_payment_modes returns: which modes this unit offers, and the
 * exact lira figures for each — computed the same way lock_booking_fx will
 * compute them moments later, so the card the guest reads and the amount the
 * bank is asked for agree.
 *
 * deposit / balance are null whenever allowDeposit is false.
 *
 * USD IS THE REFERENCE CURRENCY, LIRA IS THE CHARGE. The deposit is Homesta's
 * commission in dollars and the balance is the host's price in dollars — that
 * is what the guest owes. The lira figure is what the card is actually
 * charged today, at today's locked rate, so it is shown as an approximation
 * beside the dollar figure and is the only currency the bank page ever sees.
 */
export interface PaymentModeQuote {
  allowFullPrepay: boolean;
  allowDeposit: boolean;
  allowPayAtArrival: boolean;
  totalTry: number | null;
  totalUsd: number | null;
  depositTry: number | null;
  depositUsd: number | null;
  balanceDueTry: number | null;
  balanceDueUsd: number | null;
  fxRate: number | null;
}

/**
 * The modes actually offerable for this quote: allowed by the owner AND
 * priced. A mode with no figure cannot be put on a card, and offering a
 * deposit we cannot price is worse than offering one fewer choice.
 */
export function offerableModes(quote: PaymentModeQuote | null): PaymentMode[] {
  if (!quote) return [];
  const modes: PaymentMode[] = [];
  // Both currencies are required: the dollar figure is what the card states,
  // the lira figure is what gets charged. A mode missing either cannot be
  // described honestly, so it is not offered.
  if (quote.allowFullPrepay && quote.totalTry !== null && quote.totalUsd !== null) {
    modes.push('full_prepay');
  }
  if (
    quote.allowDeposit &&
    quote.depositTry !== null && quote.depositUsd !== null &&
    quote.balanceDueTry !== null && quote.balanceDueUsd !== null
  ) {
    modes.push('deposit');
  }
  // Nothing is charged online, so only the stay's own total has to be priced.
  if (quote.allowPayAtArrival && quote.totalUsd !== null) {
    modes.push('pay_at_arrival');
  }
  return modes;
}
