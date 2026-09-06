import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAppOrder,
  isWalletOrder,
  newAppWalletOrderId,
  newWalletOrderId,
  WALLET_ORDER_PREFIX,
} from '../topup';

/**
 * The invariant the bank callback's routing rests on.
 *
 * A web top-up must NEVER take the app's deep-link branch: the guest would be
 * redirected to a custom scheme their browser cannot open, on the screen that
 * tells them whether their money arrived. This file is the proof that cannot
 * happen, rather than a comment claiming it.
 *
 * Run: node --test (once a TS loader is present) — or the inline proof in the
 * commit, which compiles this module and asserts the same facts.
 */

const RUNS = 5000;

test('every web order id is a wallet order and NOT an app order', () => {
  for (let i = 0; i < RUNS; i++) {
    const id = newWalletOrderId();
    assert.equal(isWalletOrder(id), true, `${id} should route to the wallet branch`);
    assert.equal(isAppOrder(id), false, `${id} must NOT take the app branch`);
  }
});

test('every app order id is a wallet order AND an app order', () => {
  for (let i = 0; i < RUNS; i++) {
    const id = newAppWalletOrderId();
    assert.equal(isWalletOrder(id), true, `${id} must still reach the wallet branch`);
    assert.equal(isAppOrder(id), true, `${id} should take the app branch`);
  }
});

test('the structural reason: a web id has no hyphen at position 4', () => {
  // This is WHY the two can never collide. The app marker is 'WT-A-', so a
  // collision needs '-' as the fourth character; a web id puts an 8-character
  // hyphen-free base36 stamp there.
  for (let i = 0; i < RUNS; i++) {
    const id = newWalletOrderId();
    assert.notEqual(id[3], '-', `${id} has a hyphen where the app marker lives`);
  }
});

test('historical web ids, written as literals, stay on the web branch', () => {
  // Shapes taken from the generator as it has always been: WT-<base36>-<8 hex>.
  const historical = [
    'WT-M8K2P9QZ-A1B2C3D4',
    'WT-LZZZZZZZ-00000000',
    'WT-1-FFFFFFFF',
    `${WALLET_ORDER_PREFIX}AAAAAAAA-DEADBEEF`, // starts with A, but no hyphen after
  ];
  for (const id of historical) {
    assert.equal(isWalletOrder(id), true);
    assert.equal(isAppOrder(id), false, `${id} must NOT take the app branch`);
  }
});

test('a booking order id reaches neither wallet branch', () => {
  // Bookings are '<reference>-<8 hex>' and must fall through to the booking
  // path untouched.
  for (const id of ['HP-0835-0001-a1b2c3d4', 'HP-1200-0042-deadbeef']) {
    assert.equal(isWalletOrder(id), false);
    assert.equal(isAppOrder(id), false);
  }
});

test('TLYNC custom_ref keeps both discriminators', () => {
  // buildCustomRef appends '-<8 hex>'; the prefix still leads the string.
  const appRef = `${newAppWalletOrderId()}-1a2b3c4d`;
  const webRef = `${newWalletOrderId()}-1a2b3c4d`;
  assert.equal(isAppOrder(appRef), true);
  assert.equal(isAppOrder(webRef), false);
  assert.equal(isWalletOrder(appRef), true);
  assert.equal(isWalletOrder(webRef), true);
});
