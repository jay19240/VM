'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createBilling } = require('../server/billing');
const { fixture, resource, status } = require('./lemon-client.test');

test('packs-only catalog and purchases have no subscription eligibility or quota effects', async t => {
  const h = fixture(t, { packsOnly: true });
  assert.deepEqual(await h.billing.listPlans(), []);
  assert.deepEqual(await h.billing.listCreditPacks(), [{ id: 'boost', name: 'Boost', amount: 500, currency: 'eur', credits: 50 }]);
  const intent = await h.open('pack'); await h.send(h.order(intent));
  assert.equal(h.balance(), 57); assert.equal(h.count('lemon_subscriptions'), 0);
  assert.equal(h.billing.getEntitlements('u1'), null);
  assert.ok(h.calls.every(call => !call.path.startsWith('/subscriptions')));
});

test('concurrent pack HTTP retries and module instances create one checkout; separate purchases remain independent', async t => {
  const h = fixture(t); const requestId = randomUUID();
  const other = createBilling({ store: h.store, config: h.config, lemonClient: h.client });
  await Promise.all(Array.from({ length: 12 }, (_, i) =>
    (i % 2 ? other : h.billing).purchaseCredits('u1', 'boost', requestId)));
  assert.equal(h.posts(), 1);
  const intent = h.store.get('SELECT * FROM lemon_checkout_intents'); const order = h.order(intent);
  await Promise.all([h.send(order), h.send(order)]);
  const changedDelivery = h.event(order, 'order_created'); changedDelivery.meta.delivery = randomUUID();
  await h.sendEvent(changedDelivery); h.restart(); await h.send(order);
  assert.equal(h.balance(), 57); assert.equal(h.count('ledger'), 1);
  assert.equal((await h.billing.purchaseCredits('u1', 'boost', requestId)).status, 'paid');
  await assert.rejects(h.billing.purchaseCredits('u1', 'different', requestId), status(409));
  const next = await h.open('pack'); await h.send(h.order(next));
  assert.equal(h.posts(), 2); assert.equal(h.balance(), 107); assert.equal(h.count('ledger'), 2);
});

test('unknown users/offers and missing or non-UUID request IDs are rejected', async t => {
  const h = fixture(t);
  for (const args of [['u3', 'boost', randomUUID()], ['u1', 'unknown', randomUUID()], ['u1', 'boost'], ['u1', 'boost', 'bad']]) {
    await assert.rejects(h.billing.purchaseCredits(...args), status(400));
  }
  assert.equal(h.posts(), 0);
});

test('ambiguous pack checkout never repeats POST, including a fresh request ID; webhook recovers ownership', async t => {
  const h = fixture(t); const requestId = randomUUID(); h.failCreate = true;
  await assert.rejects(h.billing.purchaseCredits('u1', 'boost', requestId), status(503)); h.restart();
  await assert.rejects(h.billing.purchaseCredits('u1', 'boost', requestId), status(409));
  await assert.rejects(h.billing.purchaseCredits('u1', 'boost', randomUUID()), status(409));
  const intent = h.store.get('SELECT * FROM lemon_checkout_intents');
  await h.send(h.order(intent)); assert.equal(h.posts(), 1); assert.equal(h.balance(), 57);
  assert.equal((await h.billing.purchaseCredits('u1', 'boost', requestId)).status, 'paid');
});

test('catalog retirement and config changes preserve accepted purchase snapshot; ledger/event/payment transaction rolls back', async t => {
  const h = fixture(t); const order = h.order(await h.open('pack'));
  h.config.creditPacks = []; h.config.plans = []; h.restart();
  assert.deepEqual(await h.billing.listCreditPacks(), []);
  const credit = h.store.credit.bind(h.store);
  h.store.credit = (...args) => { credit(...args); throw new Error('private-provider-detail'); };
  await assert.rejects(h.send(order), status(503));
  assert.equal(h.balance(), 7);
  for (const table of ['ledger', 'lemon_events', 'lemon_pack_orders']) assert.equal(h.count(table), 0);
  assert.equal(h.store.get('SELECT state FROM lemon_checkout_intents').state, 'open');
  h.store.credit = credit; await h.send(order); assert.equal(h.balance(), 57);
});

test('pending order can succeed later; raw-body signature is verified before provider reads', async t => {
  const h = fixture(t); const order = h.order(await h.open('pack'));
  const event = h.event(order, 'order_created'); const raw = Buffer.from(JSON.stringify(event));
  const before = h.calls.length;
  await assert.rejects(h.billing.webhook(raw, '0'.repeat(64)), status(400));
  assert.equal(h.calls.length, before);
  order.attributes.status = 'pending';
  await assert.rejects(h.sendEvent(event), status(409));
  assert.equal(h.balance(), 7); assert.equal(h.count('lemon_events'), 0);
  order.attributes.status = 'paid'; await h.sendEvent(event); assert.equal(h.balance(), 57);
});

