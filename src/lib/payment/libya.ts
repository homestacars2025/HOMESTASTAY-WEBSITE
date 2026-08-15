/**
 * Who is offered the Libyan dinar option.
 *
 * TLYNC settles through Libyan channels — Tadawul, MobiCash and the rest — and
 * those are instruments a Libyan guest holds. Showing them to everyone made the
 * payment step a quiz: two options, one of which almost nobody could complete,
 * on the screen where hesitation costs a sale. So the option is now offered to
 * the guests it is actually for.
 *
 * TWO SIGNALS, EITHER IS ENOUGH:
 *   nationality — ISO alpha-2 'LY', what CountrySelect stores on the booking.
 *   phone       — E.164 beginning +218, Libya's calling code.
 *
 * OR, not AND, deliberately. A Libyan national living abroad keeps a foreign
 * number; a resident may hold another passport and a Libyan line. Requiring
 * both would exclude real customers on either side of that.
 *
 * ⚠️ THIS IS A VISIBILITY RULE, NOT AN ENTITLEMENT CHECK. It decides what is
 * rendered. The routes that actually start a TLYNC payment re-run it
 * server-side, because a hidden option is not a closed door.
 */

/** Libya's ISO 3166-1 alpha-2 code, as stored by CountrySelect. */
const LIBYA_ISO = 'LY';

/** Libya's E.164 calling code. */
const LIBYA_DIAL = '+218';

export interface GuestOrigin {
  /** ISO alpha-2, or null where the surface has no nationality to read. */
  nationality: string | null;
  /** E.164, or null. */
  phone: string | null;
}

export function isLibyaEligible({ nationality, phone }: GuestOrigin): boolean {
  const iso = nationality?.trim().toUpperCase() ?? '';
  if (iso === LIBYA_ISO) return true;

  // Whitespace happens — numbers arrive from profiles, from customers, and
  // from a form. Strip it before comparing rather than trusting every writer.
  const e164 = phone?.replace(/[\s-]/g, '') ?? '';
  return e164.startsWith(LIBYA_DIAL);
}
