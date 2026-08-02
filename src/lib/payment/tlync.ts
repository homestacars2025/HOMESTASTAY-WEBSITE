/**
 * TLYNC (TDSP) — Libyan payment aggregator. SERVER ONLY.
 *
 * TLYNC is a HOSTED-PAGE aggregator: we ask it to initiate a payment, it hands
 * back a URL, the guest picks their Libyan method (Tadawul, MobiCash, …) on
 * TLYNC's own page. We deliberately build NO method picker — which method was
 * used is something we learn afterwards, from the receipt.
 *
 * TWO ENDPOINTS, AND ONLY ONE OF THEM IS TRUSTED
 *   payment/initiate      → the hosted page URL
 *   receipt/transaction   → the state of a payment. THIS IS THE SOURCE OF TRUTH.
 *
 *   TLYNC's server-to-server callback carries no signature scheme we can
 *   verify, so it is treated strictly as a TRIGGER: it tells us to go and look,
 *   it never tells us what happened. Nothing is marked paid on its say-so.
 *   See the callback route for the enforcement of that rule.
 *
 * NO REFUND API EXISTS. A TLYNC payment can only be given back by hand, which
 * is why the DB routes tlync rejections into manual_refunds instead of the
 * automatic Kuveyt refund. Nothing in this file refunds anything.
 *
 * Rate limit: 30 requests/minute per endpoint per token. Our call pattern is
 * one initiate + one receipt per guest payment, so this is not a constraint —
 * but do not add polling loops here without revisiting it.
 */

if (typeof window !== 'undefined') {
  throw new Error(
    '[tlync] imported in the browser. This module holds the store token and ' +
      'must only be used from Server Actions and Route Handlers.'
  );
}

// ── Configuration ─────────────────────────────────────────────────────────────

export type TlyncEnv = 'test' | 'live';

/**
 * Confirmed base URLs. TLYNC_BASE_URL overrides them, but the default is
 * derived from TLYNC_ENV so that flipping one variable moves the whole
 * integration — the same test/live shape the Kuveyt proxy uses.
 */
const DEFAULT_BASE_URL: Record<TlyncEnv, string> = {
  test: 'https://uat-api.tlync.ly/api/v3',
  live: 'https://api.tlync.ly/api/v3',
};

export interface TlyncConfig {
  baseUrl: string;
  storeId: string;
  token:   string;
  env:     TlyncEnv;
}

export function tlyncEnv(): TlyncEnv {
  // Anything other than an explicit 'live' is treated as test. Defaulting the
  // other way round would let a missing variable point real guests at a real
  // store; this way a mistake costs a failed test payment, not a real one.
  return process.env.TLYNC_ENV?.trim().toLowerCase() === 'live' ? 'live' : 'test';
}

/**
 * Cheap, non-throwing readiness check for render paths.
 *
 * The payment step calls this to decide whether the "Pay in Libya" option
 * exists at all. Rendering an option that cannot complete is worse than not
 * offering it, so the UI fails closed on a missing variable.
 */
export function isTlyncConfigured(): boolean {
  return Boolean(process.env.TLYNC_STORE_ID?.trim() && process.env.TLYNC_TOKEN?.trim());
}

export function tlyncConfig(): TlyncConfig {
  const env = tlyncEnv();
  const storeId = process.env.TLYNC_STORE_ID?.trim() ?? '';
  const token   = process.env.TLYNC_TOKEN?.trim() ?? '';

  const missing: string[] = [];
  if (!storeId) missing.push('TLYNC_STORE_ID');
  if (!token)   missing.push('TLYNC_TOKEN');
  if (missing.length > 0) {
    throw new Error(`[tlync] missing env: ${missing.join(', ')}`);
  }

  const baseUrl = (process.env.TLYNC_BASE_URL?.trim() || DEFAULT_BASE_URL[env])
    .replace(/\/+$/, '');

  return { baseUrl, storeId, token, env };
}

