import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  kuveytConfig, payGateUrl, buildPayGateXml, postToBank, splitE164, toMinorUnits,
} from '@/lib/payment/kuveyt-turk';
import { callbackUrl } from '@/lib/payment/urls';
import { loadOwnedIntent, newWalletOrderId } from '@/lib/wallet/topup';

/**
 * Starts a 3D Secure payment for a WALLET TOP-UP.
 *
 * The sibling of /api/payment/start, and deliberately a near-mirror of it: a
 * Route Handler taking a real form POST, because the response IS the bank's
 * 3DS page and has to become the document (iframes banned by the bank since
 * 31.12.2022). Card data arrives, goes into the XML, and is gone when this
 * request ends. Nothing here is logged.
 *
 * TWO THINGS DIFFER FROM THE BOOKING ROUTE, BOTH LOAD-BEARING:
 *
 *   1. IDENTITY IS THE SESSION, NOT A COOKIE. A booking has no account, so its
 *      id travels in a signed httpOnly cookie. A top-up requires one, so the
 *      intent id may travel in the form body — loadOwnedIntent proves it
 *      belongs to auth.uid() before anything else happens.
 *
 *   2. THE ORDER ID CARRIES 'WT-'. Both gateways share one callback URL,
 *      because OkUrl/FailUrl are hashed into HashData and a second URL is a
 *      second hash to get wrong. The prefix is what routes the callback to
 *      complete_wallet_topup instead of complete_payment.
 *
 * THE AMOUNT IS NEVER READ FROM THE BODY. It is re-read from the intent, which
 * fixed it (and its FX rate) when it was written.
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

  // Only a pending intent may be paid. Anything else means a payment is
  // already in flight or finished, and starting a second one is how an intent
  // gets charged twice.
  if (intent.status !== 'pending') return fail(intent.status);

  if (intent.amountMinor === null || intent.amountMinor <= 0) {
    console.error('[wallet/start] intent has no TRY amount', { intentId });
    return fail('server');
  }

  // ── Contact details for CardHolderData (mandatory for 3DS 2.0) ───────────
  // Email is taken from the verified session, never from the form: it
  // identifies the account, and a form field would let a caller put someone
  // else's address on the transaction.
  const email = user.email ?? '';
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

  // x-forwarded-for is a chain; the client is the first entry.
  const clientIp =
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '0.0.0.0';

  // ── Claim the intent, BEFORE anything reaches the bank ────────────────────
  // attach_topup_order binds this order id to the intent and moves it to
  // 'processing'. It must happen first: a payment that somehow completes while
  // our write path is dying must still be resolvable from the order id alone,
  // which is the same reason the booking route writes its attempt row first.
  const merchantOrderId = newWalletOrderId();

  const { error: attachError } = await admin.rpc('attach_topup_order', {
    p_intent_id:         intent.id,
    p_merchant_order_id: merchantOrderId,
  });

  if (attachError) {
    console.error('[wallet/start] attach_topup_order failed', {
      intentId, merchantOrderId,
      message: attachError.message, code: attachError.code,
    });
    return fail('server');
  }

  // amount_minor on the intent is the TRY figure (e.g. 3421.50). The bank wants
  // integer kuruş, derived on the decimal digits — never through a double. See
  // toMinorUnits for the 1.005 * 100 case that makes Math.round unsafe here.
  const amountMinor = toMinorUnits(intent.amountMinor.toFixed(2));

  // ONE variable feeds both the hash and the XML tags. OkUrl and FailUrl must
  // be byte-identical between them; deriving either twice is how that breaks.
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

    // A 2xx from PayGate is NOT proof of a real 3DS challenge — an error page
    // comes back 200 too. The distinguishing test is the form's target: a
    // genuine response auto-posts to the bank's ACS. Detected and logged only,
    // never blocking. The response contains no card number.
    const formAction = html.match(/<form[^>]*\baction=["']([^"']+)["']/i)?.[1] ?? null;
    const looksLikeAcsRedirect =
      /acs|3d|secure|mpi|threeds/i.test(formAction ?? '') ||
      /PaReq|creq|threeDS/i.test(html);

    console.log('[wallet/start] payGate 2xx', {
      merchantOrderId, bytes: html.length, formAction, looksLikeAcsRedirect,
    });
    if (!looksLikeAcsRedirect) {
      console.warn('[wallet/start] PayGate response does not look like an ACS redirect', {
        merchantOrderId, head: html.slice(0, 1500),
      });
    }

    // The bank's 3DS page becomes the document. Full top-level, no iframe.
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type':  'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    // Nothing reached the bank, so the intent is safe to release. Failing it
    // here means the guest can start again immediately instead of waiting for
    // it to expire.
    console.error('[wallet/start] bank call failed', {
      merchantOrderId,
      error: err instanceof Error ? err.message : String(err),
    });
    await failIntent(admin, merchantOrderId, 'bank_unreachable');
    return fail('bank');
  }
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
    console.error('[wallet/start] fail_wallet_topup did not record the failure', {
      merchantOrderId, reason, message: error.message, code: error.code,
    });
  }
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}
