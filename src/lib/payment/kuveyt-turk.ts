/**
 * Kuveyt Türk Sanal POS — 3D Secure (TDV2.0.0). SERVER ONLY.
 *
 * Two requests:
 *   Request 1  ThreeDModelPayGate       card + order → bank returns the 3DS HTML
 *   Request 2  ThreeDModelProvisionGate MD from the callback → money actually moves
 *
 * EVERY CONSTANT HERE WAS PAID FOR IN DEBUGGING TIME. Read the comments
 * before changing anything.
 */
import { createHash } from 'node:crypto';

if (typeof window !== 'undefined') {
  throw new Error(
    '[kuveyt-turk] imported in the browser. This module derives HashData ' +
      'from the API password and must never reach a client bundle.'
  );
}

// ── Constants fixed by the bank's spec ────────────────────────────────────────

const API_VERSION         = 'TDV2.0.0';
const CURRENCY_CODE       = '0949';   // TRY. Request 1 ONLY — never Request 2.
const TRANSACTION_TYPE    = 'Sale';
const INSTALLMENT_COUNT   = '0';
const TRANSACTION_SECURITY = '3';     // 3D Secure
const DEVICE_CHANNEL      = '02';     // browser
const BILL_ADDR_COUNTRY   = '792';    // Türkiye, ISO-3166 numeric

export interface KuveytConfig {
  merchantId: string;
  customerId: string;
  userName:   string;
  password:   string;
  proxyBase:  string;
}

/**
 * MerchantId is the Mağaza No; CustomerId is the Müşteri No. THEY ARE NOT THE
 * SAME NUMBER. Setting both to the Mağaza No fails at provision with
 * InvalidMetaData — and the bank's own callback echoes the correct CustomerId,
 * which is how that was eventually found.
 */
export function kuveytConfig(): KuveytConfig {
  const cfg = {
    merchantId: process.env.KUVEYT_MERCHANT_ID    ?? '',
    customerId: process.env.KUVEYT_CUSTOMER_ID    ?? '',
    userName:   process.env.KUVEYT_API_USERNAME   ?? '',
    password:   process.env.KUVEYT_API_PASSWORD   ?? '',
    proxyBase:  process.env.KUVEYT_PROXY_BASE_URL ?? '',
  };

  const missing = Object.entries(cfg)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(`[kuveyt-turk] missing env: ${missing.join(', ')}`);
  }

  if (cfg.merchantId === cfg.customerId) {
    // Cheap guard against the single most expensive misconfiguration.
    throw new Error(
      '[kuveyt-turk] MerchantId equals CustomerId. The Mağaza No and the ' +
        'Müşteri No are different numbers; this fails at provision with ' +
        'InvalidMetaData.'
    );
  }

  return cfg;
}

/** Both bank calls go through the proxy: its IP is whitelisted, Vercel's is not. */
export function payGateUrl(cfg: KuveytConfig): string {
  return `${cfg.proxyBase}/sanalposservice/Home/ThreeDModelPayGate`;
}
export function provisionGateUrl(cfg: KuveytConfig): string {
  return `${cfg.proxyBase}/sanalposservice/Home/ThreeDModelProvisionGate`;
}

// ── Hashing ───────────────────────────────────────────────────────────────────

/**
 * base64 of the RAW sha1 digest — NEVER base64 of the hex string.
 * `.digest('base64')` gives the raw digest encoded once; hashing to hex first
 * and base64-ing that produces a 56-char string the bank rejects as
 * HashDataError, which looks identical to a wrong password.
 *
 * latin1 input encoding is deliberate: the bank hashes bytes, and a Turkish
 * character in CardHolderName must not become multi-byte UTF-8 mid-hash.
 */
function sha1Base64(input: string): string {
  return createHash('sha1').update(input, 'latin1').digest('base64');
}

export function hashedPassword(cfg: KuveytConfig): string {
  return sha1Base64(cfg.password);
}

/** Request 1 covers OkUrl and FailUrl. Request 2 does not. */
export function hashRequest1(
  cfg: KuveytConfig,
  merchantOrderId: string,
  amountMinor: string,
  okUrl: string,
  failUrl: string,
): string {
  return sha1Base64(
    cfg.merchantId + merchantOrderId + amountMinor + okUrl + failUrl +
      cfg.userName + hashedPassword(cfg)
  );
}

export function hashRequest2(
  cfg: KuveytConfig,
  merchantOrderId: string,
  amountMinor: string,
): string {
  return sha1Base64(
    cfg.merchantId + merchantOrderId + amountMinor + cfg.userName +
      hashedPassword(cfg)
  );
}

