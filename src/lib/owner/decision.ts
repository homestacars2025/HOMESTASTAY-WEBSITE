import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

// ─────────────────────────────────────────────────────────────────────────────
// Shared owner-decision helper.
//
// Both /onay/[token] and /ret/[token] load a booking the same way and must
// classify it identically — a state handled on one page but not the other is
// how an owner ends up staring at a blank screen. One loader, one state union,
// two pages that render it.
//
// SECURITY
//   - decision_token is the ONLY credential. Nothing is ever looked up by
//     booking id or reference, and neither appears in these URLs.
//   - The token never appears in a log line, an error object, or a thrown
//     message. Errors are logged by shape, not by value.
//   - Every failure to resolve a token collapses to the single `not_found`
//     state, so a caller cannot distinguish "no such token" from "malformed"
//     from "already used" — no existence oracle.
// ─────────────────────────────────────────────────────────────────────────────

/** decision_token is generated as 24 hex chars. Anything else cannot match. */
const TOKEN_RE = /^[0-9a-f]{24}$/i;

export type OwnerBooking = {
  bookingReference: string | null;
  unitName: string | null;
  propertyName: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestsCount: number | null;
  guestNationality: string | null;
  totalAmountUsd: number | null;
  isPaid: boolean;
  status: string;
  ownerDecision: string | null;
  ownerDecidedAt: string | null;
  ownerDecisionDueAt: string | null;
};

/**
 * Every way a decision link can resolve. The pages switch exhaustively on
 * `state`, so adding a case here forces both pages to handle it.
 */
export type DecisionContext =
  /** Infrastructure failed — misconfiguration or an unreachable database.
   *  Deliberately distinct from not_found: telling an owner their link is
   *  invalid when the server is broken sends them chasing the wrong problem. */
  | { state: 'error' }
  | { state: 'not_found' }
  | { state: 'already_decided'; booking: OwnerBooking }
  | { state: 'expired'; booking: OwnerBooking }
  | { state: 'not_hold'; booking: OwnerBooking }
  | { state: 'actionable'; booking: OwnerBooking };

/** Constant-time token comparison. Length mismatch short-circuits (lengths are
 *  not secret — the format is public). */
function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** PostgREST returns a to-one embed as an object, but as an array when it
 *  cannot prove uniqueness. Accept either. */
// reason: PostgREST embed shapes are loosely typed; a local narrowing is clearer than fighting generics.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function one<T>(embed: any): T | null {
  if (Array.isArray(embed)) return (embed[0] ?? null) as T | null;
  return (embed ?? null) as T | null;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.round(ms / 86_400_000));
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve a decision token to a booking and its decision state.
 *
 * Read-only. A GET must never mutate: WhatsApp fetches link previews, mail and
 * antivirus scanners follow URLs, and owners mis-tap. Deciding a booking is a
 * deliberate second step (see approveBooking / rejectBooking).
 */
export async function loadDecisionContext(token: string): Promise<DecisionContext> {
  // Reject malformed tokens before touching the database. Also keeps junk out
  // of the query path entirely.
  if (!TOKEN_RE.test(token)) return { state: 'not_found' };

  // createAdminClient throws when the service key is absent. Catching it here
  // is what keeps a misconfigured deploy rendering a Turkish error page instead
  // of an unstyled 500 — the spec's "never a crash, never a blank".
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    console.error('[loadDecisionContext] admin client unavailable');
    return { state: 'error' };
  }

  const { data, error } = await admin
    .from('bookings')
    .select(
      `id, booking_reference, check_in, check_out, nights, guests_count,
       total_amount_usd, status, paid_at, decision_token,
       owner_decision, owner_decided_at, owner_decision_due_at,
       customers ( nationality ),
       units ( unit_name, properties ( name ) )`,
    )
    .eq('decision_token', token)
    .maybeSingle();

  if (error) {
    // Deliberately no token, no filter values, no error.details — details can
    // echo the queried value back. Shape only.
    console.error('[loadDecisionContext] query failed', { code: error.code });
    return { state: 'error' };
  }

  // A NULL decision_token cannot be matched by .eq(), so this also covers the
  // "token is NULL" case: no row, generic not_found.
  if (!data) return { state: 'not_found' };

  const stored = data.decision_token;
  if (typeof stored !== 'string' || !tokensMatch(token, stored)) {
    return { state: 'not_found' };
  }

  const unit = one<{ unit_name: string | null; properties: unknown }>(data.units);
  const property = one<{ name: string | null }>(unit?.properties);
  const customer = one<{ nationality: string | null }>(data.customers);

  const booking: OwnerBooking = {
    bookingReference: data.booking_reference ?? null,
    unitName: unit?.unit_name ?? null,
    propertyName: property?.name ?? null,
    checkIn: data.check_in,
    checkOut: data.check_out,
    nights: num(data.nights) ?? nightsBetween(data.check_in, data.check_out),
    guestsCount: num(data.guests_count),
    guestNationality: customer?.nationality ?? null,
    totalAmountUsd: num(data.total_amount_usd),
    // Never expose the timestamp itself — the owner needs the fact, not the clock.
    isPaid: data.paid_at !== null && data.paid_at !== undefined,
    status: data.status,
    ownerDecision: data.owner_decision ?? null,
    ownerDecidedAt: data.owner_decided_at ?? null,
    ownerDecisionDueAt: data.owner_decision_due_at ?? null,
  };

  // Order matters: a decision already on record outranks an elapsed deadline,
  // because "you already approved this" is more useful than "time ran out".
  if (booking.ownerDecision !== null) {
    return { state: 'already_decided', booking };
  }

  if (
    booking.ownerDecisionDueAt !== null &&
    Date.parse(booking.ownerDecisionDueAt) <= Date.now()
  ) {
    return { state: 'expired', booking };
  }

  if (booking.status !== 'hold') {
    return { state: 'not_hold', booking };
  }

  return { state: 'actionable', booking };
}
