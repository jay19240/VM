'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHmac } = require('node:crypto');
const { Store } = require('../server/store');
const { createBilling } = require('../server/billing');
const { createLemonClient } = require('../server/lemon-client');
const JAN = '2026-01-31T00:00:00.000Z';
const FEB = '2026-02-28T00:00:00.000Z';
const MAR = '2026-03-31T00:00:00.000Z';
const APR = '2026-04-30T00:00:00.000Z';
const resource = (type, id, attributes) => ({ type, id: String(id), attributes });
const status = code => error => error instanceof Error && error.status === code &&
  !error.message.includes('private-provider-detail') && error.cause === undefined;
const seconds = value => Date.parse(value) / 1000;

// Shared fixture lives in an explicitly allowed file. Every provider call is intercepted;
// an unimplemented path fails the test rather than falling through to native fetch.
function fixture(t, { packsOnly = false } = {}) {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-04-15T12:00:00Z') });
  const store = new Store(':memory:');
  t.after(() => store.close());
  for (const user of ['u1', 'u2']) store.run(
    'INSERT INTO users(id,email,name,password_hash,credits,created_at) VALUES (?,?,?,?,?,?)',
    user, `${user}@example.test`, user, 'fixture-only', 7, JAN);
  const config = { lemonApiKey: randomBytes(24).toString('hex'), lemonWebhookSecret: randomBytes(32).toString('hex'),
    lemonStoreId: '1', lemonTestMode: true, appUrl: 'https://studio.example.test',
    plans: packsOnly ? [] : [{ id: 'monthly', name: 'Monthly', variantId: '11', credits: 100, amount: 1200,
      currency: 'eur', maxProjects: 10, assetQuotaBytes: 1024 ** 3 }],
    creditPacks: [{ id: 'boost', name: 'Boost', variantId: '12', credits: 50, amount: 500, currency: 'eur' }] };
  const h = { store, config, data: new Map(), calls: [], checkouts: new Map(), bindings: new Map(), next: 100 };
  h.put = value => { h.data.set(`/${value.type}/${value.id}`, value); return value; };
  h.put(resource('stores', 1, { currency: 'EUR' }));
  for (const [variantId, priceId, category, amount] of [['11', '21', 'subscription', 1200], ['12', '22', 'one_time', 500]]) {
    h.put(resource('variants', variantId, { product_id: Number(variantId) + 20, status: 'published', test_mode: true, pay_what_you_want: false }));
    h.put(resource('products', Number(variantId) + 20, { store_id: 1, test_mode: true, status: 'published', pay_what_you_want: false }));
    h.put(resource('prices', priceId, { variant_id: Number(variantId), category, scheme: 'standard',
      usage_aggregation: null, unit_price: amount, unit_price_decimal: null, setup_fee_enabled: false,
      setup_fee: null, package_size: 1, tiers: [], trial_interval_unit: null, trial_interval_quantity: null,
      renewal_interval_unit: category === 'subscription' ? 'month' : null,
      renewal_interval_quantity: category === 'subscription' ? 1 : null }));
  }
  h.client = { async request(path, options = {}) {
    const method = options.method || 'GET';
    h.calls.push({ path, method });
    if (h.failPath === path) throw new Error('private-provider-detail');
    if (path === '/checkouts' && method === 'POST') {
      const input = options.body.data;
      const checkout = resource('checkouts', randomUUID(), { ...structuredClone(input.attributes),
        store_id: Number(input.relationships.store.data.id), variant_id: Number(input.relationships.variant.data.id),
        custom_price: null, url: 'https://fixture-store.lemonsqueezy.com/checkout/custom/fixture' });
      h.checkouts.set(checkout.id, checkout); h.data.set(`/checkouts/${checkout.id}`, checkout);
      if (h.failCreate) { h.failCreate = false; throw new Error('private-provider-detail'); }
      return { data: structuredClone(checkout) };
    }
    if (method !== 'GET') throw new Error('Unexpected mock method');
    if (path.includes('?')) {
      const u = new URL(`https://fixture.invalid${path}`);
      const type = u.pathname.slice(1);
      const filter = [...u.searchParams.keys()].find(key => key.startsWith('filter['));
      const field = filter.slice(7, -1);
      const values = [...h.data.values()].filter(value => value.type === type &&
        String(value.attributes[field]) === u.searchParams.get(filter));
      const page = Number(u.searchParams.get('page[number]'));
      const size = h.pageSize || 100;
      return { data: structuredClone(values.slice((page - 1) * size, page * size)),
        meta: { page: { currentPage: page, lastPage: Math.max(1, Math.ceil(values.length / size)) } } };
    }
    if (!h.data.has(path)) throw new Error('Unimplemented mock resource');
    return { data: structuredClone(h.data.get(path)) };
  } };
  h.restart = () => { h.billing = createBilling({ config, store, lemonClient: h.client }); return h.billing; };
  h.restart();
  h.open = async (kind = 'plan', userId = 'u1', requestId = randomUUID()) => {
    await (kind === 'plan' ? h.billing.checkout(userId, 'monthly', requestId) : h.billing.purchaseCredits(userId, 'boost', requestId));
    return store.get('SELECT * FROM lemon_checkout_intents WHERE user_id=? AND request_id=?', userId, requestId);
  };
  h.order = intent => {
    const orderId = String(h.next++); const itemId = String(h.next++);
    const item = h.put(resource('order-items', itemId, { order_id: Number(orderId), product_id: Number(intent.product_id),
      variant_id: Number(intent.variant_id), quantity: 1, price: intent.amount, created_at: JAN, updated_at: JAN }));
    const order = h.put(resource('orders', orderId, { store_id: 1, test_mode: true, customer_id: intent.user_id === 'u1' ? 41 : 42,
      status: 'paid', currency: 'EUR', subtotal: intent.amount, total: intent.amount, setup_fee: 0,
      discount_total: 0, tax: 0, tax_inclusive: false, refunded: false, refunded_at: null, refunded_amount: 0,
      first_order_item: { id: Number(itemId), ...structuredClone(item.attributes) }, created_at: JAN, updated_at: JAN }));
    const checkout = intent.checkout_id ? h.checkouts.get(intent.checkout_id) : [...h.checkouts.values()].find(c =>
      c.attributes.checkout_data.custom.billing_intent === intent.id);
    h.bindings.set(orderId, structuredClone(checkout.attributes.checkout_data.custom));
    return order;
  };
  h.sub = intent => {
    const order = h.order(intent);
    const key = String(h.next++); const itemId = String(h.next++);
    const item = h.put(resource('subscription-items', itemId, { subscription_id: Number(key), price_id: Number(intent.price_id),
      quantity: 1, is_usage_based: false, created_at: JAN, updated_at: JAN }));
    return h.put(resource('subscriptions', key, { store_id: 1, test_mode: true, customer_id: order.attributes.customer_id,
      order_id: Number(order.id), order_item_id: order.attributes.first_order_item.id,
      product_id: Number(intent.product_id), variant_id: Number(intent.variant_id), status: 'active',
      cancelled: false, pause: null, trial_ends_at: null, billing_anchor: 31, renews_at: APR, ends_at: null,
      first_subscription_item: { id: Number(itemId), ...structuredClone(item.attributes) },
      urls: { customer_portal: 'https://fixture-store.lemonsqueezy.com/billing' }, created_at: JAN, updated_at: MAR }));
  };
  h.invoice = (sub, created = JAN, reason = 'initial') => h.put(resource('subscription-invoices', h.next++, {
    store_id: 1, test_mode: true, subscription_id: Number(sub.id), customer_id: sub.attributes.customer_id,
    currency: 'EUR', status: 'paid', refunded: false, refunded_at: null, refunded_amount: 0,
    subtotal: 1200, total: 1200, tax: 0, discount_total: 0, tax_inclusive: false,
    billing_reason: reason, created_at: created, updated_at: created,
  }));
  h.event = (value, name, custom = true) => {
    let orderId = value.type === 'orders' ? value.id : String(value.attributes.order_id);
    if (value.type === 'subscription-invoices') orderId = String(h.data.get(`/subscriptions/${value.attributes.subscription_id}`).attributes.order_id);
    return { meta: { event_name: name, test_mode: true,
      ...(custom === true ? { custom_data: structuredClone(h.bindings.get(orderId)) } : custom === false ? {} : { custom_data: custom }) },
    data: structuredClone(value) };
  };
  h.sign = raw => createHmac('sha256', config.lemonWebhookSecret).update(raw).digest('hex');
  h.sendEvent = event => { const raw = Buffer.from(JSON.stringify(event)); return h.billing.webhook(raw, h.sign(raw)); };
  h.send = (value, name = value.type === 'orders' ? 'order_created' : value.type === 'subscriptions' ? 'subscription_created' : 'subscription_payment_success', custom = true) =>
    h.sendEvent(h.event(value, name, custom));
  h.balance = (userId = 'u1') => store.wallet(userId).balance;
  h.count = table => store.get(`SELECT COUNT(*) AS n FROM ${table}`).n;
  h.posts = () => h.calls.filter(call => call.method === 'POST').length;
  return h;
}
module.exports = { fixture, resource, status, JAN, FEB, MAR, APR, seconds };

