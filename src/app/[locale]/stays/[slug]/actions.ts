'use server';

import { createClient } from '@/lib/supabase/server';
import { isRealDate } from '@/lib/stays/search-params';
import type { UnitPricing } from '@/lib/types/unit';
import { quotePaymentModes } from '@/lib/queries/payment-modes';
import type { PaymentModeQuote } from '@/lib/booking/payment-mode';
import { servicesLang, type ServiceSelection, type ServicesQuote } from '@/lib/services/types';
import { validateSelections } from '@/lib/services/selection';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PostgREST can hand `numeric` back as a string; coerce once, here. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Live quote for a stay — the only way the detail page learns a total.
 *
 * The total is the resolver's SUM across the nights, so it accounts for
 * seasonal unit_daily_prices rows and length-of-stay discounts. It is never
 * a nightly rate multiplied by nights.
 *
 * All three arguments cross the server boundary from a Client Component, so
 * every one is validated here rather than trusted. Returns null on any
 * failure; the caller then keeps showing the representative nightly rate with
 * no total, which is the safe degradation — no price beats a wrong price.
 */
export async function quoteStay(
  unitId: string,
  checkIn: string,
  checkOut: string,
): Promise<UnitPricing | null> {
  if (!UUID_RE.test(unitId)) return null;
  if (!isRealDate(checkIn) || !isRealDate(checkOut)) return null;
  if (checkIn >= checkOut) return null;

  const supabase = await createClient();

  const { data, error } = await supabase.rpc('quote_units', {
    p_unit_ids:  [unitId],
    p_check_in:  checkIn,
    p_check_out: checkOut,
  });

  if (error) {
    console.error('[quoteStay]', {
      unitId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }

  const row = (data ?? [])[0];
  if (!row) return null;

  return {
    nightly_usd: num(row.nightly_usd),
    total_usd:   num(row.total_usd),
    nights:      num(row.nights),
  };
}

/**
 * The deposit figure for a set of dates, for the listing page's price box.
 *
 * Same validation as quoteStay — these three values cross the boundary from a
 * Client Component — and the same degradation: null means the card simply
 * says nothing about deposits rather than guessing a number.
 */
export async function quotePaymentModesAction(
  unitId: string,
  checkIn: string,
  checkOut: string,
): Promise<PaymentModeQuote | null> {
  if (!UUID_RE.test(unitId)) return null;
  if (!isRealDate(checkIn) || !isRealDate(checkOut)) return null;
  if (checkIn >= checkOut) return null;

  return quotePaymentModes(unitId, checkIn, checkOut);
}

/**
 * The live "Extras" figure on the unit page, from quote_unit_services().
 *
 * A quote only: the booking's extras are priced again by create_booking_hold
 * from the ids and quantities checkout passes, never from this figure.
 *
 * Every argument crosses the boundary from a Client Component, so each is
 * validated; unknown service ids are ignored by the function itself. Null on
 * any failure — the card then shows no extras figure rather than a guess.
 */
export async function quoteUnitServicesAction(
  unitId: string,
  checkIn: string,
  checkOut: string,
  guests: number,
  selections: ServiceSelection[],
  locale: string,
): Promise<ServicesQuote | null> {
  if (!UUID_RE.test(unitId)) return null;
  if (!isRealDate(checkIn) || !isRealDate(checkOut) || checkIn >= checkOut) return null;
  if (!Number.isInteger(guests) || guests < 1 || guests > 50) return null;
  const clean = validateSelections(selections);
  if (clean === null) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('quote_unit_services', {
    p_unit_id:    unitId,
    p_check_in:   checkIn,
    p_check_out:  checkOut,
    p_guests:     guests,
    p_selections: clean,
    p_lang:       servicesLang(locale),
  });

  if (error || !data || typeof data !== 'object') {
    if (error) console.error('[quoteUnitServices]', { unitId, message: error.message, code: error.code });
    return null;
  }

  const row = data as Record<string, unknown>;
  const total = num(row.total_usd);
  if (total === null) return null;

  return {
    nights:    num(row.nights) ?? 0,
    guests:    num(row.guests) ?? guests,
    total_usd: total,
    lines: (Array.isArray(row.lines) ? row.lines : []).map((l: Record<string, unknown>) => ({
      id:           String(l.id ?? ''),
      name:         String(l.name ?? ''),
      pricing_unit: l.pricing_unit as ServicesQuote['lines'][number]['pricing_unit'],
      price_usd:    num(l.price_usd) ?? 0,
      qty:          num(l.qty) ?? 0,
      total:        num(l.total) ?? 0,
    })),
  };
}
