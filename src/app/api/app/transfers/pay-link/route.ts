import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/app/auth';
import { getTransfer } from '@/lib/transfers/server';
import { mintAppTransferToken } from '@/lib/transfers/pay-session';
import { AWAITING_PAYMENT, PAID_STATES, UUID_RE } from '@/lib/transfers/model';

/**
 * POST /api/app/transfers/pay-link — Authorization: Bearer <app access token>
 * body {transferId, lang?: en|ar|tr|ru}
 *
 * The app's way to open the website payment page ALREADY SIGNED IN: the
 * phone's browser has no website session, so the page accepts a 15-minute,
 * one-transfer pay token instead (the wallet top-up pattern). Ownership is
 * the database's own check: transfer_get AS THE USER.
 *
 *   200 {ok:true, payUrl}                       open it in the browser
 *   200 {ok:false, error:'already_paid'|'not_payable'}
 *   401 {error:'unauthorized'}  403 {error:'not_customer'}  404 {error:'not_found'}
 *
 * Without this call the plain URL still works — it just asks to sign in.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LANGS = new Set(['en', 'ar', 'tr', 'ru']);

export async function POST(request: Request) {
  const caller = await authenticate(request);
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!caller.usesGuestArea) return NextResponse.json({ error: 'not_customer' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { transferId?: unknown; lang?: unknown } | null;
  const transferId = typeof body?.transferId === 'string' ? body.transferId : '';
  const lang = typeof body?.lang === 'string' && LANGS.has(body.lang) ? body.lang : 'en';
  if (!UUID_RE.test(transferId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const transfer = await getTransfer(caller.supabase, transferId);
  if (!transfer) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (PAID_STATES.has(transfer.status)) return NextResponse.json({ ok: false, error: 'already_paid' });
  if (!AWAITING_PAYMENT.has(transfer.status)) return NextResponse.json({ ok: false, error: 'not_payable' });

  const token = mintAppTransferToken({ transferId, profileId: caller.user.id });
  const origin = new URL(request.url).origin;
  const payUrl = `${origin}/${lang}/transfers/pay/${transferId}?t=${encodeURIComponent(token)}`;
  return NextResponse.json({ ok: true, payUrl }, { headers: { 'Cache-Control': 'no-store' } });
}