// ── XML ───────────────────────────────────────────────────────────────────────

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const XMLNS =
  'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
  'xmlns:xsd="http://www.w3.org/2001/XMLSchema"';

export interface CardDetails {
  number:      string;   // digits only
  expireYear:  string;   // 2 digits
  expireMonth: string;   // 2 digits
  cvv:         string;
  holderName:  string;   // 2–45 chars
}

export interface CardHolderData {
  billAddrCity:     string;
  billAddrLine1:    string;
  billAddrPostCode: string;
  billAddrState:    string;
  email:            string;
  phoneCc:          string;  // country calling code, no '+'
  phoneSubscriber:  string;  // national number
}

/**
 * Request 1 — ThreeDModelPayGate.
 *
 * NO <Password> ELEMENT. The password only ever derives HashData; sending it
 * as a field is both wrong and a needless disclosure.
 *
 * okUrl and failUrl must be BYTE-IDENTICAL to the strings passed to
 * hashRequest1 — one variable feeds both, never re-derived. No query string
 * and no raw '&': either changes the bytes and the hash stops matching.
 */
export function buildPayGateXml(params: {
  cfg:             KuveytConfig;
  merchantOrderId: string;
  amountMinor:     string;
  okUrl:           string;
  failUrl:         string;
  card:            CardDetails;
  holder:          CardHolderData;
  clientIp:        string;
}): string {
  const { cfg, merchantOrderId, amountMinor, okUrl, failUrl, card, holder, clientIp } = params;
  const hash = hashRequest1(cfg, merchantOrderId, amountMinor, okUrl, failUrl);

  // DisplayAmount MUST equal Amount. The guest is shown one figure and the
  // bank must charge that same figure — and a refund replays it exactly.
  return `<?xml version="1.0" encoding="utf-8"?>
<KuveytTurkVPosMessage ${XMLNS}>
  <APIVersion>${API_VERSION}</APIVersion>
  <OkUrl>${esc(okUrl)}</OkUrl>
  <FailUrl>${esc(failUrl)}</FailUrl>
  <HashData>${esc(hash)}</HashData>
  <MerchantId>${esc(cfg.merchantId)}</MerchantId>
  <CustomerId>${esc(cfg.customerId)}</CustomerId>
  <UserName>${esc(cfg.userName)}</UserName>
  <CardNumber>${esc(card.number)}</CardNumber>
  <CardExpireDateYear>${esc(card.expireYear)}</CardExpireDateYear>
  <CardExpireDateMonth>${esc(card.expireMonth)}</CardExpireDateMonth>
  <CardCVV2>${esc(card.cvv)}</CardCVV2>
  <CardHolderName>${esc(card.holderName)}</CardHolderName>
  <TransactionType>${TRANSACTION_TYPE}</TransactionType>
  <InstallmentCount>${INSTALLMENT_COUNT}</InstallmentCount>
  <Amount>${esc(amountMinor)}</Amount>
  <DisplayAmount>${esc(amountMinor)}</DisplayAmount>
  <CurrencyCode>${CURRENCY_CODE}</CurrencyCode>
  <MerchantOrderId>${esc(merchantOrderId)}</MerchantOrderId>
  <TransactionSecurity>${TRANSACTION_SECURITY}</TransactionSecurity>
  <DeviceData>
    <DeviceChannel>${DEVICE_CHANNEL}</DeviceChannel>
    <ClientIP>${esc(clientIp)}</ClientIP>
  </DeviceData>
  <CardHolderData>
    <BillAddrCity>${esc(holder.billAddrCity)}</BillAddrCity>
    <BillAddrCountry>${BILL_ADDR_COUNTRY}</BillAddrCountry>
    <BillAddrLine1>${esc(holder.billAddrLine1)}</BillAddrLine1>
    <BillAddrPostCode>${esc(holder.billAddrPostCode)}</BillAddrPostCode>
    <BillAddrState>${esc(holder.billAddrState)}</BillAddrState>
    <Email>${esc(holder.email)}</Email>
    <MobilePhone>
      <Cc>${esc(holder.phoneCc)}</Cc>
      <Subscriber>${esc(holder.phoneSubscriber)}</Subscriber>
    </MobilePhone>
  </CardHolderData>
</KuveytTurkVPosMessage>`;
}

/**
 * Request 2 — ThreeDModelProvisionGate.
 *
 * Exactly these fields and no others. NO CurrencyCode: it is not in the bank's
 * spec for this request and its presence is rejected. Amount must equal
 * Request 1's Amount exactly.
 */
