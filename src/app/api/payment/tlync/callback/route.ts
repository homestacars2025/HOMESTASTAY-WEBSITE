import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { settleTlyncPayment } from '@/lib/payment/tlync-settle';

/**
 * TLYNC's server-to-server callback (backend_url).
 *
 * ⚠️ THE CALLBACK IS A DOORBELL, NOT A VERDICT.
 *   TLYNC publishes no signature scheme for this POST, so its body is treated
 *   as untrusted in full: it says WHICH payment to look at and nothing more.
 *   Every status decision is made in settleTlyncPayment, from
 *   receipt/transaction, called server-to-server with our store token. Anyone
 *   can POST here; nobody can make a booking paid by doing so.
 *
 * ⚠️ AND IT MAY NEVER RING AT ALL.
 *   In UAT, TLYNC has not been observed POSTing here even for payments its own
 *   receipt endpoint confirms as 'success' — attempts sat unresolved for days.
 *   So this route is no longer the only way a payment settles: the guest's
 *   return from TLYNC and the reconcile sweep call the same function. This
 *   endpoint is now the fast path, not the load-bearing one.
 *
 * EVERY inbound request is logged in full — method, headers, raw body — so the
 * question "is TLYNC calling us at all?" is answerable from the log rather
 * than by inference from what did not happen.
 *
 * Returns plain JSON; no guest ever sees this. The browser journey is
 * /api/payment/tlync/return.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Never log these, whatever TLYNC decides to send. */
const REDACTED_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization']);

export async function POST(request: NextRequest) {
  // ── Optional network-level narrowing ──────────────────────────────────────
  // TLYNC has not published its egress IPs. If they ever do, set
  // TLYNC_CALLBACK_IPS and this becomes a real filter; unset, it is a no-op
  // and the receipt check remains the only thing standing between a forged
  // POST and a booking — which is by design, not by omission.
  const allowed = (process.env.TLYNC_CALLBACK_IPS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  const clientIp =
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '';

  // ── Full inbound capture, before any decision ─────────────────────────────
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = REDACTED_HEADERS.has(key.toLowerCase()) ? '[redacted]' : value;
  });

  let raw = '';
  let readError: string | null = null;
  try {
    raw = await request.text();
  } catch (err) {
    readError = err instanceof Error ? err.message : String(err);
  }

  console.log('[tlync/callback] INBOUND', {
    method: request.method,
    url: request.url,
    ip: clientIp,
    headers,
    bodyLength: raw.length,
    // Verbatim. TLYNC's callback body has no documented shape and carries no
    // card data — the whole point is to find out what actually arrives.
    body: raw.slice(0, 4000),
    ...(readError ? { readError } : {}),
  });

  if (readError) {
    return NextResponse.json({ ok: false, error: 'unreadable' }, { status: 400 });
  }

  if (allowed.length > 0 && !allowed.includes(clientIp)) {
    console.warn('[tlync/callback] rejected callback from unlisted ip', {
      ip: clientIp, allowed,
    });
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  const payload = parseBody(raw, contentType);

  // The ref may also ride in the query string — TLYNC's callback contract is
  // undocumented enough that both are worth reading.
  const query = new URL(request.url).searchParams;

  const customRef =
    pick(payload, 'custom_ref') ?? pick(payload, 'customRef') ??
    query.get('custom_ref')?.trim() ?? query.get('ref')?.trim() ?? '';

  const transactionRef =
    pick(payload, 'transaction_ref') ?? pick(payload, 'transactionRef') ??
    pick(payload, 'transaction_id') ?? query.get('transaction_ref')?.trim() ?? null;

  console.log('[tlync/callback] extracted', {
    customRef: customRef || '(none)',
    transactionRef: transactionRef ?? '(none)',
    payloadKeys: Object.keys(payload),
  });

  if (!customRef) {
    console.error('[tlync/callback] no custom_ref anywhere in callback', {
      contentType, payloadKeys: Object.keys(payload), body: raw.slice(0, 1000),
    });
    return NextResponse.json({ ok: false, error: 'no_ref' }, { status: 400 });
  }

  const outcome = await settleTlyncPayment(createAdminClient(), {
    customRef, transactionRef, trigger: 'callback',
  });

  console.log('[tlync/callback] outcome', { customRef, ...outcome });

  // Status codes are chosen for TLYNC's retry logic: 502 on "we could not
  // reach the receipt endpoint" invites a retry, everything settled answers 200.
  switch (outcome.status) {
    case 'paid':
    case 'already_paid':
    case 'not_completed':
      return NextResponse.json({ ok: true, status: outcome.status });
    case 'receipt_unavailable':
      return NextResponse.json({ ok: false, error: outcome.status }, { status: 502 });
    case 'unknown_ref':
      return NextResponse.json({ ok: false, error: outcome.status }, { status: 404 });
    case 'write_failed':
      return NextResponse.json({ ok: false, error: outcome.status }, { status: 500 });
    default:
      return NextResponse.json({ ok: false, error: outcome.status }, { status: 409 });
  }
}

/**
 * Reachability probe. Answers "can TLYNC's server see this URL at all?" without
 * touching a payment — the question that took days to answer by inference.
 * Deliberately state-free: it settles nothing and reveals nothing.
 */
export async function GET(request: NextRequest) {
  console.log('[tlync/callback] GET probe', {
    url: request.url,
    ip: request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for') ?? '',
    userAgent: request.headers.get('user-agent') ?? '',
  });
  return NextResponse.json({
    ok: true,
    endpoint: 'tlync-backend-callback',
    accepts: 'POST',
  });
}

/** urlencoded or JSON — TLYNC's callback encoding is not documented. */
function parseBody(raw: string, contentType: string): Record<string, unknown> {
  const asJson = (): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };

  if (contentType.includes('application/json')) {
    const parsed = asJson();
    if (parsed) return parsed;
  }

  const params = new URLSearchParams(raw);
  const out: Record<string, unknown> = {};
  for (const [key, value] of params) out[key] = value;

  // A JSON body sent without the header parses as one nonsense key. Retry it.
  if (Object.keys(out).length <= 1 && raw.trim().startsWith('{')) {
    const parsed = asJson();
    if (parsed) return parsed;
  }

  return out;
}

function pick(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}
