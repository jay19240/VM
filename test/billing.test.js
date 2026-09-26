'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createBilling } = require('../server/billing');
const { fixture, resource, status, JAN, FEB, MAR, APR, seconds } = require('./lemon-client.test');

test('configuration disables safely without a store or credentials', async () => {
  const billing = createBilling();
  assert.equal(billing.enabled, false);
  assert.deepEqual(await billing.listPlans(), []);
  assert.deepEqual(await billing.listCreditPacks(), []);
  assert.equal(billing.getEntitlements('u1'), null);
  for (const method of ['checkout', 'purchaseCredits', 'portal', 'subscription', 'webhook']) {
    await assert.rejects(billing[method](), status(503));
  }
});

test('verified monthly EUR catalog exposes quotas and preserves existing credits', async t => {
  const h = fixture(t);
  assert.deepEqual(await h.billing.listPlans(), [{ id: 'monthly', name: 'Monthly', amount: 1200,
    currency: 'eur', credits: 100, interval: 'month', maxProjects: 10, assetQuotaBytes: 1024 ** 3 }]);
  assert.equal(h.balance(), 7);
  assert.equal(h.billing.getEntitlements('u1'), null);
  assert.equal(await h.billing.subscription('u1'), null);
});

for (const [label, mutate] of [
  ['yearly', a => { a.renewal_interval_unit = 'year'; }],
  ['multi-month', a => { a.renewal_interval_quantity = 2; }],
  ['trial', a => { a.trial_interval_quantity = 7; a.trial_interval_unit = 'day'; }],
  ['metered', a => { a.usage_aggregation = 'sum'; }],
  ['tiered', a => { a.scheme = 'graduated'; }],
  ['setup fee', a => { a.setup_fee_enabled = true; }],
  ['fractional', a => { a.unit_price = 12.5; }],
  ['wrong amount', a => { a.unit_price = 999; }],
]) test(`catalog rejects ${label}`, async t => {
  const h = fixture(t); mutate(h.data.get('/prices/21').attributes);
  await assert.rejects(h.billing.listPlans(), status(503));
  await assert.rejects(h.billing.checkout('u1', 'monthly'), status(503));
  assert.equal(h.posts(), 0);
});

test('checkout pins quantity, variant, redirects and random binding; only binding hash is stored', async t => {
  const h = fixture(t); const intent = await h.open();
  const a = h.checkouts.get(intent.checkout_id).attributes;
  assert.deepEqual(a.checkout_data.variant_quantities, [{ variant_id: 11, quantity: 1 }]);
  assert.deepEqual(a.product_options.enabled_variants, [11]);
  assert.equal(a.product_options.redirect_url, 'https://studio.example.test/?billing=success');
  assert.equal(a.checkout_options.discount, false); assert.equal(a.checkout_options.skip_trial, true);
  assert.ok(a.checkout_data.custom.billing_intent === intent.id);
  assert.ok(a.checkout_data.custom.billing_binding !== intent.binding_hash);
  assert.equal(a.checkout_data.custom.user_id, undefined);
  assert.equal(h.balance(), 7);
  await assert.rejects(h.billing.checkout('missing', 'monthly'), status(400));
});

test('concurrent subscription checkouts, optional request IDs and restarts never duplicate POSTs', async t => {
  const h = fixture(t);
  const second = createBilling({ store: h.store, config: h.config, lemonClient: h.client });
  await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? second : h.billing).checkout('u1', 'monthly')));
  h.restart(); await h.billing.checkout('u1', 'monthly', randomUUID());
  assert.equal(h.posts(), 1); assert.equal(h.count('lemon_checkout_intents'), 1);
});

