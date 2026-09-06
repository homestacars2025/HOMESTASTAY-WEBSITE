import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticate } from '@/lib/app/auth';
import { loadOwnedIntent, loadTopupIntentByOrder } from '@/lib/wallet/topup';

/**
 * What happened to a top-up. THIS IS THE APP'S SOURCE OF TRUTH.
 *
 * ⚠️ THE DEEP LINK IS NOT. It closes the browser and wakes the app; anyone can
 * type a custom-scheme URL by hand, so the app must ask here before it shows a
 * guest anything. Same rule the website applies to TLYNC's return URL:
 * navigation is not a verdict.
 *
 * Also the polling endpoint, for the case the deep link never arrives — the
 * guest killed the browser, the network dropped, the callback is still in
 * flight. Poll on app foreground and after the deep link; both land here.
 *
 * ⚠️ failure_reason IS DELIBERATELY NOT RETURNED. Its values are internal
 * ('tlync_refused', 'provision_51', 'bank_unreachable') — a decline code is
 * the card issuer's business with the cardholder, not ours to broadcast, and
 * an app that renders one untranslated is worse than one that says "try
 * again". The app owns the wording.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const caller = await authenticate(request);
  if (!caller) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { user, supabase: asUser } = caller;
  const params = new URL(request.url).searchParams;
  const intentId = params.get('intentId')?.trim() ?? '';
  const merchantOrderId = params.get('merchantOrderId')?.trim() ?? '';

  if (!intentId && !merchantOrderId) {
    return NextResponse.json({ ok: false, error: 'missing_reference' }, { status: 400 });
  }

  // Service-role for the READ, ownership enforced immediately below.
  // wallet_topup_intents is not guest-readable under RLS — the website reaches
  // it the same way, through loadOwnedIntent, which is the check rather than
  // the client.
  const admin = createAdminClient();

  const intent = intentId
    ? await loadOwnedIntent(admin, intentId, user.id)
    : await byOrder(admin, merchantOrderId, user.id);

  // Not found and not yours are ONE answer, on purpose: distinguishing them
  // turns this into a way to learn which intent ids exist and whose they are.
  if (!intent) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  // ── The balance, only once there is a reason to read it ──────────────────
  // On the user's own client, so RLS authorises it rather than us. Skipped
  // entirely until the top-up is paid: an unpaid poll should not cost a second
  // query, and the app has no use for the figure before then.
  let newBalanceUsd: number | null = null;

  if (intent.status === 'paid') {
    const { data, error } = await asUser
      .from('ledger_accounts')
      .select('balance_usd, status')
      .eq('profile_id', user.id)
      .eq('party_type', 'customer_wallet')
      .maybeSingle();

    if (error) {
      // The status is still the answer the app asked for. A balance we could
      // not read is omitted, never sent as 0 — zero is a real balance, and
      // reporting it for a failed read would tell a guest their money is gone.
      console.error('[app/topup/status] balance read failed', {
        profileId: user.id, message: error.message, code: error.code,
      });
    } else if (data && data.status === 'active') {
      newBalanceUsd = num(data.balance_usd);
    }
  }

  return NextResponse.json({
    ok: true,
    intentId: intent.id,
    merchantOrderId: intent.merchantOrderId,
    status: intent.status,
    amountUsd: intent.amountUsd,
    ...(newBalanceUsd !== null ? { newBalanceUsd } : {}),
  });
}

/**
 * By order id, with the same ownership rule.
 *
 * loadTopupIntentByOrder is the callback's lookup and checks nothing — it has
 * no session to check against. Here there IS one, so the check is made
 * explicitly rather than skipped because the helper does not make it.
 */
async function byOrder(
  admin: ReturnType<typeof createAdminClient>,
  merchantOrderId: string,
  profileId: string,
) {
  const intent = await loadTopupIntentByOrder(admin, merchantOrderId);
  if (!intent || intent.profileId !== profileId) {
    console.warn('[app/topup/status] order missing or not owned by caller', {
      merchantOrderId, found: Boolean(intent),
    });
    return null;
  }
  return intent;
}

/** PostgREST hands `numeric` back as a string; coerce once, here. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
