import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * USD → any supported currency, read at use time. SERVER ONLY.
 *
 * This is lyd-fx.ts's logic, lifted verbatim and given a currency parameter —
 * NOT a second implementation of it. usdToLydRate now delegates here, so the
 * staleness window, the manual-source exemption, the safety margin and the
 * fail-closed behaviour are one piece of code with one place to fix. Wallet
 * top-ups needed the same reader for TRY; copying it would have meant two
 * subtly different answers to "is this rate still good?".
 *
 * Rate convention matches currencies.rate_to_usd: units of the target currency
 * per 1 USD.
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
 * it. is_active remains the switch for taking a currency off sale.
 */
const MAX_RATE_AGE_HOURS = 48;

/** Rates a human maintains. Exempt from the staleness window, by design. */
const MANUAL_SOURCE = 'manual';

export interface UsdRate {
  /** Target-currency units per 1 USD, safety margin already applied. */
  rate: number;
  source: 'currencies' | 'app_settings';
}

interface UsdRateOptions {
  /** ISO code as stored in public.currencies, e.g. 'TRY' | 'LYD'. */
  code: string;
  /**
   * app_settings key holding a hand-set rate, used only when the currencies
   * row is absent, inactive or unusable. Omit for currencies that must come
   * from the feed — TRY has no manual fallback, and inventing one would hide
   * a dead TCMB job behind a number nobody is maintaining.
   */
  fallbackSettingKey?: string;
  /** Log prefix, so existing greps for '[lyd-fx]' keep working. */
  logPrefix: string;
}

export async function usdRate(
  supabase: SupabaseClient,
  { code, fallbackSettingKey, logPrefix }: UsdRateOptions,
): Promise<UsdRate | null> {
  const { data: currency } = await supabase
    .from('currencies')
    .select('rate_to_usd, fx_safety_margin_pct, updated_at, is_active, source')
    .eq('code', code)
    .maybeSingle();

  if (currency?.is_active) {
    const raw = num(currency.rate_to_usd);

    const isManual =
      String(currency.source ?? '').trim().toLowerCase() === MANUAL_SOURCE;

    const ageMs = currency.updated_at
      ? Date.now() - new Date(currency.updated_at as string).getTime()
      : Number.POSITIVE_INFINITY;

    const stale = !isManual && ageMs > MAX_RATE_AGE_HOURS * 3_600_000;

    if (raw !== null && raw > 0) {
      if (stale) {
        // Loud, and it fails closed. A stale rate under- or over-charges every
        // guest paying in this currency until someone notices.
        console.error(`${logPrefix} currencies.${code} is stale — refusing to quote ${code}`, {
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

  if (fallbackSettingKey) {
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', fallbackSettingKey)
      .maybeSingle();

    const fallback = num(setting?.value);
    if (fallback !== null && fallback > 0) {
      return { rate: round6(fallback), source: 'app_settings' };
    }
  }

  console.error(
    `${logPrefix} no USD→${code} rate available. Add an active ${code} row to ` +
      `public.currencies${fallbackSettingKey ? `, or set app_settings.${fallbackSettingKey}` : ''}. ` +
      `Payments in ${code} stay unavailable until one exists.`,
  );
  return null;
}

/**
 * The charged figure, rounded to 2 decimals ONCE.
 *
 * This number is what goes to the gateway, what the guest sees, and what is
 * snapshotted on the attempt. Deriving it twice is how a receipt check starts
 * failing on a rounding cent.
 */
export function convertUsd(usd: number, rate: number): number {
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
