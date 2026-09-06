import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/app/auth';
import { mintPayToken } from '@/lib/app/pay-token';
import { getAccountForUser } from '@/lib/booking/account';
import { isAccountLibyaEligible } from '@/lib/payment/libya-account';
import { usdRate, convertUsd } from '@/lib/payment/fx';
import {
  tlyncConfig, tlyncDiagnostics, initiatePayment, buildCustomRef,
} from '@/lib/payment/tlync';
import { isTlyncConfigured } from '@/lib/payment/tlync';
import { tlyncBackendUrl, tlyncFrontendUrl } from '@/lib/payment/urls';
import { newAppWalletOrderId } from '@/lib/wallet/topup';
import { routing } from '@/i18n/routing';

/**
 * Open a wallet top-up from the mobile app.
 *
 * ⚠️ THE APP NEVER SEES A CARD, AND THAT IS THE WHOLE ARCHITECTURE.
 *   This route returns a payUrl. The app opens it in the SYSTEM BROWSER
 *   (openAuthSessionAsync), the card is typed there, 3D Secure runs there, and
 *   the browser closes on a deep link. Card data therefore never touches the
 *   app process — which keeps it out of PCI scope — and 3DS runs in a real
 *   browser, which is what card issuers are least likely to refuse.
 *
 * ⚠️ AND IT NEVER SEES A SECRET. The bank credentials, the store token and the
 *   service-role key stay here. Nothing below is echoed into the response.
 *
 * WHICH CLIENT DOES WHAT, AND WHY IT MATTERS
 *   caller.supabase — the USER's own token. start_wallet_topup checks
 *     auth.uid() = p_profile_id itself, so this is the one client that can
 *     satisfy it. A service-role call would turn that check into an assertion
 *     the caller makes about itself.
 *   createAdminClient() — reference data only (currencies, app_settings) and
 *     attach_topup_order. Never the caller's own rows, and no user input
 *     reaches those reads.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Gateway = 'kuveyt' | 'tlync';

const GATEWAY_CURRENCY: Record<Gateway, 'TRY' | 'LYD'> = {
  kuveyt: 'TRY',
  tlync:  'LYD',
};

/** Mirrors the website's table: TRY has no manual fallback, LYD does. */
const GATEWAY_FX: Record<Gateway, { code: 'TRY' | 'LYD'; fallbackSettingKey?: string }> = {
  kuveyt: { code: 'TRY' },
  tlync:  { code: 'LYD', fallbackSettingKey: 'fx_usd_lyd' },
};

