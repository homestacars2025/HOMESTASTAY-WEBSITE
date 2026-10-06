import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServicePricingUnit } from '@/lib/services/types';

/**
 * One extra on a booking, from the booking_services snapshot written by
 * create_booking_hold. This — not a fresh quote — is what the guest agreed to:
 * a later price or name change on the service must not rewrite a booking.
 */
export interface BookingServiceLine {
  name:         string;
  pricingUnit:  ServicePricingUnit | null;
  quantity:     number;
  unitPriceUsd: number | null;
  totalUsd:     number;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The extras on one booking, in the order they were added. Empty for every
 * booking made before extras existed, and for any booking without them.
 *
 * Never throws: a failed read is logged and returns [], so the payment page
 * and the confirmation email degrade to "no extras listed" — the totals they
 * show come from the booking row and stay correct either way.
 */
export async function loadBookingServices(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<BookingServiceLine[]> {
  const { data, error } = await supabase
    .from('booking_services')
    .select('name, pricing_unit, quantity, customer_unit_price_usd, customer_total_usd, created_at')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[booking-services] read failed', { bookingId, message: error.message, code: error.code });
    return [];
  }

  return (data ?? []).flatMap((row) => {
    const total = num(row.customer_total_usd);
    const name  = typeof row.name === 'string' ? row.name.trim() : '';
    if (total === null || !name) return [];
    return [{
      name,
      pricingUnit:  (row.pricing_unit as ServicePricingUnit | null) ?? null,
      quantity:     num(row.quantity) ?? 1,
      unitPriceUsd: num(row.customer_unit_price_usd),
      totalUsd:     total,
    }];
  });
}