export function buildProvisionXml(params: {
  cfg:             KuveytConfig;
  merchantOrderId: string;
  amountMinor:     string;
  md:              string;
}): string {
  const { cfg, merchantOrderId, amountMinor, md } = params;
  const hash = hashRequest2(cfg, merchantOrderId, amountMinor);

  return `<?xml version="1.0" encoding="utf-8"?>
<KuveytTurkVPosMessage ${XMLNS}>
  <APIVersion>${API_VERSION}</APIVersion>
  <HashData>${esc(hash)}</HashData>
  <MerchantId>${esc(cfg.merchantId)}</MerchantId>
  <CustomerId>${esc(cfg.customerId)}</CustomerId>
  <UserName>${esc(cfg.userName)}</UserName>
  <TransactionType>${TRANSACTION_TYPE}</TransactionType>
  <InstallmentCount>${INSTALLMENT_COUNT}</InstallmentCount>
  <Amount>${esc(amountMinor)}</Amount>
  <MerchantOrderId>${esc(merchantOrderId)}</MerchantOrderId>
  <TransactionSecurity>${TRANSACTION_SECURITY}</TransactionSecurity>
  <KuveytTurkVPosAdditionalData>
    <AdditionalData>
      <Key>MD</Key>
      <Data>${esc(md)}</Data>
    </AdditionalData>
  </KuveytTurkVPosAdditionalData>
</KuveytTurkVPosMessage>`;
}

/**
 * Decimal string → integer minor units, WITHOUT floating point.
 *
 * Request 2's Amount must equal Request 1's exactly. Request 1's came from
 * start_payment_attempt, where Postgres computed round(amount_try * 100) in
 * `numeric`. Recomputing that in JS as Math.round(Number(x) * 100) does NOT
 * always agree: binary floating point misrepresents decimal halves, so
 * 1.005 * 100 is 100.49999999999999 and rounds DOWN to 100 where Postgres
 * gives 101. A sweep of ~111k realistic amounts found ~4,600 such cases.
 *
 * A one-unit disagreement between the two requests is a mismatch on the
 * transaction the bank has already 3DS-authorised — so this works on the
 * decimal digits directly and never converts to a double.
 *
 * PostgREST hands `numeric` back as a string precisely so this precision is
 * available; Number() is what throws it away.
 */
export function toMinorUnits(value: string | number): string {
  const text = String(value).trim();

  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new Error(`[kuveyt-turk] cannot convert "${text}" to minor units`);
  }

  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');

  // Two kept digits, then round half-up on the third — matching Postgres
  // round(), which rounds halves away from zero.
  //
  // Plain integer arithmetic, not BigInt: the hazard being avoided is
  // FRACTIONAL float representation (1.005 * 100 = 100.49999…), and every
  // term here is already a whole number. Integers below 2^53 are exact in a
  // double, and a TRY amount is nowhere near that — the guard below makes
  // that assumption fail loudly rather than silently if it ever stops holding.
  const kept = Number((fraction + '00').slice(0, 2));
  const next = Number((fraction + '000')[2] ?? '0');
  const minor = Number(whole) * 100 + kept + (next >= 5 ? 1 : 0);

  if (!Number.isSafeInteger(minor)) {
    throw new Error(
      `[kuveyt-turk] "${text}" exceeds exact integer range in minor units`
    );
  }

  return `${negative ? '-' : ''}${minor}`;
}

/**
 * Split an E.164 number into MobilePhone's Cc + Subscriber.
 *
 * A small explicit table rather than libphonenumber: that library is only a
 * transitive dependency here, and pulling a 150KB metadata blob into a
 * payment route to split a string is a poor trade. Longest-prefix match over
 * the codes this market actually sees; anything unrecognised falls back to a
 * two-digit code, which is the most common width.
 */
const CALLING_CODES = [
  '971', '966', '974', '973', '968', '965', '964', '963', '962', '961',
  '218', '216', '213', '212',
  '90', '44', '49', '33', '39', '34', '31', '32', '41', '43', '46', '47',
  '45', '48', '20', '27', '81', '82', '86', '91', '98', '992', '993', '994',
  '995', '996', '998', '7', '1',
];

export function splitE164(phone: string): { cc: string; subscriber: string } {
  const digits = phone.replace(/[^\d]/g, '');
  const match = CALLING_CODES
    .filter((code) => digits.startsWith(code))
    .sort((a, b) => b.length - a.length)[0];

  if (match) return { cc: match, subscriber: digits.slice(match.length) };
  return { cc: digits.slice(0, 2), subscriber: digits.slice(2) };
}

// ── Transport ─────────────────────────────────────────────────────────────────