function bad(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  // ── Who is calling ────────────────────────────────────────────────────────
  const caller = await authenticate(request);
  if (!caller) return bad(401, 'unauthorized');

  const { user, supabase: asUser } = caller;

  let body: { amountUsd?: unknown; gateway?: unknown; locale?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return bad(400, 'invalid_body');
  }

  // ── Shape checks ──────────────────────────────────────────────────────────
  // The RPC remains the authority; this turns a typo into a field answer
  // instead of a round trip. No cap, deliberately — start_wallet_topup imposes
  // none, by the owner's decision, and inventing one here would be a limit the
  // website does not have.
  const amountUsd = Math.round(Number(body.amountUsd) * 100) / 100;
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return bad(400, 'invalid_amount');

  const gateway = body.gateway as Gateway;
  if (gateway !== 'kuveyt' && gateway !== 'tlync') return bad(400, 'invalid_gateway');

  // The hosted card page lives under [locale], so the app's language has to
  // reach it or an Arabic guest gets an English form. Validated against the
  // real locale list rather than interpolated: this value lands in a path.
  const locale = pickLocale(body.locale);
  if (gateway === 'tlync' && !isTlyncConfigured()) return bad(400, 'invalid_gateway');

  // ── The dinar rail is for Libyan guests, re-checked SERVER-SIDE ───────────
  // The app decides what to render; this decides what is allowed. A hidden
  // option closes nothing on its own.
  const account = await getAccountForUser(asUser, user);
  if (!account) return bad(401, 'unauthorized');

  if (gateway === 'tlync' && !(await isAccountLibyaEligible(account))) {
    console.warn('[app/topup/start] tlync refused — account is not Libya-eligible', {
      profileId: user.id,
    });
    return bad(400, 'invalid_gateway');
  }

  // ── The rate, locked now and handed to the RPC ────────────────────────────
  const admin = createAdminClient();
  const fx = await usdRate(admin, { ...GATEWAY_FX[gateway], logPrefix: '[app/topup]' });

  if (!fx) {
    // The same refusal lock_booking_fx makes for a stale TRY rate: not selling
    // beats charging at a rate we cannot honour.
    return bad(503, 'rate_unavailable');
  }

  const currencyCode = GATEWAY_CURRENCY[gateway];
  const amountLocal = convertUsd(amountUsd, fx.rate);
  if (!(amountLocal > 0)) return bad(500, 'server_error');

  // ── The intent, on the USER's client ─────────────────────────────────────
  const { data, error } = await asUser.rpc('start_wallet_topup', {
    p_profile_id:    user.id,
    p_amount_usd:    amountUsd,
    p_gateway:       gateway,
    p_amount_minor:  amountLocal,
    p_currency_code: currencyCode,
    p_fx_rate:       fx.rate,
  });

  if (error) {
    if (error.code === '23514' || /check_violation/i.test(error.message)) {
      return bad(400, 'invalid_amount');
    }
    if (error.code === '42501') {
      // auth.uid() did not match. Same answer as no token at all.
      console.error('[app/topup/start] insufficient_privilege', {
        profileId: user.id, message: error.message,
      });
      return bad(401, 'unauthorized');
    }
    console.error('[app/topup/start] start_wallet_topup failed', {
      profileId: user.id, gateway, message: error.message, code: error.code,
    });
    return bad(500, 'server_error');
  }

  const payload = (Array.isArray(data) ? data[0] : data) as { intent_id?: string } | null;
  const intentId = payload?.intent_id;
  if (!intentId) {
    console.error('[app/topup/start] no intent_id returned', { profileId: user.id });
    return bad(500, 'server_error');
  }

  if (gateway === 'tlync') {
    // TLYNC IS THE OPPOSITE CASE, and its ordering is right as it stands: the
    // gateway is called in THIS request, so the order id must exist and be
    // attached before that call. TLYNC also echoes custom_ref back everywhere,
    // so the value stored must be the value the callback will present —
    // buildCustomRef's output, not the bare id. 'WT-A-' still leads it, so
    // both discriminators survive.
    const customRef = buildCustomRef(newAppWalletOrderId());
    return startTlync({ admin, customRef, amountLocal, account, intentId });
  }

  // ⚠️ NO ORDER ID AND NO attach_topup_order ON THE CARD PATH, DELIBERATELY.
  //
  // attach_topup_order moves the intent to 'processing', which means "a
  // gateway is holding this now". On the card path no gateway hears anything
  // in this request — the guest has not even seen the form yet. Claiming it
  // here made every app intent 'processing' the moment it was created, and the
  // hosted page refuses anything that is not 'pending', so every app top-up
  // was born unpayable.
  //
  // The website has always done it the other way round: it mints and attaches
  // inside the SAME request that posts to the bank (payment/wallet/start,
  // where the card arrives). The card path now mirrors that exactly —
  // /api/app/wallet/topup/pay claims the id at the moment it calls PayGate.
  //
  // The consequence worth knowing: there is no merchantOrderId to return yet.
  // intentId is the app's handle until a payment actually starts.

  // ── The hosted card page ─────────────────────────────────────────────────
  // A signed capability, not a session: the system browser has no cookie of
  // ours. Short-lived, bound to this intent AND this profile. See pay-token.ts.
  const token = mintPayToken({ intentId, profileId: user.id });

  // ⚠️ THE PAGE, NOT THE FORM'S ACTION. /api/app/wallet/topup/pay exports POST
  // only — it is what the card form submits to, and a browser opening it with
  // GET gets 405 and a blank window. That was the bug: the app was handed the
  // endpoint instead of the page it is posted from.
  const payUrl =
    `${originOf(request)}/${locale}/wallet/app-pay?t=${encodeURIComponent(token)}`;

  return NextResponse.json({
    ok: true,
    intentId,
    // Null until /pay claims one. Present as a key so the app can read it
    // without a guard, and honestly empty rather than invented.
    merchantOrderId: null,
    payUrl,
    amountUsd,
    amountLocal,
    currencyCode,
  });
}

