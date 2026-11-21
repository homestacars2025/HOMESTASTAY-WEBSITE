import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  kuveytConfig, payGateUrl, buildPayGateXml, postToBank, splitE164, toMinorUnits,
} from '@/lib/payment/kuveyt-turk';
import { callbackUrl } from '@/lib/payment/urls';
import {
  TRANSFER_RETURN_COOKIE, TRANSFER_RETURN_COOKIE_MAX_AGE_S, readAttemptToken,
} from '@/lib/transfers/pay-session';
import { E164_RE, num } from '@/lib/transfers/model';

/**
 * The card POST of a transfer payment → Kuveyt Türk 3-D Secure.
 *
 * THE SAME BANK PATH AS STAYS AND TOP-UPS — same config, same PayGate XML,
 * same hashing, same proxy, same callbackUrl() as OkUrl/FailUrl (it is hashed
 * into HashData; the shared callback routes TRF… orders to the transfer
 * branch). Only the credential and the source of the amount differ:
 *
 *   credential  the signed attempt token the payment page minted after its
 *               ownership check (transfer_get as the user, or the app's pay
 *               token). A website payment must ALSO still be that user's
 *               session; an app payment has no session by design.
 *   amount      transfer_payments.amount_try for THAT merchant order id,
 *               written by transfer_payment_init. Nothing posted here can
 *               change what is charged.
 *
 * CARD DATA IS NEVER PERSISTED OR LOGGED.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCALES = new Set(['en', 'ar', 'tr', 'ru']);
const PENDING = new Set(['pending', 'initiated']);

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const localeIn = str(form.get('locale'));
  const locale = LOCALES.has(localeIn) ? localeIn : 'en';
  const appToken = str(form.get('t'));

  const claims = readAttemptToken(str(form.get('attempt')));

  const back = (reason: string) => {
    if (!claims) return NextResponse.redirect(new URL(`/${locale}/transfers`, request.url), { status: 303 });
    const q = new URLSearchParams({ error: reason });
    if (claims.app && appToken) q.set('t', appToken);
    return NextResponse.redirect(new URL(`/${locale}/transfers/pay/${claims.transferId}?${q}`, request.url), { status: 303 });
  };

  if (!claims) return back('session');

  // A website payment: the session must still be the account the attempt was
  // opened for. An app payment carries no session — the token is the proof.
  if (!claims.app) {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user || user.id !== claims.profileId) return back('session');
  }

  const admin = createAdminClient();
  const merchantOrderId = claims.merchantOrderId;

  const { data: payment, error: payErr } = await admin
    .from('transfer_payments')
    .select('status, amount_try')
    .eq('merchant_order_id', merchantOrderId)
    .maybeSingle();
  if (payErr || !payment) {
    console.error('[transfer/start] attempt not found', { merchantOrderId, code: payErr?.code });
    return back('server');
  }
  if (!PENDING.has(String(payment.status))) return back('expired');

  const amountTry = num(payment.amount_try);
  if (amountTry === null || amountTry <= 0) {
    console.error('[transfer/start] attempt has no TRY amount', { merchantOrderId });
    return back('server');
  }

  // ── CardHolderData (3DS 2.0): email from the account, never the form ──────
  const { data: authUser } = await admin.auth.admin.getUserById(claims.profileId);
  const email = authUser?.user?.email ?? '';
  const phone = str(form.get('phone')).trim();
  if (!email || !E164_RE.test(phone)) return back('contact');
  const { cc, subscriber } = splitE164(phone);

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
    return back('card');
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

  // Integer kuruş from the decimal digits — never through a double. The
  // callback derives Request 2's amount from the same column the same way.
  const amountMinor = toMinorUnits(amountTry.toFixed(2));

  try {
    // ONE variable feeds both the hash and the XML tags.
    const url = callbackUrl();
    const cfg = kuveytConfig();
    const xml = buildPayGateXml({ cfg, merchantOrderId, amountMinor, okUrl: url, failUrl: url, card, holder, clientIp });
    const html = await postToBank(payGateUrl(cfg), xml);
    console.log('[transfer/start] payGate 2xx', { merchantOrderId, app: claims.app, bytes: html.length });

    // The bank's 3DS page becomes the document. The return cookie rides along:
    // the result page reads it after the callback (top-level GET → Lax sent).
    const res = new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
    res.cookies.set(TRANSFER_RETURN_COOKIE, str(form.get('attempt')), {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: TRANSFER_RETURN_COOKIE_MAX_AGE_S,
    });
    return res;
  } catch (err) {
    console.error('[transfer/start] bank call failed', {
      merchantOrderId, error: err instanceof Error ? err.message : String(err),
    });
    // Nothing reached the bank: the attempt is failed, and the retry opens a new one.
    const { error } = await admin
      .from('transfer_payments')
      .update({ status: 'failed', response_message: 'bank_unreachable' })
      .eq('merchant_order_id', merchantOrderId);
    if (error) console.error('[transfer/start] could not mark the attempt failed', { merchantOrderId, code: error.code });
    return back('bank');
  }
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}