test('ambiguous creation never retries POST, even after restart/new request ID; signed event recovers it', async t => {
  const h = fixture(t); const requestId = randomUUID(); h.failCreate = true;
  await assert.rejects(h.billing.checkout('u1', 'monthly', requestId), status(503));
  h.restart();
  await assert.rejects(h.billing.checkout('u1', 'monthly', requestId), status(409));
  await assert.rejects(h.billing.checkout('u1', 'monthly', randomUUID()), status(409));
  const intent = h.store.get('SELECT * FROM lemon_checkout_intents');
  const sub = h.sub(intent); await h.send(h.invoice(sub));
  assert.equal(h.posts(), 1); assert.equal(h.balance(), 107);
  assert.equal(h.store.get('SELECT state FROM lemon_checkout_intents').state, 'paid');
});

test('initial order plus initial invoice grants once; duplicate signed bytes/types/payment IDs stay idempotent', async t => {
  const h = fixture(t); const sub = h.sub(await h.open()); const invoice = h.invoice(sub);
  const order = h.data.get(`/orders/${sub.attributes.order_id}`);
  await h.send(order); assert.equal(h.balance(), 7);
  await Promise.all([h.send(invoice), h.send(invoice), h.send(invoice, 'subscription_payment_recovered')]);
  h.restart(); await h.send(invoice); await h.send(h.invoice(sub));
  assert.equal(h.balance(), 107); assert.equal(h.count('ledger'), 1);
  assert.equal(h.count('lemon_pack_orders'), 0); assert.equal(h.count('lemon_invoices'), 2);
});

for (const offset of [-300, 60, 300]) test(`initial invoice ${offset}s from subscription creation uses the subscription month`, async t => {
  const h = fixture(t); const sub = h.sub(await h.open());
  sub.attributes.created_at = '2026-01-31T23:59:30Z'; sub.attributes.renews_at = FEB;
  const created = seconds(sub.attributes.created_at);
  const invoice = h.invoice(sub, new Date((created + offset) * 1000).toISOString());
  await h.send(invoice); h.restart();
  await h.send(invoice); await h.send(invoice, 'subscription_payment_recovered');
  assert.equal(h.balance(), 107); assert.equal(h.count('ledger'), 1);
  assert.deepEqual({ ...h.store.get('SELECT outcome,period_start,period_end,credits FROM lemon_invoices WHERE id=?', invoice.id) },
    { outcome: 'credited', period_start: created, period_end: seconds(FEB), credits: 100 });
});

for (const offset of [-301, 301]) test(`initial invoice ${offset}s from subscription creation stays outside the proximity limit`, async t => {
  const h = fixture(t); const sub = h.sub(await h.open());
  sub.attributes.created_at = '2026-01-31T23:59:30Z'; sub.attributes.renews_at = FEB;
  const invoice = h.invoice(sub, new Date((seconds(sub.attributes.created_at) + offset) * 1000).toISOString());
  await assert.rejects(h.send(invoice), status(409));
  for (const table of ['lemon_events', 'lemon_invoices', 'ledger']) assert.equal(h.count(table), 0);
  assert.equal(h.balance(), 7); assert.equal(h.billing.getEntitlements('u1'), null);
});

for (const reason of ['initial', 'renewal']) {
  for (const name of ['subscription_payment_success', 'subscription_payment_recovered']) {
    for (const missing of [true, false]) test(`${reason} ${name} retries after ${missing ? 'missing invoice timestamp' : 'inconsistent renewal boundary'}`, async t => {
      const h = fixture(t); const sub = h.sub(await h.open());
      const created = reason === 'initial' ? JAN : MAR;
      const invoice = h.invoice(sub, created, reason);
      const event = h.event(invoice, name);
      if (missing) delete invoice.attributes.created_at;
      else sub.attributes.renews_at = created;
      await assert.rejects(h.sendEvent(event), status(409));
      for (const table of ['lemon_events', 'lemon_invoices', 'ledger']) assert.equal(h.count(table), 0);
      assert.equal(h.balance(), 7); assert.equal(h.billing.getEntitlements('u1'), null);
      assert.equal(h.store.get('SELECT review FROM lemon_subscriptions').review, 0);
      invoice.attributes.created_at = created; sub.attributes.renews_at = APR;
      h.restart(); await h.sendEvent(event); await h.sendEvent(event);
      await h.send(invoice, 'subscription_payment_recovered');
      assert.equal(h.balance(), 107); assert.equal(h.count('ledger'), 1);
      assert.deepEqual({ ...h.store.get('SELECT outcome,period_start,period_end,credits FROM lemon_invoices WHERE id=?', invoice.id) },
        { outcome: 'credited', period_start: seconds(created), period_end: seconds(reason === 'initial' ? FEB : APR), credits: 100 });
    });
  }
}