/**
 * TLYNC needs no page of ours: it hosts its own. The payUrl is TLYNC's.
 *
 * attach_topup_order is called with the custom ref for the reason above, and
 * only after TLYNC accepts — a ref TLYNC never saw is a row that can never be
 * reconciled against anything.
 */
async function startTlync({
  admin, customRef, amountLocal, account, intentId,
}: {
  admin: ReturnType<typeof createAdminClient>;
  customRef: string;
  amountLocal: number;
  account: { email: string; phone: string | null };
  intentId: string;
}) {
  const { error: attachError } = await admin.rpc('attach_topup_order', {
    p_intent_id:         intentId,
    p_merchant_order_id: customRef,
  });

  if (attachError) {
    console.error('[app/topup/start] attach_topup_order failed (tlync)', {
      intentId, customRef, message: attachError.message,
    });
    return bad(500, 'server_error');
  }

  const phone = account.phone ?? '';
  if (!phone) return bad(400, 'phone_required');

  const cfg = tlyncConfig();
  const diagnostics = tlyncDiagnostics(cfg);
  console.log('[app/topup/start] tlync target', { customRef, ...diagnostics });

  let initiated;
  try {
    initiated = await initiatePayment(cfg, {
      amountLyd:   amountLocal,
      phone,
      email:       account.email,
      backendUrl:  tlyncBackendUrl(),
      // The locale is the app's problem, not ours; 'en' keeps the return
      // route's own redirect valid. The app closes the browser on the deep
      // link long before this page matters.
      frontendUrl: tlyncFrontendUrl('en', customRef),
      customRef,
    });
  } catch (err) {
    console.error('[app/topup/start] tlync initiate threw', {
      customRef, error: err instanceof Error ? err.message : String(err),
    });
    await failIntent(admin, customRef, 'tlync_unreachable');
    return bad(502, 'gateway_unavailable');
  }

  if (!initiated.ok) {
    console.error('[app/topup/start] tlync initiate refused', {
      customRef, status: initiated.status, message: initiated.message,
    });
    await failIntent(admin, customRef, 'tlync_refused');
    return bad(502, 'gateway_unavailable');
  }

  return NextResponse.json({
    ok: true,
    intentId,
    merchantOrderId: customRef,
    payUrl: initiated.url,
  });
}

async function failIntent(
  admin: ReturnType<typeof createAdminClient>,
  merchantOrderId: string,
  reason: string,
): Promise<void> {
  const { error } = await admin.rpc('fail_wallet_topup', {
    p_merchant_order_id: merchantOrderId,
    p_reason: reason,
  });
  if (error) {
    console.error('[app/topup/start] fail_wallet_topup did not record the failure', {
      merchantOrderId, reason, message: error.message,
    });
  }
}

/**
 * The app's locale, or 'en'.
 *
 * Checked against routing.locales rather than trusted: this string is
 * interpolated into a URL path, and an unvalidated one would let a caller
 * point payUrl at any path on our own origin.
 */
function pickLocale(value: unknown): string {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (routing.locales as readonly string[]).includes(candidate)
    ? candidate
    : routing.defaultLocale;
}

/**
 * The origin the APP should open, which is this deployment's own.
 *
 * Deliberately NOT PAYMENT_CALLBACK_ORIGIN: that one is hashed into HashData
 * and must never vary, whereas this is just where the app sends its browser.
 * Taken from the request so a preview deployment serves a preview payUrl.
 */
function originOf(request: NextRequest): string {
  return new URL(request.url).origin;
}
