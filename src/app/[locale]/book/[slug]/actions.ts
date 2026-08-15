'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBookingAccount } from '@/lib/booking/account';
import { setBookingCookie } from '@/lib/booking/cookie';
import {
  DOCUMENT_VERSION,
  LEGAL_DOCUMENT_IDS,
} from '@/lib/booking/documents';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The details-form Server Action. Wraps create_booking_hold, which is
 * service_role only and therefore unreachable from the browser — see
 * supabase/migrations/20260720_booking_flow_rpcs.sql for why that matters.
 *
 * The client sends unit, dates, guests and the lead guest's details. It sends
 * NO amount. The figure charged is derived inside the RPC by the same resolver
 * that produced the quote, so quoted and charged agree by construction rather
 * than by comparison — there is no field here a caller could tamper with to
 * change the price.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type HoldFormData = {
  unitId:      string;
  checkIn:     string;   // YYYY-MM-DD
  checkOut:    string;   // YYYY-MM-DD
  guests:      number;
  firstName:   string;
  lastName:    string;
  email:       string;
  phone:       string;   // E.164
  nationality: string;
  /** Ön Bilgilendirme Formu + Mesafeli Satış Sözleşmesi ticked. */
  documentsAccepted: boolean;
};

/** Field keys the form can highlight without a page-level error. */
export type HoldFieldError =
  | 'firstName' | 'lastName' | 'email' | 'phone' | 'guests'
  | 'dates' | 'documents';

export type HoldResult =
  /** Hold is live. The booking id is in the cookie, never in this payload. */
  | { ok: true; status: 'created' | 'resumed';
      reference: string; totalUsd: number | null;
      amountTry: number | null; fxRate: number | null;
      holdExpiresAt: string | null }
  /** This guest already holds this unit on overlapping, different dates. */
  | { ok: false; status: 'own_hold'; reference: string;
      checkIn: string | null; checkOut: string | null }
  /** Someone else holds these dates, or we lost the race. */
  | { ok: false; status: 'unavailable' }
  /** Unit is not sellable at all — not a dates problem. */
  | { ok: false; status: 'not_bookable' }
  /** Field-level problems. Never a full-page error. */
  | { ok: false; status: 'invalid'; fields: HoldFieldError[] }
  /** We refused to sell rather than mis-charge. See below. */
  | { ok: false; status: 'rate_unavailable' }
  /** profiles.phone is UNIQUE and this number is on another account. */
  | { ok: false; status: 'phone_taken' }
  | { ok: false; status: 'error' };

// ── Validation ────────────────────────────────────────────────────────────────
// Deliberately mirrors the RPC's own checks so the guest gets a field-level
// message instead of a round trip that returns a bare 'invalid'. The RPC stays
// the authority — this is a UX layer, not a security boundary.