for (const [label, mutate] of [
  ['wrong store', a => { a.store_id = 2; }],
  ['wrong mode', a => { a.test_mode = false; }],
  ['wrong currency', a => { a.currency = 'USD'; }],
  ['underpayment', a => { a.total--; }],
  ['different subtotal', a => { a.subtotal--; a.total--; }],
  ['discount', a => { a.discount_total = 1; }],
  ['inconsistent tax', a => { a.tax = 1; }],
  ['setup fee', a => { a.setup_fee = 1; }],
  ['missing refund amount', a => { delete a.refunded_amount; }],
  ['wrong variant', (a, h) => { h.data.get(`/order-items/${a.first_order_item.id}`).attributes.variant_id = 11; }],
  ['wrong product', (a, h) => { h.data.get(`/order-items/${a.first_order_item.id}`).attributes.product_id = 31; }],
  ['quantity', (a, h) => { h.data.get(`/order-items/${a.first_order_item.id}`).attributes.quantity = 2; }],
  ['changed recurring price', (a, h) => { h.data.get('/prices/22').attributes.category = 'subscription'; }],
]) test(`pack rejects ${label}`, async t => {
  const h = fixture(t); const order = h.order(await h.open('pack')); mutate(order.attributes, h);
  await assert.rejects(h.send(order), status(409)); assert.equal(h.balance(), 7);
});

test('VAT arithmetic supports inclusive and exclusive EUR tax without altering credit quantity', async t => {
  const h = fixture(t);
  const exclusive = h.order(await h.open('pack')); exclusive.attributes.tax = 100; exclusive.attributes.total = 600;
  await h.send(exclusive);
  const inclusive = h.order(await h.open('pack')); inclusive.attributes.tax = 80; inclusive.attributes.tax_inclusive = true;
  await h.send(inclusive); assert.equal(h.balance(), 107);
});

test('all order-item pages are checked; hidden extra line cannot be credited', async t => {
  const h = fixture(t); const order = h.order(await h.open('pack')); h.pageSize = 1;
  h.put(resource('order-items', 999, { order_id: Number(order.id), product_id: 32, variant_id: 12, quantity: 1, price: 500 }));
  await assert.rejects(h.send(order), status(409)); assert.equal(h.balance(), 7);
  assert.ok(h.calls.some(call => call.path.includes('page[number]=2')));
});

test('cross-user binding swaps and payment-ID rebinding never redirect credits', async t => {
  const h = fixture(t); const first = h.order(await h.open('pack')); const second = h.order(await h.open('pack', 'u2'));
  const custom = structuredClone(h.bindings.get(first.id));
  custom.billing_intent = h.bindings.get(second.id).billing_intent;
  await assert.rejects(h.send(first, 'order_created', custom), status(409));
  await assert.rejects(h.send(first, 'order_created', { user_id: 'u2' }), status(409));
  await h.send(first); assert.equal(h.balance(), 57); assert.equal(h.balance('u2'), 7);
  await assert.rejects(h.send(first, 'order_created', h.bindings.get(second.id)), status(409));
  await h.send(second); assert.equal(h.balance('u2'), 57);
});

test('one checkout intent cannot fund two distinct orders', async t => {
  const h = fixture(t); const intent = await h.open('pack'); await h.send(h.order(intent));
  await assert.rejects(h.send(h.order(intent)), status(409)); assert.equal(h.balance(), 57);
});

for (const afterPayment of [false, true]) test(`refund ${afterPayment ? 'after' : 'before'} fulfillment blocks replay without debiting existing credits`, async t => {
  const h = fixture(t); const order = h.order(await h.open('pack'));
  if (afterPayment) await h.send(order);
  order.attributes.status = 'partial_refund'; order.attributes.refunded_amount = 1;
  await h.send(order, 'order_refunded');
  assert.equal(h.balance(), afterPayment ? 57 : 7);
  order.attributes.status = 'paid'; order.attributes.refunded_amount = 0;
  await h.send(order); assert.equal(h.balance(), afterPayment ? 57 : 7);
  assert.equal(h.store.get('SELECT outcome FROM lemon_pack_orders').outcome, 'refunded');
  assert.equal(h.store.get('SELECT state FROM lemon_checkout_intents').state, 'review');
});

test('the same browser request ID belongs independently to each authenticated user', async t => {
  const h = fixture(t); const requestId = randomUUID();
  const a = await h.open('pack', 'u1', requestId); const b = await h.open('pack', 'u2', requestId);
  await h.send(h.order(a)); await h.send(h.order(b));
  assert.equal(h.posts(), 2); assert.equal(h.balance(), 57); assert.equal(h.balance('u2'), 57);
});

test('durable checkout claim protects callers that do not share the in-memory queue', async t => {
  const h = fixture(t); const requestId = randomUUID();
  // Same synchronous transaction backend, different db identity to exercise the persistent
  // claim instead of relying on the module WeakMap. SQLite BEGIN IMMEDIATE serializes writers.
  const isolatedStore = { db: { exec: h.store.db.exec.bind(h.store.db) },
    get: h.store.get.bind(h.store), all: h.store.all.bind(h.store), run: h.store.run.bind(h.store),
    transaction: h.store.transaction.bind(h.store), credit: h.store.credit.bind(h.store) };
  const other = createBilling({ store: isolatedStore, config: h.config, lemonClient: h.client });
  const results = await Promise.allSettled([h.billing.purchaseCredits('u1', 'boost', requestId),
    other.purchaseCredits('u1', 'boost', requestId)]);
  assert.ok(results.some(result => result.status === 'fulfilled'));
  assert.equal(h.posts(), 1); assert.equal(h.count('lemon_checkout_intents'), 1);
});
