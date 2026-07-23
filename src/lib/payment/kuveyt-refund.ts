/**
 * Kuveyt Türk refunds — SaleReversal / DrawBack / PartialDrawback. SERVER ONLY.
 *
 * A COMPLETELY DIFFERENT PROTOCOL from payment. Payment is plain XML
 * (KuveytTurkVPosMessage) to sanalposservice/Home/…; refund is SOAP 1.1 to
 * BOA.Integration.WCFService/…/VirtualPosService.svc. Shared with payment:
 * only the hash primitive and the minor-unit conversion.
 *
 * The hash is IDENTICAL to payment Request 2:
 *   base64(sha1( MerchantId + MerchantOrderId + Amount + UserName + HashedPassword ))
 *
 * Amount / DisplayAmount / CancelAmount are all the same minor-unit figure
 * (×100, no punctuation) and MUST match the original sale's currency (0949),
 * or the bank rejects. CurrencyCode is the 4-digit 0949, never 949.
 *
 * NOTHING here calls the bank on its own. postRefundSoap is invoked only from
 * the refund route, which is gated until SOAPAction and proxy routing to the
 * BOA host are confirmed.
 */
import { sha1Base64, hashedPassword, type KuveytConfig } from './kuveyt-turk';

export type RefundOperation = 'SaleReversal' | 'DrawBack' | 'PartialDrawback';

/**
 * Explicit config, never read from env in this module — so a test run can pass
 * boatest credentials + host and the production route can pass prod env, with
 * no risk of one leaking into the other.
 */
export interface RefundConfig {
  merchantId: string;
  customerId: string;
  userName:   string;
  password:   string;
  /** Full URL of the VirtualPosService.svc endpoint THROUGH the proxy. */
  serviceUrl: string;
  /**
   * SOAPAction header. Configurable, never hardcoded: production WCF metadata
   * is disabled so the exact value can't be read from the WSDL, and some WCF
   * bindings accept an empty string. Try values against boatest without a
   * redeploy by passing this in.
   */
  soapAction: string;
}

/** The bank's default WCF path + SOAPAction shape. Both overridable per the
 *  finding that production metadata is disabled and the action may need tuning
 *  on boatest without a redeploy. */
export const DEFAULT_REFUND_SERVICE_PATH =
  '/BOA.Integration.WCFService/BOA.Integration.VirtualPos/VirtualPosService.svc';
export const DEFAULT_REFUND_SOAP_ACTION_BASE =
  'http://boa.net/BOA.Integration.VirtualPos/Service/IVirtualPosService';

/**
 * Build a RefundConfig for one operation from primitive parts. serviceUrl goes
 * THROUGH the proxy (its IP is whitelisted, ours is not); soapAction is
 * base + '/' + operation, both overridable.
 */
export function toRefundConfig(
  operation: RefundOperation,
  parts: {
    merchantId: string;
    customerId: string;
    userName: string;
    password: string;
    proxyBase: string;
    servicePath?: string;
    soapActionBase?: string;
  },
): RefundConfig {
  const base = (parts.proxyBase || '').replace(/\/+$/, '');
  const path = parts.servicePath || DEFAULT_REFUND_SERVICE_PATH;
  const actionBase = (parts.soapActionBase || DEFAULT_REFUND_SOAP_ACTION_BASE).replace(/\/+$/, '');
  return {
    merchantId: parts.merchantId,
    customerId: parts.customerId,
    userName:   parts.userName,
    password:   parts.password,
    serviceUrl: `${base}${path}`,
    soapAction: `${actionBase}/${operation}`,
  };
}

/** The hashedPassword helper wants a KuveytConfig shape; adapt just those fields. */
function asKuveytConfig(cfg: RefundConfig): KuveytConfig {
  return {
    merchantId: cfg.merchantId,
    customerId: cfg.customerId,
    userName:   cfg.userName,
    password:   cfg.password,
    proxyBase:  '', // unused by hashedPassword
  };
}

/**
 * base64(sha1( MerchantId + MerchantOrderId + Amount + UserName + HashedPassword )).
 * Identical to payment Request 2 — same field order, same primitive.
 */