for (const binder of ['subscription', 'order']) test(`invoice-first persists across restart and ${binder} binding fulfills it`, async t => {
  const h = fixture(t); const sub = h.sub(await h.open()); const invoice = h.invoice(sub);
  await h.send(invoice, 'subscription_payment_success', false);
  assert.equal(h.count('lemon_events'), 0); assert.equal(h.count('lemon_pending_invoices'), 1);
  assert.equal(h.balance(), 7); h.restart();
  await h.send(binder === 'subscription' ? sub : h.data.get(`/orders/${sub.attributes.order_id}`));
  assert.equal(h.count('lemon_pending_invoices'), 0);
  await h.send(invoice, 'subscription_payment_success', false);
  assert.equal(h.balance(), 107);
});

test('renewal before initial, stale lifecycle events, catalog retirement and immutable quota/credit snapshots', async t => {
  const h = fixture(t); const sub = h.sub(await h.open()); const stale = structuredClone(sub);
  const renewal = h.invoice(sub, MAR, 'renewal');
  h.config.plans = []; h.config.creditPacks = []; h.restart();
  await h.send(renewal);
  assert.deepEqual(h.billing.getEntitlements('u1'), { maxProjects: 10, assetQuotaBytes: 1024 ** 3 });
  sub.attributes.status = 'cancelled'; sub.attributes.cancelled = true; sub.attributes.ends_at = APR;
  sub.attributes.updated_at = '2026-04-10T00:00:00Z';
  await h.send(sub, 'subscription_cancelled');
  await h.send(h.invoice(sub)); await h.send(h.invoice(sub, FEB, 'renewal'));
  await h.send(stale, 'subscription_updated');
  assert.equal(h.balance(), 307);
  assert.deepEqual(await h.billing.subscription('u1'), { planId: 'monthly', status: 'canceled',
    cancelAtPeriodEnd: true, currentPeriodEnd: seconds(APR) });
  assert.ok(h.billing.getEntitlements('u1'));
  t.mock.timers.setTime(seconds(APR) * 1000);
  assert.equal(h.billing.getEntitlements('u1'), null);
});

test('real HMAC raw-body checks reject forged/malformed signatures and malformed JSON before API calls', async t => {
  const h = fixture(t); const sub = h.sub(await h.open());
  const event = h.event(h.invoice(sub), 'subscription_payment_success');
  const raw = Buffer.from(JSON.stringify(event)); const before = h.calls.length;
  for (const signature of ['', '0'.repeat(64), 'f'.repeat(63), 'g'.repeat(64), ['0'.repeat(64)]]) {
    await assert.rejects(h.billing.webhook(raw, signature), status(400));
  }
  await assert.rejects(h.billing.webhook(event, h.sign(raw)), status(400));
  const broken = Buffer.from('{');
  await assert.rejects(h.billing.webhook(broken, h.sign(broken)), status(400));
  await assert.rejects(h.billing.webhook(Buffer.concat([raw, Buffer.from(' ')]), h.sign(raw)), status(400));
  assert.equal(h.calls.length, before); assert.equal(h.balance(), 7);
  await h.billing.webhook(raw, h.sign(raw).toUpperCase()); assert.equal(h.balance(), 107);
});

