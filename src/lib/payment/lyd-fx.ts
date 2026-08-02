import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * USD → LYD, for the TLYNC path. SERVER ONLY.
 *
 * Prices are stored in USD (CLAUDE.md §9) and TLYNC charges in LYD, so a rate
 * has to come from somewhere. It is never hardcoded and never cached in a
 * column: it is read at payment time, applied, and the resulting figure is
 * snapshotted onto the attempt row as the contractual amount.
 *
 * TWO SOURCES, IN THIS ORDER
 *   1. public.currencies, code 'LYD' — the same table current_try_rate reads,
 *      so an LYD row picks up the same staleness discipline and the same
 *      fx_safety_margin_pct the TRY row already uses. This is the destination.
 *   2. public.app_settings, key 'fx_usd_lyd' — a plain manually-set number, for
 *      before an LYD row exists. No timestamp, so no staleness check is
 *      possible; that is exactly why it is the fallback and not the primary.
 *
 * NEITHER PRESENT MEANS NO LYD PAYMENTS. The function returns null and the
 * caller must not offer or start a TLYNC payment — the same refusal
 * lock_booking_fx makes for a stale TRY rate. Quoting a guest a price we
 * invented is worse than not selling.
 *
 * Rate convention matches currencies.rate_to_usd: units of LYD per 1 USD.
 */

/**
 * Same window current_try_rate(48) applies to TRY.
 *
 * ⚠️ IT APPLIES ONLY TO AUTO-SOURCED RATES. A rate carrying source='manual'
 * is exempt and never expires from age alone.
 *
 * The staleness check exists to catch a FEED THAT DIED: TCMB refreshes TRY and
 * EUR on a schedule, so a TRY rate two days old means the job stopped and the
 * number drifted without anyone deciding it should. Age is a proxy for
 * "nobody is looking after this".
 *
 * That proxy is simply wrong for a manual rate. Nothing refreshes LYD — a
 * person typed it, on purpose, and it stays correct until that person changes
 * it. Expiring it would mean the LYD option silently vanishing 48 hours after
 * someone set it up correctly, with every payment failing as
 * 'lyd_unavailable' and nothing in the DB looking broken. is_active remains
 * the switch: to stop selling in dinar, deactivate the row.
 */
const MAX_RATE_AGE_HOURS = 48;

/** Rates a human maintains. Exempt from the staleness window, by design. */
const MANUAL_SOURCE = 'manual';

export interface LydRate {
  /** LYD per 1 USD, safety margin already applied. */
  rate: number;
  source: 'currencies' | 'app_settings';
}

export async function usdToLydRate(
  supabase: SupabaseClient,
): Promise<LydRate | null> {
  const { data: currency } = await supabase
    .from('currencies')
    .select('rate_to_usd, fx_safety_margin_pct, updated_at, is_active, source')
    .eq('code', 'LYD')
    .maybeSingle();

  if (currency?.is_active) {
    const raw = num(currency.rate_to_usd);

    // A manually maintained rate is a decision, not a reading, so its age says
    // nothing about whether it is still right. Only auto-sourced rates (TCMB
    // and anything else on a feed) are aged out.
    const isManual =
      String(currency.source ?? '').trim().toLowerCase() === MANUAL_SOURCE;

    const ageMs = currency.updated_at
      ? Date.now() - new Date(currency.updated_at as string).getTime()
      : Number.POSITIVE_INFINITY;

    const stale = !isManual && ageMs > MAX_RATE_AGE_HOURS * 3_600_000;

    if (raw !== null && raw > 0) {
      if (stale) {
        // Loud, and it fails closed. A stale rate under- or over-charges every
        // Libyan guest until someone notices.
        console.error('[lyd-fx] currencies.LYD is stale — refusing to quote LYD', {
          updatedAt: currency.updated_at,
          source: currency.source,
          maxAgeHours: MAX_RATE_AGE_HOURS,
        });
      } else {
        const margin = num(currency.fx_safety_margin_pct) ?? 0;
        return {
          rate: round6(raw * (1 + margin / 100)),
          source: 'currencies',
        };
      }
    }
  }

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'fx_usd_lyd')
    .maybeSingle();

  const fallback = num(setting?.value);
  if (fallback !== null && fallback > 0) {
    return { rate: round6(fallback), source: 'app_settings' };
  }

  console.error(
    '[lyd-fx] no USD→LYD rate available. Add an active LYD row to ' +
      'public.currencies, or set app_settings.fx_usd_lyd. TLYNC payments ' +
      'stay unavailable until one exists.',
  );
  return null;
}

/**
 * The charged figure. Rounded to 2 decimals ONCE, here — this number is what
 * goes to TLYNC, what the guest sees, and what is snapshotted on the attempt.
 * Deriving it twice is how a receipt check starts failing on a rounding cent.
 */
export function convertUsdToLyd(usd: number, rate: number): number {
  return Math.round(usd * rate * 100) / 100;
}

/** PostgREST hands `numeric` back as a string, and app_settings.value is text. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