/**
 * The proxy is a transparent relay and needs no auth header of its own — its
 * only job is that its IP (185.170.196.106) is whitelisted at the bank.
 * Vercel's egress IPs are not, so a direct call TIMES OUT rather than
 * returning a clean error, which is a slow and confusing way to fail.
 */
export async function postToBank(url: string, xml: string): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: xml,
    // Well under the 300s function ceiling, well over a healthy bank round trip.
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `[kuveyt-turk] ${url} returned ${response.status}: ${body.slice(0, 500)}`
    );
  }

  return body;
}

// ── Response parsing ──────────────────────────────────────────────────────────

/**
 * Deliberately regex rather than an XML parser: the provision response is a
 * flat, known set of elements, and adding a parser dependency to read six
 * fields is not a trade worth making.
 */
function tag(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? match[1].trim() : null;
}

/**
 * The 3D Secure result the ACS posts back to OkUrl/FailUrl.
 *
 * KT's 3D Model does NOT post MerchantOrderId / MD / ResponseCode as
 * top-level form fields. They arrive inside a single URL-encoded form field
 * `AuthenticationResponse`, whose (once-)decoded value is this XML. Reading
 * the top-level form for MerchantOrderId finds nothing — the bug that made a
 * fully-authenticated payment land on reason=unknown.
 *
 * ResponseCode here is the 3DS authentication result ('00' = authenticated),
 * NOT the financial result — that comes later from ProvisionGate.
 */
export interface AuthenticationResult {
  merchantOrderId: string | null;
  md:              string | null;
  responseCode:    string | null;
  responseMessage: string | null;
  raw:             string;
}

/**
 * KT DOUBLE-URL-ENCODES the AuthenticationResponse field. After the transport
 * layer's own decode (formData / URLSearchParams) the value is STILL
 * form-encoded — '%3cMerchantOrderId%3e', not '<MerchantOrderId>', with '+'
 * for spaces — so a regex over it finds no tags and every field reads null.
 * That is what made a fully-authenticated payment land on reason=unknown.
 *
 * Decode further form-url-encoded layers until real XML (a literal '<')
 * appears. Idempotent: a single-encoded value already containing '<' passes
 * straight through, so this is safe whichever way a given ACS encodes.
 *
 * '+' → space is applied per layer (via %20) because form-encoding uses '+'
 * for space; a legitimately-'+'-bearing base64 (MD, HashData) is carried as
 * %2B at each layer, so it survives untouched.
 */
function decodeToXml(value: string): string {
  let v = value;
  for (let i = 0; i < 3 && !v.includes('<') && /%[0-9a-fA-F]{2}/.test(v); i++) {
    try {
      v = decodeURIComponent(v.replace(/\+/g, '%20'));
    } catch {
      break; // malformed escape — stop rather than throw into the callback
    }
  }
  return v;
}

export function parseAuthenticationResponse(value: string): AuthenticationResult {
  const xml = decodeToXml(value);
  return {
    merchantOrderId: tag(xml, 'MerchantOrderId'),
    md:              tag(xml, 'MD'),
    responseCode:    tag(xml, 'ResponseCode'),
    responseMessage: tag(xml, 'ResponseMessage'),
    raw:             xml,
  };
}

/** '00' is the bank's 3DS-authenticated code. */
export function isAuthenticated(result: AuthenticationResult): boolean {
  return result.responseCode === '00';
}

export interface ProvisionResult {
  responseCode:    string | null;
  responseMessage: string | null;
  orderId:         string | null;   // the BANK's order id, not ours
  provisionNumber: string | null;
  rrn:             string | null;
  stan:            string | null;
  raw:             string;
}

export function parseProvisionResponse(xml: string): ProvisionResult {
  return {
    responseCode:    tag(xml, 'ResponseCode'),
    responseMessage: tag(xml, 'ResponseMessage'),
    orderId:         tag(xml, 'OrderId'),
    provisionNumber: tag(xml, 'ProvisionNumber'),
    rrn:             tag(xml, 'RRN'),
    stan:            tag(xml, 'Stan'),
    raw:             xml,
  };
}

/** '00' is the bank's success code. Everything else is a decline. */
export function isApproved(result: ProvisionResult): boolean {
  return result.responseCode === '00';
}

/**
 * All four references are required to refund. A payment that cannot be
 * refunded must never be recorded as paid — complete_payment enforces the
 * same rule, and this is the caller-side half of it.
 */
export function hasRefundReferences(result: ProvisionResult): boolean {
  return Boolean(
    result.orderId?.trim() &&
    result.provisionNumber?.trim() &&
    result.rrn?.trim() &&
    result.stan?.trim()
  );
}
