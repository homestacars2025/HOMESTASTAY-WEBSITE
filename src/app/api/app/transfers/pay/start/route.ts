import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/lib/app/auth';
import { parseAppReturnUrl } from '@/lib/app/deep-link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTransfer, initTransferPayment } from '@/lib/transfers/server';
import { mintAttemptToken } from '@/lib/transfers/pay-session';
import { AWAITING_PAYMENT, PAID_STATES, UUID_RE } from '@/lib/transfers/model';
import { routing } from '@/i18n/routing';

/**
 * POST /api/app/transfers/pay/start — Authorization: Bearer <app access token>
 * body { transferId, locale?: en|ar|tr|ru, returnUrl?: homesta://… | exp://… }
 *
 * The app's card payment for a transfer — THE SAME SHAPE AS THE WALLET TOP-UP
 * (/api/app/wallet/topup/start): the app opens `payUrl` with
 * WebBrowser.openAuthSessionAsync(payUrl, returnUrl); the card form, 3-D Secure
 * and the bank callback all run in that browser (the same Kuveyt PayGate path
 * as stays and top-ups); the browser is closed by a redirect to
 * `returnUrl?transfer=…&order=…&r=…`; the app then asks
 * /api/app/transfers/pay/status. The redirect is a doorbell, never a verdict.
 *
 *   1. ownership — transfer_get AS THE USER (the database's own check);
 *   2. the attempt — transfer_payment_init(p_transfer_id, 'kuveyt') with the
 *      service role: merchant_order_id (TRF…) and amount_try come from the
 *      database. No amount is accepted from the app;
 *   3. payUrl — the hosted card page with a signed 30-minute attempt token
 *      (?a=), bound to this transfer, this order id, this account and this
 *      returnUrl. The phone's browser needs no website session.
 *
 *   200 {ok:true, transferId, merchantOrderId, payUrl, amountUsd, amountLocal, currencyCode:'TRY'}
 *   200 {ok:false, error:'already_paid'|'not_payable'|'expired'}
 *   400 {ok:false, error:'invalid_body'|'invalid_return_url'}
 *   401 unauthorized · 403 not_customer · 404 not_found · 500 server_error
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function reply(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
const bad = (status: number, error: string) => reply(status, { ok: false, error });

export async function POST(request: NextRequest) {
  const caller = await authenticate(request);
  if (!caller) return bad(401, 'unauthorized');
  if (!caller.usesGuestArea) return bad(403, 'not_customer');

  let body: { transferId?: unknown; locale?: unknown; lang?: unknown; returnUrl?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return bad(400, 'invalid_body');
  }

  const transferId = typeof body.transferId === 'string' ? body.transferId.trim() : '';
  if (!UUID_RE.test(transferId)) return bad(404, 'not_found');
  const locale = pickLocale(body.locale ?? body.lang);

  // Custom schemes only (homesta:, exp:) — an https value would make our
  // domain an open redirect. Re-checked at the return route.
  const rawReturnUrl = typeof body.returnUrl === 'string' ? body.returnUrl : null;
  const returnUrl = parseAppReturnUrl(rawReturnUrl);
  if (rawReturnUrl && !returnUrl) return bad(400, 'invalid_return_url');

  // ── 1. Ownership, as the user ────────────────────────────────────────────
  const transfer = await getTransfer(caller.supabase, transferId);
  if (!transfer) return bad(404, 'not_found');
  if (PAID_STATES.has(transfer.status)) return reply(200, { ok: false, error: 'already_paid' });
  if (!AWAITING_PAYMENT.has(transfer.status)) return reply(200, { ok: false, error: 'not_payable' });

  // ── 2. The attempt, by the database ──────────────────────────────────────
  const attempt = await initTransferPayment(createAdminClient(), transferId);
  switch (attempt.status) {
    case 'ok': break;
    case 'not_payable':
      return reply(200, {
        ok: false,
        error: attempt.transferStatus && PAID_STATES.has(attempt.transferStatus) ? 'already_paid' : 'not_payable',
      });
    case 'expired': return reply(200, { ok: false, error: 'expired' });
    case 'not_found':
    case 'forbidden': return bad(404, 'not_found');
    default: return bad(500, 'server_error');
  }

  // ── 3. The hosted page ───────────────────────────────────────────────────
  const token = mintAttemptToken({
    transferId,
    merchantOrderId: attempt.merchantOrderId,
    profileId: caller.user.id,
    app: true,
    returnUrl,
  });
  const origin = new URL(request.url).origin;
  const payUrl = `${origin}/${locale}/transfers/pay/${transferId}?a=${encodeURIComponent(token)}`;

  return reply(200, {
    ok: true,
    transferId,
    merchantOrderId: attempt.merchantOrderId,
    payUrl,
    amountUsd: attempt.amountUsd ?? transfer.priceUsd ?? null,
    amountLocal: attempt.amountTry,
    currencyCode: 'TRY',
  });
}

/** Checked against the real locale list: the value lands in a URL path. */
function pickLocale(value: unknown): string {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (routing.locales as readonly string[]).includes(candidate) ? candidate : routing.defaultLocale;
}
