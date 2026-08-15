'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { usdRate, convertUsd } from '@/lib/payment/fx';
import { isTlyncConfigured } from '@/lib/payment/tlync';

/**
 * Opens a wallet top-up intent.
 *
 * ⚠️ THE AMOUNT COMES FROM THE GUEST HERE, AND THAT INVERTS THE BOOKING RULE.
 *   Everywhere else in this codebase the charged figure is derived server-side
 *   precisely so nothing the browser sends can move it (see book/[slug]/
 *   actions.ts). A top-up has no such anchor — the guest decides how much to
 *   add.
 *
 *   By the owner's decision the amount is UNBOUNDED: start_wallet_topup imposes
 *   no minimum, no maximum and no daily cap, and rejects only zero or negative.
 *   So there is no range to mirror here and none to tell the guest about. The
 *   check below is a shape check, exactly like the field checks in
 *   createHoldAction — it turns a typo into a field message instead of a round
 *   trip. It is NOT the boundary and must never be treated as one.
 *
 * WHY start_wallet_topup RUNS ON THE SESSION CLIENT, NOT admin.ts
 *   It is granted to `authenticated` and checks auth.uid() = p_profile_id
 *   itself. Handing it a service-role connection would bypass the one check
 *   that ties an intent to a person — the caller would be asserting the
 *   profile id rather than proving it.
 */

export type TopupGateway = 'kuveyt' | 'tlync';

export type TopupFieldError = 'amount' | 'gateway';

export type TopupResult =
  | {
      ok: true;
      intentId: string;
      amountUsd: number;
      gateway: TopupGateway;
      /** Local currency figure the guest will actually be charged. */
      amountLocal: number;
      currencyCode: 'TRY' | 'LYD';
      fxRate: number;
    }
  /** Field-level problem. Never a full-page error. */
  | { ok: false; status: 'invalid'; fields: TopupFieldError[] }
  /** No usable FX rate — we will not invent one. */
  | { ok: false; status: 'rate_unavailable' }
  /** Signed out, or the session does not match the profile. */
  | { ok: false; status: 'unauthorized' }
  | { ok: false; status: 'error' };

/** Matches the currency each gateway actually settles in. */
const GATEWAY_CURRENCY: Record<TopupGateway, 'TRY' | 'LYD'> = {
  kuveyt: 'TRY',
  tlync: 'LYD',
};

/**
 * TRY has no app_settings fallback on purpose: it is fed by TCMB, so a missing
 * or stale row means the feed died, and a hand-set number would hide that.
 * LYD does, because nothing feeds it — see lib/payment/lyd-fx.ts.
 */
const GATEWAY_FX: Record<TopupGateway, { code: 'TRY' | 'LYD'; fallbackSettingKey?: string }> = {
  kuveyt: { code: 'TRY' },
  tlync: { code: 'LYD', fallbackSettingKey: 'fx_usd_lyd' },
};

export async function createTopupIntentAction(
  amountUsdRaw: number,
  gateway: TopupGateway,
): Promise<TopupResult> {
  // ── Shape checks (UX layer — the RPC remains the authority) ──────────────
  const fields: TopupFieldError[] = [];

  const amountUsd = Math.round(Number(amountUsdRaw) * 100) / 100;
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) fields.push('amount');
  if (gateway !== 'kuveyt' && gateway !== 'tlync') fields.push('gateway');
  if (gateway === 'tlync' && !isTlyncConfigured()) fields.push('gateway');

  if (fields.length > 0) return { ok: false, status: 'invalid', fields };

  // ── Identity ────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // getUser(), not getSession(): this is an authorisation decision, and only
  // getUser() revalidates the token with the auth server rather than trusting
  // whatever the cookie claims.
  if (!user) return { ok: false, status: 'unauthorized' };

  // ── The rate, locked now and handed to the RPC ──────────────────────────
  // Read with the SERVICE-ROLE client: currencies and app_settings are
  // reference data behind RLS, not the caller's own rows, and the session
  // client sees nothing there. No user input reaches this read.
  const fx = await usdRate(createAdminClient(), {
    ...GATEWAY_FX[gateway],
    logPrefix: '[wallet/topup]',
  });

  if (!fx) {
    // The same refusal lock_booking_fx makes for a stale TRY rate: not selling
    // beats charging at a rate we cannot honour.
    return { ok: false, status: 'rate_unavailable' };
  }

  const currencyCode = GATEWAY_CURRENCY[gateway];
  const amountLocal = convertUsd(amountUsd, fx.rate);

  if (!(amountLocal > 0)) {
    console.error('[wallet/topup] converted amount is not positive', {
      amountUsd, rate: fx.rate, currencyCode,
    });
    return { ok: false, status: 'error' };
  }

  // ── The intent ──────────────────────────────────────────────────────────
  const { data, error } = await supabase.rpc('start_wallet_topup', {
    p_profile_id:   user.id,
    p_amount_usd:   amountUsd,
    p_gateway:      gateway,
    p_amount_minor: amountLocal,
    p_currency_code: currencyCode,
    p_fx_rate:      fx.rate,
  });

  if (error) {
    // check_violation (23514) now means one thing only: zero or negative. The
    // shape check above already catches that, so reaching here means something
    // slipped past it — answer with the same field message rather than a
    // page-level error.
    //
    // The database ships a ready Arabic sentence with this error and we
    // deliberately do not show it: the site serves four languages, and an
    // Arabic string on a Russian page is a bug, not a shortcut. It is logged
    // for support instead.
    if (error.code === '23514' || /check_violation/i.test(error.message)) {
      console.warn('[wallet/topup] refused by the amount check', {
        profileId: user.id, amountUsd, dbMessage: error.message,
      });
      return { ok: false, status: 'invalid', fields: ['amount'] };
    }

    if (error.code === '42501') {
      console.error('[wallet/topup] insufficient_privilege on start_wallet_topup', {
        profileId: user.id, message: error.message,
      });
      return { ok: false, status: 'unauthorized' };
    }

    console.error('[wallet/topup] start_wallet_topup failed', {
      profileId: user.id, amountUsd, gateway,
      message: error.message, code: error.code, details: error.details,
    });
    return { ok: false, status: 'error' };
  }

  // The RPC returns jsonb — one object, not a row set.
  const payload = (Array.isArray(data) ? data[0] : data) as
    | { intent_id?: string; amount_usd?: unknown; status?: string }
    | null;

  const intentId = payload?.intent_id;
  if (!intentId) {
    console.error('[wallet/topup] start_wallet_topup returned no intent_id', { payload });
    return { ok: false, status: 'error' };
  }

  return {
    ok: true,
    intentId,
    amountUsd,
    gateway,
    amountLocal,
    currencyCode,
    fxRate: fx.rate,
  };
}
