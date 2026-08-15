import type { SupabaseClient } from '@supabase/supabase-js';
import { usdRate, convertUsd, type UsdRate } from './fx';

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
 *
 * ── WHERE THE LOGIC LIVES ────────────────────────────────────────────────────
 * The reader itself moved to ./fx when wallet top-ups needed the identical
 * question asked about TRY. This module is now the LYD-shaped door onto it:
 * same behaviour, same '[lyd-fx]' log prefix, same staleness and safety-margin
 * rules — one implementation instead of two that could drift apart on the one
 * question that must never have two answers.
 */

const LOG_PREFIX = '[lyd-fx]';

export interface LydRate {
  /** LYD per 1 USD, safety margin already applied. */
  rate: number;
  source: UsdRate['source'];
}

export async function usdToLydRate(
  supabase: SupabaseClient,
): Promise<LydRate | null> {
  return usdRate(supabase, {
    code: 'LYD',
    fallbackSettingKey: 'fx_usd_lyd',
    logPrefix: LOG_PREFIX,
  });
}

/**
 * The charged figure. Rounded to 2 decimals ONCE — this number is what goes to
 * TLYNC, what the guest sees, and what is snapshotted on the attempt.
 * Deriving it twice is how a receipt check starts failing on a rounding cent.
 */
export function convertUsdToLyd(usd: number, rate: number): number {
  return convertUsd(usd, rate);
}