export function refundHash(
  cfg: RefundConfig,
  merchantOrderId: string,
  amountMinor: string,
): string {
  return sha1Base64(
    cfg.merchantId + merchantOrderId + amountMinor + cfg.userName +
      hashedPassword(asKuveytConfig(cfg)),
  );
}

const NS =
  'xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
  'xmlns:ser="http://boa.net/BOA.Integration.VirtualPos/Service"';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface RefundRequest {
  cfg:             RefundConfig;
  operation:       RefundOperation;
  /** From the ORIGINAL paid sale (booking_payments). */
  rrn:             string;
  stan:            string;
  provisionNumber: string;
  orderId:         string;   // the bank OrderId of the original sale
  merchantOrderId: string;
  /** Minor units (×100). Full sale for SaleReversal/DrawBack; partial figure
   *  for PartialDrawback. Used for Amount, CancelAmount AND DisplayAmount. */
  amountMinor:     string;
}

/**
 * The full SOAP envelope. Element names, nesting and order are verbatim from
 * the bank doc — including the bank's own misspelling `QeryId` (keep it).
 *
 * RRN / Stan / MerchantId / Amount / ProvisionNumber / OrderId appear at the
 * request top level AND MerchantId / CustomerId / Amount repeat inside
 * VPosMessage — both are required.
 */
export function buildRefundSoap(req: RefundRequest): string {
  const { cfg, operation, rrn, stan, provisionNumber, orderId, merchantOrderId, amountMinor } = req;
  const hash = refundHash(cfg, merchantOrderId, amountMinor);

  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope ${NS}>
  <soapenv:Header/>
  <soapenv:Body>
    <ser:${operation}>
      <ser:request>
        <ser:IsFromExternalNetwork>true</ser:IsFromExternalNetwork>
        <ser:BusinessKey>0</ser:BusinessKey>
        <ser:ResourceId>0</ser:ResourceId>
        <ser:ActionId>0</ser:ActionId>
        <ser:LanguageId>0</ser:LanguageId>
        <ser:CustomerId>${esc(cfg.customerId)}</ser:CustomerId>
        <ser:MailOrTelephoneOrder>true</ser:MailOrTelephoneOrder>
        <ser:RRN>${esc(rrn)}</ser:RRN>
        <ser:Stan>${esc(stan)}</ser:Stan>
        <ser:MerchantId>${esc(cfg.merchantId)}</ser:MerchantId>
        <ser:Amount>${esc(amountMinor)}</ser:Amount>
        <ser:ProvisionNumber>${esc(provisionNumber)}</ser:ProvisionNumber>
        <ser:OrderId>${esc(orderId)}</ser:OrderId>
        <ser:VPosMessage>
          <ser:APIVersion>TDV2.0.0</ser:APIVersion>
          <ser:InstallmentMaturityCommisionFlag>0</ser:InstallmentMaturityCommisionFlag>
          <ser:HashData>${esc(hash)}</ser:HashData>
          <ser:MerchantId>${esc(cfg.merchantId)}</ser:MerchantId>
          <ser:SubMerchantId>0</ser:SubMerchantId>
          <ser:CustomerId>${esc(cfg.customerId)}</ser:CustomerId>
          <ser:UserName>${esc(cfg.userName)}</ser:UserName>
          <ser:CardType>VISA</ser:CardType>
          <ser:BatchID>0</ser:BatchID>
          <ser:TransactionType>${operation}</ser:TransactionType>
          <ser:InstallmentCount>0</ser:InstallmentCount>
          <ser:Amount>${esc(amountMinor)}</ser:Amount>
          <ser:CancelAmount>${esc(amountMinor)}</ser:CancelAmount>
          <ser:DisplayAmount>${esc(amountMinor)}</ser:DisplayAmount>
          <ser:MerchantOrderId>${esc(merchantOrderId)}</ser:MerchantOrderId>
          <ser:FECAmount>0</ser:FECAmount>
          <ser:CurrencyCode>0949</ser:CurrencyCode>
          <ser:QeryId>0</ser:QeryId>
          <ser:DebtId>0</ser:DebtId>
          <ser:SurchargeAmount>0</ser:SurchargeAmount>
          <ser:SGKDebtAmount>0</ser:SGKDebtAmount>
          <ser:TransactionSecurity>1</ser:TransactionSecurity>
        </ser:VPosMessage>
      </ser:request>
    </ser:${operation}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Same-Istanbul-day → SaleReversal (pre-settlement), otherwise DrawBack (full)
 * or PartialDrawback. The calendar-day check is a heuristic that does NOT know
 * the bank's exact settlement cutoff — so the route must fall back to DrawBack
 * if a SaleReversal is rejected as already-settled.
 */
export function decideRefundType(
  paidAt: Date,
  now: Date,
  partial: boolean,
): RefundOperation {
  if (partial) return 'PartialDrawback';
  const istanbulDay = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  return istanbulDay(paidAt) === istanbulDay(now) ? 'SaleReversal' : 'DrawBack';
}

// ── Transport ─────────────────────────────────────────────────────────────────

export async function postRefundSoap(cfg: RefundConfig, soap: string): Promise<string> {
  const response = await fetch(cfg.serviceUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8', // SOAP 1.1
      'SOAPAction': cfg.soapAction,               // configurable; may be ''
    },
    body: soap,
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });

  const body = await response.text();

  // A SOAP fault comes back as 500 with a <soap:Fault> body — surface it, the
  // route decides pending vs failed from the parsed content, never from the
  // status alone.
  if (!response.ok) {
    throw new Error(
      `[kuveyt-refund] ${cfg.serviceUrl} returned ${response.status}: ${body.slice(0, 800)}`,
    );
  }
  return body;
}

