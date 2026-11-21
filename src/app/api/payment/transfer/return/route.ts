import { NextResponse, type NextRequest } from 'next/server';
import {
  TRANSFER_RETURN_COOKIE, appTransferReturnUrl, readAttemptToken,
} from '@/lib/transfers/pay-session';
import { UUID_RE } from '@/lib/transfers/model';
import { parseAppReturnUrl } from '@/lib/app/deep-link';

/**
 * GET /api/payment/transfer/return?order=TRF…&r=success|failed|pending|refund
 * — the hop after the bank callback (lib/transfers/callback).
 *
 * The callback is a cross-site POST: no cookies, so it cannot know whether the
 * app started this payment. This request is a top-level GET (the callback's
 * 303), which DOES carry the Lax return cookie set when the card went to the
 * bank. If it belongs to this order and says "app", the phone's browser is
 * sent back into the app (its returnUrl + ?transfer=…&order=…&r=…, no
 * secret, no verdict — the app re-reads transfer_get). Otherwise the website
 * result page. Under /api, so the locale middleware leaves it alone.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HINTS = new Set(['success', 'failed', 'pending', 'refund']);

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const order = q.get('order') ?? '';
  const hintIn = q.get('r') ?? '';
  const r = HINTS.has(hintIn) ? hintIn : 'pending';
  const reason = (q.get('reason') ?? '').replace(/[^a-z0-9_]/gi, '').slice(0, 40);

  const claims = readAttemptToken(request.cookies.get(TRANSFER_RETURN_COOKIE)?.value);
  const mine = claims && claims.merchantOrderId === order ? claims : null;
  const fromQuery = q.get('transfer') ?? '';
  const transferId = mine?.transferId ?? (UUID_RE.test(fromQuery) ? fromQuery : null);

  const done = (res: NextResponse) => {
    res.headers.set('Cache-Control', 'no-store');
    if (mine) res.cookies.delete(TRANSFER_RETURN_COOKIE);
    return res;
  };

  if (mine?.app && transferId) {
    // The app's own returnUrl first (validated again: it sat in a cookie),
    // then the configured scheme. openAuthSessionAsync matches by prefix.
    const deepLink = appTransferReturnUrl(transferId, r, order, parseAppReturnUrl(mine.returnUrl));
    if (deepLink) return done(NextResponse.redirect(deepLink, { status: 303 }));
  }

  if (!transferId) {
    return done(NextResponse.redirect(new URL('/account/transfers', request.url), { status: 303 }));
  }

  const next = new URLSearchParams({ r });
  if (reason) next.set('reason', reason);
  if (mine?.app) next.set('app', '1');
  // No locale prefix: the intl middleware picks it, as for every callback redirect.
  return done(NextResponse.redirect(new URL(`/transfers/pay/${transferId}/done?${next}`, request.url), { status: 303 }));
}