const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE  = /^\+[1-9][0-9]{6,14}$/;
const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function createHoldAction(data: HoldFormData): Promise<HoldResult> {
  const nationality = data.nationality.trim();

  // ── Identity comes from the ACCOUNT when there is one ────────────────────
  // A signed-in guest books as themselves, full stop. The form fields are a
  // convenience for anonymous booking (which stays supported — CLAUDE.md §4);
  // they are not a way for a signed-in guest to file a booking under someone
  // else's details, deliberately or by leaving a stale value in a box.
  //
  // This is also what makes the wallet reachable: /booking/[reference] offers
  // "pay from balance" only when the session's email matches the booking
  // customer's, so details that disagree with the session make a guest's own
  // wallet invisible on their own booking.
  //
  // Read through the SAME function the checkout page prefills from, so the
  // page and this action can never disagree about who is booking.
  const account = await getBookingAccount();

  const firstName = account?.firstName ?? data.firstName.trim();
  const lastName  = account?.lastName  ?? data.lastName.trim();
  const email     = account?.email     ?? data.email.trim().toLowerCase();
  // The one field an account may legitimately be missing. When it is, the form
  // asked for it and it is saved to the profile below.
  const phone     = account?.phone     ?? data.phone.trim();

  if (account && data.email.trim().toLowerCase() !== account.email) {
    // Not an error — the box may simply have been left blank. Logged because
    // a mismatch used to be the single silent symptom of "my wallet option
    // never appears".
    console.warn('[createHold] form email ignored in favour of the session', {
      profileId: account.profileId,
    });
  }

  const fields: HoldFieldError[] = [];
  if (!firstName)              fields.push('firstName');
  if (!lastName)               fields.push('lastName');
  if (!EMAIL_RE.test(email))   fields.push('email');
  if (!E164_RE.test(phone))    fields.push('phone');
  if (!Number.isInteger(data.guests) || data.guests < 1) fields.push('guests');
  if (!isRealDate(data.checkIn) || !isRealDate(data.checkOut) ||
      data.checkIn >= data.checkOut) fields.push('dates');
  // Turkish distance-selling law: without recorded acceptance of both
  // documents there is no enforceable contract, so this is a hard gate.
  if (!data.documentsAccepted) fields.push('documents');

  if (fields.length > 0) return { ok: false, status: 'invalid', fields };
  if (!UUID_RE.test(data.unitId)) return { ok: false, status: 'not_bookable' };

  const supabase = createAdminClient();

  // ── A first phone number is saved to the account BEFORE the hold ─────────
  // Before, not after: profiles.phone is UNIQUE, and the failure mode worth
  // catching is "this number already belongs to another account". Discovering
  // that after a booking exists would leave a hold attached to a profile whose
  // number we then could not store — better to stop while nothing is held.
  if (account && account.phone === null) {
    const saved = await savePhoneToProfile(supabase, account.profileId, phone);
    if (saved === 'duplicate') return { ok: false, status: 'phone_taken' };
  }

  const { data: rows, error } = await supabase.rpc('create_booking_hold', {
    p_unit_id:     data.unitId,
    p_check_in:    data.checkIn,
    p_check_out:   data.checkOut,
    p_guests:      data.guests,
    p_first_name:  firstName,
    p_last_name:   lastName,
    p_email:       email,
    p_phone:       phone,
    p_nationality: nationality || null,
    p_source_type: 'website',
    // The last argument, and the one that ends the phone-matching problem:
    // given a profile id the RPC binds the booking to that account and uses
    // the email and phone passed here, instead of matching an existing
    // customers row by phone and keeping ITS email
    // (COALESCE(c.email, v_email) — see the migration).
    p_profile_id:  account?.profileId ?? null,
  });

  if (error) {
    // A stale FX rate raises inside lock_booking_fx, which aborts the whole
    // transaction — no booking, no customer row, no sale. That is the system
    // working: refusing to sell beats selling at a rate we cannot honour. It
    // reaches the guest as a service message, never a 500.
    const text = `${error.message} ${error.details ?? ''}`.toLowerCase();
    if (text.includes('rate') || text.includes('fx')) {
      console.error('[createHold] FX lock refused the sale:', error);
      return { ok: false, status: 'rate_unavailable' };
    }
    console.error('[createHold]', {
      unitId: data.unitId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, status: 'error' };
  }

  const row = (rows ?? [])[0];
  if (!row) return { ok: false, status: 'error' };

  switch (row.status as string) {
    case 'created':
    case 'resumed': {
      // Set server-side, here, and nowhere else. This is the only way the
      // booking id reaches the payment step.
      await setBookingCookie(row.booking_id);

      // Acceptance is recorded BEFORE payment can start. Under Turkish
      // distance-selling law an unrecorded acceptance is the same as no
      // acceptance, so this must not be deferred to the callback.
      await recordDocumentAcceptance(supabase, row.booking_id);
      return {
        ok: true,
        status: row.status,
        reference:     row.booking_reference,
        totalUsd:      num(row.total_usd),
        amountTry:     num(row.amount_try),
        fxRate:        num(row.fx_rate),
        holdExpiresAt: row.hold_expires_at ?? null,
      };
    }

    case 'own_hold': {
      // Their OWN hold is in the way. Telling this guest the unit is taken
      // when they are the one holding it is the worst available message.
      // amount_try is NULL by design on this branch — do not read it.
      const { data: existing } = await supabase
        .from('bookings')
        .select('check_in, check_out')
        .eq('id', row.booking_id)
        .maybeSingle();

      return {
        ok: false,
        status: 'own_hold',
        reference: row.booking_reference,
        checkIn:  existing?.check_in  ?? null,
        checkOut: existing?.check_out ?? null,
      };
    }

    case 'unavailable':  return { ok: false, status: 'unavailable' };
    case 'not_bookable': return { ok: false, status: 'not_bookable' };
    case 'invalid':      return { ok: false, status: 'invalid', fields: [] };
    default:             return { ok: false, status: 'error' };
  }
}

/**
 * Two rows, one per document — they are separate legal instruments and a
 * regulator asks about them separately.
 *
 * `document_version` is the load-bearing column: proving acceptance means
 * proving which TEXT was accepted, and this text is a draft awaiting the
 * lawyer's wording. Bump DOCUMENT_VERSION on the swap and old acceptances keep
 * pointing at what their guest actually saw.
 *
 * The UNIQUE (booking_id, document) constraint makes this idempotent, which
 * matters on the 'resumed' branch: a guest returning to a hold they already
 * created must not produce a second, later-timestamped acceptance.
 */
async function recordDocumentAcceptance(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<void> {
  const headerList = await headers();

  // x-forwarded-for is a comma-separated chain; the client is the first entry.
  // Vercel sets x-real-ip too, which is the more trustworthy of the two.
  const forwarded = headerList.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = headerList.get('x-real-ip')?.trim() || forwarded || null;
  const userAgent = headerList.get('user-agent');

  const rows = LEGAL_DOCUMENT_IDS.map((document) => ({
    booking_id:       bookingId,
    document,
    document_version: DOCUMENT_VERSION,
    ip,
    user_agent:       userAgent,
  }));

  const { error } = await supabase
    .from('booking_document_acceptances')
    .upsert(rows, { onConflict: 'booking_id,document', ignoreDuplicates: true });

  if (error) {
    // Deliberately non-fatal for the hold itself: the booking exists and the
    // guest has genuinely accepted. Losing the hold here would be worse than
    // a gap in the audit trail — but the gap must be loud, because payment
    // must not proceed on a booking with no recorded acceptance.
    console.error('[createHold] ACCEPTANCE NOT RECORDED', {
      bookingId,
      documentVersion: DOCUMENT_VERSION,
      message: error.message,
      code: error.code,
    });
  }
}

/** PostgREST can hand `numeric` back as a string; coerce once, here. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Store a first phone number on the guest's profile.
 *
 * profiles.phone carries a UNIQUE constraint — one number per account — so the
 * interesting outcome is 23505: the number already belongs to somebody else.
 * That is a real answer for the guest ("this number is on another account"),
 * not an internal error, so it is returned rather than logged and swallowed.
 *
 * Any OTHER failure is deliberately non-fatal. The booking itself carries the
 * number to create_booking_hold regardless; a profile that did not get updated
 * is a smaller loss than a guest who cannot book.
 */
async function savePhoneToProfile(
  supabase: SupabaseClient,
  profileId: string,
  phone: string,
): Promise<'ok' | 'duplicate' | 'failed'> {
  const { error } = await supabase
    .from('profiles')
    .update({ phone, updated_at: new Date().toISOString() })
    .eq('id', profileId);

  if (!error) return 'ok';

  if (error.code === '23505') {
    console.warn('[createHold] phone already on another profile', { profileId });
    return 'duplicate';
  }

  console.error('[createHold] could not save phone to profile', {
    profileId, message: error.message, code: error.code,
  });
  return 'failed';
}