test('failed notification arriving after provider recovery does not poison the invoice ID', async t => {
  const h = fixture(t); const sub = h.sub(await h.open()); const invoice = h.invoice(sub, MAR, 'renewal');
  await h.send(invoice, 'subscription_payment_failed');
  assert.equal(h.balance(), 7); assert.equal(h.count('lemon_invoices'), 0);
  await h.send(invoice, 'subscription_payment_recovered'); assert.equal(h.balance(), 107);
});

for (const [label, mutate] of [
  ['unpaid', (i) => { i.status = 'pending'; }],
  ['proration/update', (i) => { i.billing_reason = 'updated'; }],
  ['missing reason', (i) => { delete i.billing_reason; }],
  ['discount', (i) => { i.discount_total = 1; }],
  ['underpayment', (i) => { i.total--; }],
  ['wrong currency', (i) => { i.currency = 'USD'; }],
  ['wrong subtotal', (i) => { i.subtotal = 1100; i.total = 1100; }],
  ['partial refund', (i) => { i.refunded_amount = 1; }],
  ['missing refund state', (i) => { delete i.refunded; }],
  ['initial as renewal', (i) => { i.billing_reason = 'renewal'; }],
  ['off-anchor renewal', (i) => { i.billing_reason = 'renewal'; i.created_at = '2026-03-15T00:00:00Z'; }],
  ['trial', (i, s) => { s.trial_ends_at = FEB; }],
  ['changed anchor', (i, s) => { s.billing_anchor = 15; }],
  ['changed variant', (i, s) => { s.variant_id = 12; }],
  ['changed product', (i, s) => { s.product_id = 32; }],
  ['pause', (i, s) => { s.pause = { mode: 'free' }; }],
  ['quantity', (i, s, h) => { h.data.get(`/subscription-items/${s.first_subscription_item.id}`).attributes.quantity = 2; }],
  ['changed price', (i, s, h) => { h.data.get(`/subscription-items/${s.first_subscription_item.id}`).attributes.price_id = 22; }],
]) test(`no credits or entitlements for ${label}`, async t => {
  const h = fixture(t); const sub = h.sub(await h.open()); const invoice = h.invoice(sub);
  mutate(invoice.attributes, sub.attributes, h);
  if (['unpaid', 'initial as renewal', 'off-anchor renewal', 'changed anchor'].includes(label)) {
    await assert.rejects(h.send(invoice), status(409));
    await assert.rejects(h.send(invoice, 'subscription_payment_recovered'), status(409));
    for (const table of ['lemon_events', 'lemon_invoices', 'ledger']) assert.equal(h.count(table), 0);
  } else {
    await h.send(invoice); await h.send(invoice, 'subscription_payment_recovered');
    if (['proration/update', 'missing reason'].includes(label)) {
      assert.equal(h.store.get('SELECT outcome FROM lemon_invoices WHERE id=?', invoice.id).outcome, 'ignored');
      assert.equal(h.count('lemon_events'), 2);
    }
  }
  assert.equal(h.balance(), 7); assert.equal(h.billing.getEntitlements('u1'), null);
});

test('full pagination reveals extra subscription items rather than trusting the first item', async t => {
  const h = fixture(t); const sub = h.sub(await h.open()); h.pageSize = 1;
  h.put(resource('subscription-items', 999, { subscription_id: Number(sub.id), price_id: 21, quantity: 1, is_usage_based: false }));
  await h.send(h.invoice(sub)); assert.equal(h.balance(), 7);
  assert.ok(h.calls.some(call => call.path.includes('page[number]=2')));
});

