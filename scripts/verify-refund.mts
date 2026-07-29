/**
 * Unit verification for kuveyt-refund.ts — runs WITHOUT the bank.
 * Run:  npx tsx scripts/verify-refund.mts
 *
 * Checks the SOAP envelope, hash, response parser and refund-type decision
 * against the bank doc's stated structure and sample values.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  buildRefundSoap, refundHash, decideRefundType,
  parseRefundResponse, isRefundApproved, isAlreadySettled,
  toRefundConfig, DEFAULT_REFUND_SERVICE_PATH,
  type RefundConfig,
} from '../src/lib/payment/kuveyt-refund.ts';

let passed = 0;
const ok = (name: string, fn: () => void) => {
  fn(); passed++; console.log('  ✓', name);
};

// Test-env credentials from the bank doc.
const cfg: RefundConfig = {
  merchantId: '57902',
  customerId: '97228291',
  userName:   'TEPKVT2021',
  password:   'api123',
  serviceUrl: 'https://example/VirtualPosService.svc',
  soapAction: 'http://boa.net/BOA.Integration.VirtualPos/Service/IVirtualPosService/SaleReversal',
};

const REQ = {
  cfg, operation: 'SaleReversal' as const,
  rrn: '017017791325', stan: '791325', provisionNumber: '241983',
  orderId: '348252937', merchantOrderId: 'HP-0826-0005-c1f817d3',
  amountMinor: '10265',   // 102.65 TL
};

console.log('kuveyt-refund verification\n');

// ── Hash: matches the doc formula exactly ────────────────────────────────────
ok('refundHash = base64(sha1(MerchantId+MerchantOrderId+Amount+UserName+HashedPassword))', () => {
  const hp = createHash('sha1').update('api123', 'latin1').digest('base64');
  const expect = createHash('sha1')
    .update('57902' + 'HP-0826-0005-c1f817d3' + '10265' + 'TEPKVT2021' + hp, 'latin1')
    .digest('base64');
  assert.equal(refundHash(cfg, 'HP-0826-0005-c1f817d3', '10265'), expect);
  assert.equal(expect.length, 28, 'raw-sha1 base64 is 28 chars');
});

// ── SOAP envelope: structure, order, required repeats ────────────────────────
const soap = buildRefundSoap(REQ);
ok('envelope has soapenv + ser namespaces and the operation wrapper', () => {
  assert.match(soap, /xmlns:soapenv="http:\/\/schemas.xmlsoap.org\/soap\/envelope\/"/);
  assert.match(soap, /xmlns:ser="http:\/\/boa.net\/BOA.Integration.VirtualPos\/Service"/);
  assert.match(soap, /<ser:SaleReversal>[\s\S]*<ser:request>/);
});
ok('request top-level carries RRN/Stan/MerchantId/Amount/ProvisionNumber/OrderId', () => {
  assert.match(soap, /<ser:RRN>017017791325<\/ser:RRN>/);
  assert.match(soap, /<ser:Stan>791325<\/ser:Stan>/);
  assert.match(soap, /<ser:ProvisionNumber>241983<\/ser:ProvisionNumber>/);
  assert.match(soap, /<ser:OrderId>348252937<\/ser:OrderId>/);
});
ok('VPosMessage repeats MerchantId/CustomerId/Amount and carries the hash', () => {
  // MerchantId appears twice (top-level + VPosMessage)
  assert.equal((soap.match(/<ser:MerchantId>57902<\/ser:MerchantId>/g) ?? []).length, 2);
  assert.equal((soap.match(/<ser:CustomerId>97228291<\/ser:CustomerId>/g) ?? []).length, 2);
  assert.match(soap, /<ser:HashData>.{28}<\/ser:HashData>/);
});
ok('SaleReversal: Amount == CancelAmount == DisplayAmount (all minor units)', () => {
  assert.match(soap, /<ser:Amount>10265<\/ser:Amount>/);
  assert.match(soap, /<ser:CancelAmount>10265<\/ser:CancelAmount>/);
  assert.match(soap, /<ser:DisplayAmount>10265<\/ser:DisplayAmount>/);
});
ok('DrawBack/PartialDrawback: DisplayAmount is 0 (per mews/pos), Amount/CancelAmount stay full', () => {
  for (const operation of ['DrawBack', 'PartialDrawback'] as const) {
    const s = buildRefundSoap({ ...REQ, operation });
    assert.match(s, /<ser:Amount>10265<\/ser:Amount>/);
    assert.match(s, /<ser:CancelAmount>10265<\/ser:CancelAmount>/);
    assert.match(s, /<ser:DisplayAmount>0<\/ser:DisplayAmount>/);
  }
});
ok('endpoint path targets the basicHttpBinding SOAP endpoint (.svc/Basic, not bare .svc)', () => {
  assert.ok(
    DEFAULT_REFUND_SERVICE_PATH.endsWith('/VirtualPosService.svc/Basic'),
    'the bare .svc 404s on POST; the SOAP endpoint is .svc/Basic',
  );
  const built = toRefundConfig('DrawBack', {
    merchantId: '57902', customerId: '97228291', userName: 'TEPKVT2021',
    password: 'api123', proxyBase: 'https://proxy.example/',
  });
  assert.equal(
    built.serviceUrl,
    'https://proxy.example/BOA.Integration.WCFService/BOA.Integration.VirtualPos/VirtualPosService.svc/Basic',
  );
  assert.equal(
    built.soapAction,
    'http://boa.net/BOA.Integration.VirtualPos/Service/IVirtualPosService/DrawBack',
  );
});
ok('fixed fields: CurrencyCode=0949, TransactionSecurity=1, TransactionType=operation, QeryId spelling', () => {
  assert.match(soap, /<ser:CurrencyCode>0949<\/ser:CurrencyCode>/);
  assert.match(soap, /<ser:TransactionSecurity>1<\/ser:TransactionSecurity>/);
  assert.match(soap, /<ser:TransactionType>SaleReversal<\/ser:TransactionType>/);
  assert.match(soap, /<ser:QeryId>0<\/ser:QeryId>/); // bank's own misspelling, kept
});
ok('operation name flows into both the body wrapper and TransactionType', () => {
  const dw = buildRefundSoap({ ...REQ, operation: 'DrawBack' });
  assert.match(dw, /<ser:DrawBack>/);
  assert.match(dw, /<ser:TransactionType>DrawBack<\/ser:TransactionType>/);
});

// ── Response parsing: namespace-agnostic, new refs from Value ─────────────────
// Representative response modelled on the doc's field paths, with a WCF-style
// prefix (a:) to prove the parser is namespace-agnostic. The doc's example: a
// SaleReversal whose original RRN 017017791325 returns a NEW RRN 017017791337.
const RESPONSE = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
 <s:Body>
  <SaleReversalResponse xmlns="http://boa.net/BOA.Integration.VirtualPos/Service">
   <SaleReversalResult xmlns:a="http://schemas.datacontract.org/BOA">
    <a:Success>true</a:Success>
    <a:Value>
      <a:ResponseCode>00</a:ResponseCode>
      <a:ResponseMessage>OTORİZASYON VERİLDİ</a:ResponseMessage>
      <a:RRN>017017791337</a:RRN>
      <a:Stan>791337</a:Stan>
      <a:ProvisionNumber>242000</a:ProvisionNumber>
      <a:OrderId>348252999</a:OrderId>
      <a:TransactionTime>2026-07-23T14:05:11</a:TransactionTime>
      <a:BusinessKey>202607231234500000000099</a:BusinessKey>
    </a:Value>
   </SaleReversalResult>
  </SaleReversalResponse>
 </s:Body>
</s:Envelope>`;

ok('parseRefundResponse extracts success + code + the NEW refund references', () => {
  const r = parseRefundResponse(RESPONSE);
  assert.equal(r.success, true);
  assert.equal(r.responseCode, '00');
  assert.equal(r.responseMessage, 'OTORİZASYON VERİLDİ');
  assert.equal(r.rrn, '017017791337');        // NEW rrn, not the original 325
  assert.notEqual(r.rrn, '017017791325');
  assert.equal(r.stan, '791337');
  assert.equal(r.provisionNumber, '242000');
  assert.equal(r.orderId, '348252999');
  assert.equal(r.businessKey, '202607231234500000000099');
  assert.equal(isRefundApproved(r), true);
});

ok('a failed / declined response is not approved', () => {
  const declined = `<s:Envelope><s:Body><X><Result><Success>false</Success><Value><ResponseCode>51</ResponseCode><ResponseMessage>RED</ResponseMessage></Value></Result></X></s:Body></s:Envelope>`;
  const r = parseRefundResponse(declined);
  assert.equal(isRefundApproved(r), false);
});

ok('isAlreadySettled flags a settled-batch message (SaleReversal → DrawBack trigger)', () => {
  const settled = parseRefundResponse(
    `<Result><Success>false</Success><Value><ResponseCode>99</ResponseCode><ResponseMessage>GÜN SONU ALINMIŞ</ResponseMessage></Value></Result>`,
  );
  assert.equal(isAlreadySettled(settled), true);
});

// ── Refund-type decision (Istanbul day) ──────────────────────────────────────
ok('same Istanbul day → SaleReversal', () => {
  const paid = new Date('2026-07-23T06:00:00Z'); // 09:00 Istanbul
  const now  = new Date('2026-07-23T20:00:00Z'); // 23:00 Istanbul, same day
  assert.equal(decideRefundType(paid, now, false), 'SaleReversal');
});
ok('crossing Istanbul midnight → DrawBack', () => {
  const paid = new Date('2026-07-22T21:30:00Z'); // 00:30 Istanbul on the 23rd
  const now  = new Date('2026-07-23T22:30:00Z'); // 01:30 Istanbul on the 24th
  assert.equal(decideRefundType(paid, now, false), 'DrawBack');
});
ok('partial → PartialDrawback regardless of day', () => {
  const d = new Date('2026-07-23T10:00:00Z');
  assert.equal(decideRefundType(d, d, true), 'PartialDrawback');
});

console.log(`\n${passed} checks passed.`);
