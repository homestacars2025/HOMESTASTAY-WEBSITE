'use server';

import { createClient } from '@/lib/supabase/server';
import { isRealDate } from '@/lib/stays/search-params';
import type { UnitPricing } from '@/lib/types/unit';

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
