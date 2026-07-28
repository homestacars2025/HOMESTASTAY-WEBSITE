/**
 * boatest refund test — validates the SOAP refund against Kuveyt Türk's TEST
 * environment before REFUND_LIVE_ENABLED is ever set on production.
 *
 *   npx tsx scripts/test-refund-boatest.mts <RRN> <STAN> <PROVISION> <ORDERID> <MERCHANT_ORDER_ID> <AMOUNT_TRY>
 *
 * You need a reversible TEST transaction on boatest first — do a test payment on
 * boatest (test path /boa.virtualpos.services/Home/ThreeDModelPayGate) with the
 * test card 5188961939192544 / CVV 929 / 06/25 / 3D pass 123456, and capture its
 * rrn / stan / provision_number / order_id / merchant_order_id / amount_try.
 *
 * Config is EXPLICIT here (test creds + test host) — it never reads production
 * env, so this cannot touch a real charge.
 *
 * ⚠️ PROXY: boatest.kuveytturk.com.tr is a DIFFERENT host from production. The
 * pay-proxy only forwards the production boa host. Point BOATEST_PROXY at a
 * proxy that reaches boatest, OR run this from a whitelisted IP. If the request
 * times out, that routing is the reason, not the SOAP.
 */
import {
  buildRefundSoap, postRefundSoap, parseRefundResponse,
  isRefundApproved, toRefundConfig,
} from '../src/lib/payment/kuveyt-refund.ts';

const [rrn, stan, provision, orderId, moid, amountTry] = process.argv.slice(2);
if (!rrn || !stan || !provision || !orderId || !moid || !amountTry) {
  console.error('usage: tsx scripts/test-refund-boatest.mts <RRN> <STAN> <PROVISION> <ORDERID> <MERCHANT_ORDER_ID> <AMOUNT_TRY>');
  process.exit(1);
}

// Test env from the bank doc. BOATEST_PROXY must reach boatest.kuveytturk.com.tr.
const proxyBase = process.env.BOATEST_PROXY ?? 'https://boatest.kuveytturk.com.tr';

const cfg = toRefundConfig('SaleReversal', {
  merchantId: '57902',
  customerId: '97228291',
  userName:   'TEPKVT2021',
  password:   'api123',
  proxyBase,
  // SOAPAction override lets you try alternatives against boatest without edits.
  soapActionBase: process.env.BOATEST_SOAP_ACTION_BASE,
});

// Minor units, exactly as the sale sent them (×100, no punctuation).
const amountMinor = String(Math.round(Number(amountTry) * 100));

console.log('→ POST', cfg.serviceUrl);
console.log('  SOAPAction:', cfg.soapAction);
console.log('  operation : SaleReversal   amount(minor):', amountMinor);

const soap = buildRefundSoap({
  cfg, operation: 'SaleReversal',
  rrn, stan, provisionNumber: provision, orderId, merchantOrderId: moid, amountMinor,
});

try {
  const raw = await postRefundSoap(cfg, soap);
  const r = parseRefundResponse(raw);
  console.log('\n── bank response ──');
  console.log('  Success        :', r.success);
  console.log('  ResponseCode   :', r.responseCode);
  console.log('  ResponseMessage:', r.responseMessage);
  console.log('  NEW RRN        :', r.rrn, '(≠ original', rrn + ')');
  console.log('  NEW Stan       :', r.stan);
  console.log('  ProvisionNumber:', r.provisionNumber);
  console.log('  OrderId        :', r.orderId);
  console.log('  BusinessKey    :', r.businessKey);
  console.log('\n  APPROVED:', isRefundApproved(r) ? '✓ YES' : '✗ NO');
  if (!isRefundApproved(r)) {
    console.log('  raw (first 1500):', r.raw.slice(0, 1500));
  }
} catch (err) {
  console.error('\n✗ transport error:', err instanceof Error ? err.message : String(err));
  console.error('  If this is a timeout, BOATEST_PROXY is not reaching boatest.');
  process.exit(1);
}