// ── Response parsing ──────────────────────────────────────────────────────────

/**
 * Namespace-agnostic tag read — WCF DataContract responses prefix result tags
 * (a:, b:, …) and the exact prefix isn't known until the first real response.
 * A nil/self-closing element yields null, which is the correct "no value".
 */
function soapTag(xml: string, name: string): string | null {
  const m = xml.match(
    new RegExp(`<(?:[\\w.]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.]+:)?${name}>`, 'i'),
  );
  return m ? m[1].trim() : null;
}

export interface RefundResult {
  success:         boolean;
  responseCode:    string | null;
  responseMessage: string | null;
  /** NEW references the refund returns — distinct from the original sale's. */
  rrn:             string | null;
  stan:            string | null;
  provisionNumber: string | null;
  orderId:         string | null;
  transactionTime: string | null;
  businessKey:     string | null;
  raw:             string;
}

export function parseRefundResponse(xml: string): RefundResult {
  // Refs live inside {Op}Result > Value; Success is a sibling of Value. Scope
  // ref extraction to the Value block so a request echo can't be mistaken for
  // the new refund references.
  const value = soapTag(xml, 'Value') ?? xml;
  return {
    success:         (soapTag(xml, 'Success') ?? '').toLowerCase() === 'true',
    responseCode:    soapTag(value, 'ResponseCode'),
    responseMessage: soapTag(value, 'ResponseMessage'),
    rrn:             soapTag(value, 'RRN'),
    stan:            soapTag(value, 'Stan'),
    provisionNumber: soapTag(value, 'ProvisionNumber'),
    orderId:         soapTag(value, 'OrderId'),
    transactionTime: soapTag(value, 'TransactionTime'),
    businessKey:     soapTag(value, 'BusinessKey'),
    raw:             xml,
  };
}

/** '00' with Success=true is the bank's refund-approved signal. */
export function isRefundApproved(r: RefundResult): boolean {
  return r.success && r.responseCode === '00';
}

/**
 * A SaleReversal rejected because the batch already settled — the signal to
 * retry as DrawBack. The exact code is confirmed on boatest before relying on
 * it; until then the message match is the safety net.
 */
export function isAlreadySettled(r: RefundResult): boolean {
  const msg = (r.responseMessage ?? '').toLocaleUpperCase('tr');
  return /GÜN\s*SONU|SETTLED|KAPAN|MUTABAKAT|BATCH/.test(msg);
}
