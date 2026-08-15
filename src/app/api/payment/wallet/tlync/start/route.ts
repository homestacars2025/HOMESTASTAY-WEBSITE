import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  tlyncConfig, tlyncDiagnostics, initiatePayment, buildCustomRef,
} from '@/lib/payment/tlync';
import { tlyncBackendUrl, tlyncFrontendUrl } from '@/lib/payment/urls';
import { loadOwnedIntent, newWalletOrderId } from '@/lib/wallet/topup';

/**
 * Starts a TLYNC (Libya, LYD) wallet top-up.
 *
 * TLYNC is a hosted aggregator, so this route takes no payment data: it asks
 * TLYNC for a payment page and redirects the guest to it. The guest chooses
 * Tadawul / MobiCash / … there, not here.
 *
 * NOTHING HERE CREDITS ANYTHING. This route ends with the guest on TLYNC's
 * page and an intent in 'processing', waiting for a receipt check to confirm
 * it — see lib/payment/wallet-tlync-settle.ts.
 *
 * ── THE CUSTOM REF IS THE ORDER ID ────────────────────────────────────────
 * buildCustomRef appends 8 hex characters of entropy to the order id, and it
 * is the RESULT that is handed to attach_topup_order — not the bare id. That
 * is deliberate and it is how the booking flow does it too: TLYNC echoes
 * custom_ref back on every surface, so the value the callback will present
 * must be the value stored on the row it has to find. The 'WT-' prefix leads
 * the string either way, so the callback still routes on it.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const locale = str(form.get('locale')) || 'en';

  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(`/${locale}/wallet?topup=failed&reason=${reason}`, request.url),
      { status: 303 },
    );

  const intentId = str(form.get('intentId')).trim();
  if (!intentId) return fail('session');

  // ── Who is asking ─────────────────────────────────────────────────────────
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return fail('session');

  const admin = createAdminClient();

  const intent = await loadOwnedIntent(admin, intentId, user.id);
  if (!intent) return fail('session');
  if (intent.status !== 'pending') return fail(intent.status);

  if (intent.amountMinor === null || intent.amountMinor <= 0) {
    console.error('[wallet/tlync/start] intent has no LYD amount', { intentId });
    return fail('server');
  }

  // TLYNC requires both. Email comes from the verified session, never a form
  // field — it identifies the account.
  const email = user.email ?? '';
  const phone = str(form.get('phone')).trim();
  if (!email || !/^\+[1-9][0-9]{6,14}$/.test(phone)) return fail('contact');

  // ── Claim the intent BEFORE TLYNC is called ───────────────────────────────
  const customRef = buildCustomRef(newWalletOrderId());

  const { error: attachError } = await admin.rpc('attach_topup_order', {
    p_intent_id:         intent.id,
    p_merchant_order_id: customRef,
  });

  if (attachError) {
    console.error('[wallet/tlync/start] attach_topup_order failed', {
      intentId, customRef,
      message: attachError.message, code: attachError.code,
    });
    return fail('server');
  }

  // ── TLYNC ─────────────────────────────────────────────────────────────────
  let cfg;
  try {
    cfg = tlyncConfig();
  } catch (err) {
    console.error('[wallet/tlync/start] config invalid', {
      customRef, error: err instanceof Error ? err.message : String(err),
    });
    await failIntent(admin, customRef, 'tlync_unconfigured');
    return fail('gateway');
  }

  // Logged on EVERY initiate: which host, which path, which header shape. A
  // refusal caused by the wrong base URL is indistinguishable from a bad token
  // unless this line is already in the log next to it.
  const diagnostics = tlyncDiagnostics(cfg);
  console.log('[wallet/tlync/start] target', { customRef, ...diagnostics });
  if (diagnostics.warning) {
    console.error('[wallet/tlync/start] BASE URL LOOKS WRONG', {
      customRef, warning: diagnostics.warning,
    });
  }

  const backendUrl  = tlyncBackendUrl();
  const frontendUrl = tlyncFrontendUrl(locale, customRef);

  let initiated;
  try {
    initiated = await initiatePayment(cfg, {
      amountLyd: intent.amountMinor,
      phone,
      email,
      backendUrl,
      frontendUrl,
      customRef,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[wallet/tlync/start] initiate threw', {
      customRef, endpoint: diagnostics.initiateUrl, error: detail,
    });
    await failIntent(admin, customRef, 'tlync_unreachable');
    return fail('gateway');
  }

  if (!initiated.ok) {
    console.error('[wallet/tlync/start] initiate refused', {
      customRef,
      endpoint: initiated.endpoint,
      status: initiated.status,
      message: initiated.message,
      raw: initiated.raw,
      sent: initiated.sent,
    });
    await failIntent(admin, customRef, 'tlync_refused');
    return fail('gateway');
  }

  console.log('[wallet/tlync/start] redirecting guest to TLYNC', {
    customRef, backendUrl, frontendUrl,
  });

  // TLYNC's hosted page becomes the document. 303 so the browser turns this
  // POST into a GET — a refresh on the payment page must not re-post the form.
  return NextResponse.redirect(initiated.url, { status: 303 });
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
    console.error('[wallet/tlync/start] fail_wallet_topup did not record the failure', {
      merchantOrderId, reason, message: error.message, code: error.code,
    });
  }
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}
