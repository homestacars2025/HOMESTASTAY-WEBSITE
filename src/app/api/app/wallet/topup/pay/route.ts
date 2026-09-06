import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readPayToken } from '@/lib/app/pay-token';
import { loadOwnedIntent, newAppWalletOrderId } from '@/lib/wallet/topup';
import {
  kuveytConfig, payGateUrl, buildPayGateXml, postToBank, splitE164, toMinorUnits,
} from '@/lib/payment/kuveyt-turk';
import { callbackUrl } from '@/lib/payment/urls';

/**
 * The card POST from the app's hosted page. A near-mirror of
 * /api/payment/wallet/start, with ONE thing changed: the credential.
 *
 * ⚠️ THE SYSTEM BROWSER HAS NO SESSION COOKIE. The website's route proves
 * ownership with getUser() over a cookie; there is no cookie here, so the
 * signed capability minted at /start does that job instead. Everything after
 * the credential check is identical, deliberately — the bank does not care
 * which door the card came through, and two divergent implementations of a
 * payment call is how they drift apart on the one thing that must not.
 *
 * ⚠️ OkUrl / FailUrl ARE THE SAME callbackUrl() THE WEBSITE USES, and must be:
 * that string is hashed into HashData, and the bank POSTs to it server-side. A
 * deep link there would fail the hash AND be unreachable by the bank. The app
 * is brought back by the callback's redirect, after the money has settled.
 *
 * CARD DATA IS NEVER PERSISTED. It arrives, goes into the XML, and is gone
 * when this request ends. Nothing here is logged.
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

  // ── The credential ────────────────────────────────────────────────────────
  const claims = readPayToken(str(form.get('t')));
  if (!claims) return fail('session');

  const admin = createAdminClient();

  const intent = await loadOwnedIntent(admin, claims.intentId, claims.profileId);
  if (!intent) return fail('session');

  // The intent id in the body must be the one the token authorises. Without
  // this, a valid token for intent A could be posted alongside intent B.
  if (str(form.get('intentId')) !== intent.id) return fail('session');

  // Only a pending intent may be paid; anything else means a payment is
  // already in flight or finished.
  if (intent.status !== 'pending') return fail(intent.status);

  if (intent.amountMinor === null || intent.amountMinor <= 0) {
    console.error('[app/topup/pay] intent has no TRY amount', { intentId: intent.id });
    return fail('server');
  }


  // ── Contact details for CardHolderData (mandatory for 3DS 2.0) ───────────
  // Email comes from the account, never the form: it identifies the profile,
  // and a form field would let a caller put someone else's address on the
  // transaction.
  const { data: authUser } = await admin.auth.admin.getUserById(claims.profileId);
  const email = authUser?.user?.email ?? '';
  const phone = str(form.get('phone')).trim();

  if (!email || !/^\+[1-9][0-9]{6,14}$/.test(phone)) return fail('contact');

  const { cc, subscriber } = splitE164(phone);

  // ── Card fields ───────────────────────────────────────────────────────────
  const card = {
    number:      str(form.get('cardNumber')).replace(/\s+/g, ''),
    expireYear:  str(form.get('expireYear')).slice(-2),
    expireMonth: str(form.get('expireMonth')).padStart(2, '0'),
    cvv:         str(form.get('cvv')),
    holderName:  str(form.get('holderName')).trim(),
  };

  if (
    !/^\d{13,19}$/.test(card.number) ||
    !/^\d{2}$/.test(card.expireYear) ||
    !/^(0[1-9]|1[0-2])$/.test(card.expireMonth) ||
    !/^\d{3,4}$/.test(card.cvv) ||
    card.holderName.length < 2 || card.holderName.length > 45
  ) {
    return fail('card');
  }

  const holder = {
    billAddrCity:     str(form.get('billCity')).trim()     || 'Istanbul',
    billAddrLine1:    str(form.get('billLine1')).trim()    || '-',
    billAddrPostCode: str(form.get('billPostCode')).trim() || '34000',
    billAddrState:    str(form.get('billState')).trim()    || '34',
    email,
    phoneCc:          cc,
    phoneSubscriber:  subscriber,
  };

  const clientIp =
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '0.0.0.0';

  // ── Claim the order id, HERE, because this is the request that reaches the
  //    bank ────────────────────────────────────────────────────────────────
  // attach_topup_order moves the intent to 'processing' — "a gateway is
  // holding this now" — so it belongs in the same request as the PayGate call
  // and nowhere earlier. Doing it in /start made every intent 'processing'
  // before the guest saw the form, and the hosted page correctly refused them.
  //
  // Written BEFORE the bank call, not after: a payment that somehow completes
  // while our write path is dying must still be resolvable from the order id
  // alone. That is the website's ordering, and this is now the same.
  const merchantOrderId = newAppWalletOrderId();

  const { error: attachError } = await admin.rpc('attach_topup_order', {
    p_intent_id:         intent.id,
    p_merchant_order_id: merchantOrderId,
  });

  if (attachError) {
    console.error('[app/topup/pay] attach_topup_order failed', {
      intentId: intent.id, merchantOrderId,
      message: attachError.message, code: attachError.code,
    });
    return fail('server');
  }

  // Integer kuruş, derived on the decimal digits — never through a double.
  const amountMinor = toMinorUnits(intent.amountMinor.toFixed(2));

  // ONE variable feeds both the hash and the XML tags.
  const url = callbackUrl();

  try {
    const cfg = kuveytConfig();

    const xml = buildPayGateXml({
      cfg,
      merchantOrderId,
      amountMinor,
      okUrl:   url,
      failUrl: url,
      card,
      holder,
      clientIp,
    });

    const html = await postToBank(payGateUrl(cfg), xml);

    console.log('[app/topup/pay] payGate 2xx', {
      merchantOrderId, bytes: html.length,
    });

    // The bank's 3DS page becomes the document, inside the system browser the
    // app opened. Full top-level, no iframe — banned by the bank since
    // 31.12.2022.
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type':  'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[app/topup/pay] bank call failed', {
      merchantOrderId,
      error: err instanceof Error ? err.message : String(err),
    });
    // Nothing reached the bank, so the intent is safe to release — the guest
    // can start again instead of waiting for it to expire.
    const { error } = await admin.rpc('fail_wallet_topup', {
      p_merchant_order_id: merchantOrderId,
      p_reason: 'bank_unreachable',
    });
    if (error) {
      console.error('[app/topup/pay] fail_wallet_topup did not record the failure', {
        merchantOrderId, message: error.message,
      });
    }
    return fail('bank');
  }
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}