if (require.main === module) {
  test('native fetch client sends JSON:API with bounded timeout, no redirects or retries', async () => {
    let calls = 0;
    const key = randomBytes(32).toString('hex');
    const client = createLemonClient({ apiKey: key, fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.lemonsqueezy.com/v1/checkouts');
      assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Accept, 'application/vnd.api+json');
      assert.ok(options.headers.Authorization === `Bearer ${key}`);
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(JSON.parse(options.body).data.type, 'checkouts');
      return { ok: true, json: async () => ({ data: { type: 'checkouts' } }) };
    } });
    const document = await client.request('/checkouts', { method: 'POST', body: { data: { type: 'checkouts' } } });
    assert.equal(document.data.type, 'checkouts'); assert.equal(calls, 1);
  });
  test('client never leaks response/transport errors and never retries ambiguous POSTs', async () => {
    for (const failure of ['http', 'json', 'transport']) {
      let calls = 0;
      const client = createLemonClient({ apiKey: randomBytes(32).toString('hex'), fetchImpl: async () => {
        calls++;
        if (failure === 'transport') throw new Error('private-provider-detail');
        return { ok: failure !== 'http', json: async () => { throw new Error('private-provider-detail'); } };
      } });
      await assert.rejects(client.request('/checkouts', { method: 'POST', body: {} }), error =>
        error.message === 'Lemon Squeezy request unavailable.' && error.cause === undefined);
      assert.equal(calls, 1);
    }
  });
  test('client refuses external URLs, traversal, unsupported methods and malformed documents', async () => {
    let calls = 0;
    const client = createLemonClient({ apiKey: randomBytes(32).toString('hex'), fetchImpl: async () => {
      calls++; return { ok: true, json: async () => ({ errors: [{}] }) };
    } });
    for (const path of ['https://attacker.test', '//attacker.test', '/../orders', '/orders/1#fragment']) {
      await assert.rejects(client.request(path));
    }
    await assert.rejects(client.request('/orders/1', { method: 'DELETE' }));
    assert.equal(calls, 0);
    await assert.rejects(client.request('/orders/1'));
    assert.equal(calls, 1);
  });
}