test('missing/guessed bindings and custom user IDs cannot choose a wallet', async t => {
  const h = fixture(t); const sub = h.sub(await h.open()); const invoice = h.invoice(sub);
  for (const custom of [{ user_id: 'u2' }, { billing_intent: randomUUID(), billing_binding: '0'.repeat(64) },
    { billing_intent: h.store.get('SELECT id FROM lemon_checkout_intents').id, billing_binding: '0'.repeat(64) }]) {
    await assert.rejects(h.send(invoice, 'subscription_payment_success', custom), status(409));
  }
  assert.equal(h.balance(), 7); assert.equal(h.balance('u2'), 7);
  await h.send(invoice); assert.equal(h.balance(), 107);
});

for (const [label, mutate] of [
  ['invoice store', (i) => { i.store_id = 2; }],
  ['invoice mode', (i) => { i.test_mode = false; }],
  ['invoice customer', (i) => { i.customer_id = 42; }],
  ['subscription store', (i, s) => { s.store_id = 2; }],
  ['subscription mode', (i, s) => { s.test_mode = false; }],
  ['subscription customer', (i, s) => { s.customer_id = 42; }],
]) test(`cross-scope ${label} rejected`, async t => {
  const h = fixture(t); const sub = h.sub(await h.open()); const invoice = h.invoice(sub);
  mutate(invoice.attributes, sub.attributes);
  await assert.rejects(h.send(invoice), status(409));
  assert.equal(h.balance(), 7); assert.equal(h.balance('u2'), 7);
});

test('provider errors and ledger failures are sanitized, retryable and atomic', async t => {
  const h = fixture(t); const sub = h.sub(await h.open()); const invoice = h.invoice(sub);
  h.failPath = `/subscription-invoices/${invoice.id}`;
  await assert.rejects(h.send(invoice), status(503));
  assert.equal(h.count('lemon_events'), 0); h.failPath = null;
  const credit = h.store.credit.bind(h.store);
  h.store.credit = (...args) => { credit(...args); throw new Error('private-provider-detail'); };
  await assert.rejects(h.send(invoice), status(503));
  for (const table of ['lemon_events', 'lemon_invoices', 'ledger']) assert.equal(h.count(table), 0);
  assert.equal(h.balance(), 7);
  h.store.credit = credit; await h.send(invoice); assert.equal(h.balance(), 107);
});

test('refund before or after success never gifts/regrants and removes quota without debiting credits', async t => {
  const h = fixture(t); const sub = h.sub(await h.open()); const invoice = h.invoice(sub, MAR, 'renewal');
  await h.send(invoice); assert.ok(h.billing.getEntitlements('u1'));
  invoice.attributes.refunded_amount = 100; invoice.attributes.status = 'partial_refund';
  await h.send(invoice, 'subscription_payment_refunded');
  assert.equal(h.billing.getEntitlements('u1'), null); assert.equal(h.balance(), 107);
  invoice.attributes.refunded_amount = 0; invoice.attributes.status = 'paid';
  await h.send(invoice, 'subscription_payment_recovered');
  await h.send(h.invoice(sub, FEB, 'renewal'));
  assert.equal(h.balance(), 107);
  assert.equal(h.store.get('SELECT outcome FROM lemon_invoices WHERE id=?', invoice.id).outcome, 'refunded');
});

test('nonpayment never extends access from provider renews_at and never expires carry-over credits', async t => {
  const h = fixture(t); const sub = h.sub(await h.open());
  await h.send(h.invoice(sub));
  sub.attributes.status = 'past_due'; await h.send(sub, 'subscription_updated');
  assert.equal(h.billing.getEntitlements('u1'), null);
  assert.equal(h.balance(), 107);
  assert.equal((await h.billing.subscription('u1')).currentPeriodEnd, seconds(FEB));
});

test('portal uses only the owned API resource and refuses arbitrary URLs', async t => {
  const h = fixture(t); await assert.rejects(h.billing.portal('u1'), status(409));
  const sub = h.sub(await h.open()); await h.send(sub);
  assert.equal((await h.billing.portal('u1')).url, 'https://fixture-store.lemonsqueezy.com/billing');
  await assert.rejects(h.billing.portal('u2'), status(409));
  sub.attributes.urls.customer_portal = 'https://attacker.test/billing';
  await assert.rejects(h.billing.portal('u1'), status(503));
});

