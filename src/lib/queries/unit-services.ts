import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import {
  PRICING_UNITS,
  servicesLang,
  type ServicePricingUnit,
  type UnitService,
} from '@/lib/services/types';

/** PostgREST can hand `numeric` back as a string; coerce once, here. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * A unit's extra services, localised and priced for guests.
 *
 * Cached exactly like the unit itself — tagged 'units', so the same
 * /api/revalidate call that refreshes a unit refreshes its services, with a
 * short window as the fallback for a missed webhook. Prices are derived inside
 * public_unit_services() at read time; this caches its answer for minutes, the
 * same trade the unit's own nightly price already makes.
 *
 * Never throws. A failure is logged and reads as "no services", which hides
 * the section — a page without extras beats a page that fails to render.
 */
export async function getUnitServices(unitId: string, locale: string): Promise<UnitService[]> {
  const lang = servicesLang(locale);
  return unstable_cache(
    () => queryUnitServices(unitId, lang),
    ['unit-services', unitId, lang],
    { tags: ['units'], revalidate: 300 },
  )();
}

async function queryUnitServices(unitId: string, lang: 'ar' | 'tr' | 'en'): Promise<UnitService[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc('public_unit_services', {
    p_unit_id: unitId,
    p_lang:    lang,
  });

  if (error) {
    console.error('[getUnitServices]', { unitId, message: error.message, code: error.code });
    return [];
  }

  const rows: unknown[] = Array.isArray(data) ? data : [];
  const services: UnitService[] = [];
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const id    = str(row.id);
    const name  = str(row.name);
    const price = num(row.price_usd);
    const unit  = row.pricing_unit as ServicePricingUnit;
    // A row the page cannot price honestly is left out rather than shown wrong.
    if (!id || !name || price === null || price < 0 || !PRICING_UNITS.includes(unit)) continue;
    const max = num(row.max_quantity);
    services.push({
      id,
      key:          str(row.key) ?? id,
      name,
      description:  str(row.description),
      icon_key:     str(row.icon_key),
      pricing_unit: unit,
      price_usd:    price,
      max_quantity: max !== null && max >= 1 ? Math.floor(max) : null,
    });
  }
  return services;
}