/**
 * What we are actually about to call, and in what shape — logged before every
 * initiate.
 *
 * THE MISTAKE THIS EXISTS TO CATCH: uat-api.tlync.ly is the API. test-buyer
 * (and any other buyer/checkout host) is the page a HUMAN pays on. Pointing
 * TLYNC_BASE_URL at the buyer host produces a refusal that looks exactly like
 * a credential problem, because the endpoint simply is not there.
 *
 * Nothing here reveals the token: only its length and the two shapes that
 * silently break Bearer auth — a pasted "Bearer " prefix (giving
 * "Bearer Bearer …") and stray whitespace or a trailing newline from a copy
 * out of a PDF.
 */
export interface TlyncDiagnostics {
  env: TlyncEnv;
  baseUrl: string;
  initiateUrl: string;
  receiptUrl: string;
  baseUrlOverridden: boolean;
  storeId: string;
  acceptHeader: string;
  contentTypeHeader: string;
  authScheme: string;
  tokenLength: number;
  tokenHasBearerPrefix: boolean;
  tokenHasWhitespace: boolean;
  /** Set when the base URL is not an api host — the buyer-page mistake. */
  warning?: string;
}

export function tlyncDiagnostics(cfg: TlyncConfig): TlyncDiagnostics {
  const expected = DEFAULT_BASE_URL[cfg.env];
  const host = safeHost(cfg.baseUrl);

  let warning: string | undefined;
  if (!/^(uat-)?api\.tlync\.ly$/.test(host)) {
    warning =
      `base URL host is "${host}", not an API host. The API is ` +
      `${expected} — a buyer/checkout host (e.g. test-buyer.tlync.ly) has no ` +
      `payment/initiate endpoint and will refuse every call.`;
  } else if (!cfg.baseUrl.endsWith('/api/v3')) {
    warning = `base URL does not end in /api/v3; expected ${expected}.`;
  }

  return {
    env:               cfg.env,
    baseUrl:           cfg.baseUrl,
    initiateUrl:       `${cfg.baseUrl}/payment/initiate`,
    receiptUrl:        `${cfg.baseUrl}/receipt/transaction`,
    baseUrlOverridden: Boolean(process.env.TLYNC_BASE_URL?.trim()),
    storeId:           cfg.storeId,
    acceptHeader:      'application/json',
    contentTypeHeader: 'application/x-www-form-urlencoded',
    authScheme:        'Bearer',
    tokenLength:          cfg.token.length,
    tokenHasBearerPrefix: /^bearer\s/i.test(cfg.token),
    tokenHasWhitespace:   /\s/.test(cfg.token),
    ...(warning ? { warning } : {}),
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(unparseable)';
  }
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

/**
 * Accept: application/json on every call, urlencoded when sending data —
 * TLYNC's documented contract. A JSON request body is NOT accepted.
 */
async function postForm(
  cfg: TlyncConfig,
  path: string,
  fields: Record<string, string>,
): Promise<{ status: number; body: unknown; text: string; url: string }> {
  const url = `${cfg.baseUrl}/${path}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept:          'application/json',
      'Content-Type':  'application/x-www-form-urlencoded',
      Authorization:   `Bearer ${cfg.token}`,
    },
    body: new URLSearchParams(fields).toString(),
    // Comfortably inside the 300s function ceiling, comfortably above a
    // healthy round trip to Tripoli.
    signal: AbortSignal.timeout(25_000),
    cache: 'no-store',
  });

  const text = await response.text();

  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // TLYNC answers 404 with JSON too, but an upstream proxy may not. Keep the
    // raw text so the caller can log what actually arrived.
  }

  return { status: response.status, body, text, url };
}

function field(body: unknown, name: string): string | null {
  if (!body || typeof body !== 'object') return null;
  const value = (body as Record<string, unknown>)[name];
  if (value === null || value === undefined) return null;
  return String(value);
}

// ── payment/initiate ──────────────────────────────────────────────────────────

export interface TlyncInitiateInput {
  /** Charged amount, in LYD. */
  amountLyd:   number;
  phone:       string;
  email:       string;
  /** Server-to-server callback. Must accept POST. */
  backendUrl:  string;
  /** Where the guest's browser lands afterwards. */
  frontendUrl: string;
  /** Our reference. Returned verbatim in every TLYNC response. */
  customRef:   string;
}

export type TlyncInitiateResult =
  | { ok: true;  url: string; customRef: string | null }
  | {
      ok: false;
      message: string;
      status: number;
      /** The endpoint we actually called, for when the base URL is the fault. */
      endpoint: string;
      /** TLYNC's response body, VERBATIM and unparsed. */
      raw: string;
      /** Exactly what we sent, so a rejected field is visible. Never the token. */
      sent: Record<string, string>;
    };

export async function initiatePayment(
  cfg: TlyncConfig,
  input: TlyncInitiateInput,
): Promise<TlyncInitiateResult> {
  const sent = {
    id:           cfg.storeId,
    // A float with exactly two decimals. Never a locale-formatted string —
    // toLocaleString would emit a comma in half the world's locales.
    amount:       input.amountLyd.toFixed(2),
    phone:        normalisePhone(input.phone),
    email:        input.email,
    backend_url:  input.backendUrl,
    frontend_url: input.frontendUrl,
    custom_ref:   input.customRef,
  };

  const { status, body, text, url: endpoint } = await postForm(
    cfg, 'payment/initiate', sent,
  );

  const url = field(body, 'url');

  if (status >= 200 && status < 300 && field(body, 'result') === 'success' && url) {
    return { ok: true, url, customRef: field(body, 'custom_ref') };
  }

  return {
    ok: false,
    status,
    endpoint,
    // Capped, but generously: a validation error listing several fields runs
    // long, and truncating it to 300 chars is how the actual reason gets lost.
    raw: text.slice(0, 2000),
    // Email and phone are masked — this string is logged and, while we debug,
    // written to a DB column. The SHAPE of the phone is what matters here
    // (TLYNC wants Libyan national format), not the number itself.
    sent: { ...sent, email: maskEmail(sent.email), phone: maskPhone(sent.phone) },
    message: field(body, 'message') ?? field(body, 'result') ?? text.slice(0, 300),
  };
}

/** "09xx***45" — enough to see the format, not enough to be the number. */
function maskPhone(phone: string): string {
  if (phone.length <= 5) return `${phone.length} chars`;
  return `${phone.slice(0, 4)}***${phone.slice(-2)}`;
}

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return 'invalid';
  return `${email[0]}***${email.slice(at)}`;
}

// ── receipt/transaction — the source of truth ─────────────────────────────────

export type TlyncReceipt =
  | {
      result: 'success';
      /** Amount TLYNC actually collected, in LYD. */
      amount: number | null;
      /** e.g. "tadawul", "mobicash". Stored VERBATIM — it routes the manual refund. */
      paymentMethod: string | null;
      customRef: string | null;
      transactionRef: string | null;
      customerPhone: string | null;
    }
  /** TLYNC knows the payment; the guest has not completed it. */
  | { result: 'incomplete' }
  /** 404 — no such transaction. A guessed or stale ref lands here. */
  | { result: 'not_found' }
  /** Network failure, 5xx, or an answer we cannot read. NOT a payment verdict. */
  | { result: 'error'; message: string; status: number };

/**
 * Confirms a payment server-side.
 *
 * Either reference works; we pass custom_ref because it is ours and is the one
 * value we can always resolve back to a booking.
 *
 * 'error' is deliberately distinct from 'not_found' and 'incomplete'. Only the
 * latter two are verdicts about the payment — 'error' means we do not know,
 * and a caller must never turn "we do not know" into "it failed".
 */
export async function fetchReceipt(
  cfg: TlyncConfig,
  ref: { customRef?: string; transactionRef?: string },
): Promise<TlyncReceipt> {
  const fields: Record<string, string> = { store_id: cfg.storeId };
  if (ref.transactionRef) fields.transaction_ref = ref.transactionRef;
  if (ref.customRef)      fields.custom_ref      = ref.customRef;

  let status: number;
  let body: unknown;
  let text: string;

  try {
    ({ status, body, text } = await postForm(cfg, 'receipt/transaction', fields));
  } catch (err) {
    return {
      result: 'error',
      status: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (status === 404) return { result: 'not_found' };

  const result = field(body, 'result');

  if (status >= 200 && status < 300 && result === 'success') {
    const amount = Number(field(body, 'amount'));
    return {
      result: 'success',
      amount: Number.isFinite(amount) ? amount : null,
      paymentMethod:  field(body, 'payment_method'),
      customRef:      field(body, 'custom_ref'),
      transactionRef: field(body, 'transaction_ref') ?? field(body, 'transaction_id'),
      customerPhone:  field(body, 'customer_phone'),
    };
  }

  if (result === 'incomplete') return { result: 'incomplete' };

  return {
    result: 'error',
    status,
    message: field(body, 'message') ?? text.slice(0, 300),
  };
}

// ── custom_ref ────────────────────────────────────────────────────────────────

/**
 * The reference TLYNC echoes back, and the only identity the callback carries.
 *
 * Stored in booking_payments.merchant_order_id — NOT a free choice: the DB's
 * refund_on_owner_reject trigger reads exactly that column into
 * manual_refunds.tlync_custom_ref, which is how staff find the payment they
 * have to give back by hand.
 *
 * Built from the merchant_order_id start_payment_attempt already generated
 * (booking reference + 4 random bytes) plus 4 more random bytes, giving 64 bits
 * of entropy. The suffix matters because the callback endpoint is public: the
 * receipt check makes a guessed ref useless, but an unguessable ref means it
 * never gets that far.
 */
export function buildCustomRef(merchantOrderId: string): string {
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `${merchantOrderId}-${suffix}`;
}

/**
 * Libyan numbers reach TLYNC in national form.
 *
 * Guest phones are stored E.164 (+218…). A Libyan number is converted to its
 * national 0-prefixed form; anything else is passed through with the '+'
 * stripped, since a non-Libyan guest paying through a Libyan method is
 * unusual but not something to reject outright.
 */
export function normalisePhone(e164: string): string {
  const digits = e164.replace(/[^\d+]/g, '');
  if (digits.startsWith('+218')) return `0${digits.slice(4)}`;
  if (digits.startsWith('218'))  return `0${digits.slice(3)}`;
  return digits.replace(/^\+/, '');
}

// ── The LYD figures, recorded on the attempt row ──────────────────────────────
//
// booking_payments has no amount_lyd column: amount_try / fx_rate_used /
// amount_usd describe the booking's canonical TRY-denominated figure, and the
// DB's refund trigger reads amount_try into manual_refunds.amount_try. The LYD
// amount actually collected therefore has nowhere structural to live, so it is
// recorded in response_message in a form that is both human-readable in a
// dashboard cell and parseable back here.
//
// ⚠️ If the DB team adds booking_payments.amount_lyd / fx_rate_lyd, move these
// two functions' contents to real columns and delete them. This is a stopgap,
// and it is written down as one.

export interface TlyncAmountNote {
  lyd:    number;
  rate:   number;
  method?: string | null;
  tx?:     string | null;
}

export function encodeAmountNote(note: TlyncAmountNote): string {
  const parts = [
    'tlync',
    `lyd=${note.lyd.toFixed(2)}`,
    `rate=${note.rate.toFixed(6)}`,
  ];
  if (note.method) parts.push(`method=${note.method}`);
  if (note.tx)     parts.push(`tx=${note.tx}`);
  return parts.join('|');
}

export function parseAmountNote(text: string | null): TlyncAmountNote | null {
  if (!text || !text.startsWith('tlync|')) return null;

  const map = new Map<string, string>();
  for (const part of text.split('|').slice(1)) {
    const eq = part.indexOf('=');
    if (eq > 0) map.set(part.slice(0, eq), part.slice(eq + 1));
  }

  const lyd  = Number(map.get('lyd'));
  const rate = Number(map.get('rate'));
  if (!Number.isFinite(lyd) || !Number.isFinite(rate)) return null;

  return { lyd, rate, method: map.get('method') ?? null, tx: map.get('tx') ?? null };
}