test('legacy live Stripe obligations refuse migration without deleting tables or credits', t => {
  const h = fixture(t);
  h.store.db.exec("CREATE TABLE billing_subscriptions(id TEXT, status TEXT); INSERT INTO billing_subscriptions VALUES ('legacy','active');");
  assert.throws(() => h.restart(), error => error.status === 503 && error.message.includes('Migration Stripe'));
  assert.equal(h.count('billing_subscriptions'), 1); assert.equal(h.balance(), 7);
  h.store.run("UPDATE billing_subscriptions SET status='canceled'");
  assert.equal(h.restart().enabled, true); assert.equal(h.count('billing_subscriptions'), 1);
});

test('an unsupported subscription change remains quarantined even if later changed back', async t => {
  const h = fixture(t); const sub = h.sub(await h.open());
  await h.send(h.invoice(sub, MAR, 'renewal')); assert.ok(h.billing.getEntitlements('u1'));
  sub.attributes.variant_id = 12; await h.send(sub, 'subscription_updated');
  assert.equal(h.billing.getEntitlements('u1'), null);
  sub.attributes.variant_id = 11; await h.send(sub, 'subscription_updated');
  await h.send(h.invoice(sub, FEB, 'renewal')); assert.equal(h.balance(), 107);
});

test('invalid mode/store/catalog configuration disables without exposing config values', t => {
  const h = fixture(t);
  for (const patch of [{ lemonTestMode: 'true' }, { lemonStoreId: 'abc' }, { lemonApiKey: '' },
    { lemonWebhookSecret: '' }, { appUrl: 'https://user:pass@fixture.test' },
    { plans: [{ ...h.config.plans[0], maxProjects: 0 }] },
    { creditPacks: [{ ...h.config.creditPacks[0], credits: 1.5 }] }]) {
    const billing = createBilling({ store: h.store, config: { ...h.config, ...patch }, lemonClient: h.client });
    assert.equal(billing.enabled, false); assert.equal(billing.getEntitlements('u1'), null);
  }
});

test('paid subscription order alone blocks another checkout before subscription webhook arrival', async t => {
  const h = fixture(t); const order = h.order(await h.open()); await h.send(order);
  await assert.rejects(h.billing.checkout('u1', 'monthly', randomUUID()), status(409));
  assert.equal(h.posts(), 1); assert.equal(h.balance(), 7);
});

test('refund-first subscription invoice is never granted even if a later API snapshot says paid', async t => {
  const h = fixture(t); const sub = h.sub(await h.open()); const invoice = h.invoice(sub, MAR, 'renewal');
  invoice.attributes.status = 'refunded'; invoice.attributes.refunded = true; invoice.attributes.refunded_amount = 1200;
  await h.send(invoice, 'subscription_payment_refunded');
  invoice.attributes.status = 'paid'; invoice.attributes.refunded = false; invoice.attributes.refunded_amount = 0;
  await h.send(invoice); assert.equal(h.balance(), 7); assert.equal(h.billing.getEntitlements('u1'), null);
});

test('deferred invoice provider failure leaves the binding event retryable', async t => {
  const h = fixture(t); const sub = h.sub(await h.open()); const invoice = h.invoice(sub);
  const order = h.data.get(`/orders/${sub.attributes.order_id}`);
  await h.send(invoice, 'subscription_payment_success', false);
  h.failPath = `/subscription-invoices/${invoice.id}`;
  await assert.rejects(h.send(order), status(503)); assert.equal(h.count('lemon_events'), 0);
  h.failPath = null; await h.send(order); assert.equal(h.balance(), 107);
  assert.equal(h.count('lemon_pending_invoices'), 0);
});
