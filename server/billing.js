'use strict';
const { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const { createLemonClient } = require('./lemon-client');
const { createCreditPacks } = require('./credit-packs');

// Official JSON:API contracts (not Stripe-shaped invoices):
// https://docs.lemonsqueezy.com/api/subscription-invoices/the-subscription-invoice-object
// https://docs.lemonsqueezy.com/api/subscriptions/the-subscription-object
// https://docs.lemonsqueezy.com/api/orders/the-order-object
// https://docs.lemonsqueezy.com/api/checkouts/create-checkout
// https://docs.lemonsqueezy.com/help/webhooks/signing-requests
const queues = new WeakMap();
const now = () => Math.floor(Date.now() / 1000);
const positive = n => Number.isSafeInteger(n) && n > 0;
const numeric = value => typeof value === 'string' && /^[1-9]\d*$/.test(value) && positive(Number(value));
const id = value => numeric(String(value)) ? String(value) : null;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const date = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT.*Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) ? Math.floor(Date.parse(value) / 1000) : null;
// Preserve provider microseconds for concurrent API snapshots, not just whole seconds.
const version = value => {
  const seconds = date(value);
  const fraction = typeof value === 'string' && value.match(/\.(\d{1,6})Z$/)?.[1];
  const stamp = seconds == null ? null : seconds * 1e6 + Number((fraction || '').padEnd(6, '0'));
  return positive(stamp) ? stamp : null;
};
const statuses = new Set(['on_trial', 'active', 'paused', 'past_due', 'unpaid', 'cancelled', 'expired']);
class BillingError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
class MissingIntent extends BillingError {
  constructor(orderId) { super(409, 'Confirmation du paiement en attente.'); this.orderId = orderId; }
}
const unavailable = () => new BillingError(503, 'La facturation est temporairement indisponible.');
const invalid = () => new BillingError(400, 'La demande de facturation est invalide.');
const conflict = () => new BillingError(409, 'Ce paiement nécessite une vérification avant de continuer.');
const safe = fn => async (...args) => {
  try { return await fn(...args); } catch (error) { throw error instanceof BillingError ? error : unavailable(); }
};
function hostedUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port &&
        /^[a-z0-9-]+\.lemonsqueezy\.com$/.test(url.hostname)) return value;
  } catch { /* Never reflect untrusted URLs or provider errors. */ }
  throw unavailable();
}
function refunded(a) {
  return a.refunded === true || positive(a.refunded_amount) ||
    ['refunded', 'partial_refund', 'fraudulent'].includes(a.status);
}
// EUR catalog amount is the undiscounted net price. VAT is permitted only with consistent
// arithmetic (inclusive VAT is also supported); setup fees/discounts/FX are not.
function paid(a, intent) {
  return a.status === 'paid' && a.refunded === false && a.refunded_at === null &&
    a.refunded_amount === 0 && a.currency === 'EUR' && a.subtotal === intent.amount &&
    a.discount_total === 0 && (a.setup_fee == null || a.setup_fee === 0) &&
    Number.isSafeInteger(a.tax) && a.tax >= 0 && typeof a.tax_inclusive === 'boolean' &&
    positive(a.total) && a.total === a.subtotal + (a.tax_inclusive ? 0 : a.tax) &&
    (!a.tax_inclusive || a.tax <= a.total);
}

/** Only lemon_* tables are written. The host supplies a synchronous transactional Store,
 * authenticates user IDs, and mounts express.raw BEFORE express.json for X-Signature.
 * No automatic POST retry: Lemon documents no checkout idempotency-key contract.
 * Ambiguous creation, refunds, and unsupported plan changes require reconciliation.
 * Keep payment-success/recovered, subscription lifecycle, order and refund webhooks enabled.
 */
function createBilling({ config = {}, store, lemonClient } = {}) {
  const plans = (Array.isArray(config.plans) ? config.plans : []).map(p => ({ ...p }));
  const packs = (Array.isArray(config.creditPacks) ? config.creditPacks : []).map(p => ({ ...p }));
  const text = s => typeof s === 'string' && s.trim().length > 0;
  const catalogue = entries => entries.every(p => p && text(p.id) && text(p.name) && numeric(p.variantId) &&
    positive(p.amount) && positive(p.credits) && p.credits <= 1e9 && p.currency === 'eur') &&
    new Set(entries.map(p => p.id)).size === entries.length;
  let appUrl;
  try {
    const u = new URL(config.appUrl);
    if ((u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))) &&
        !u.username && !u.password && !u.search && !u.hash && u.pathname === '/') appUrl = u.origin;
  } catch { /* Disabled safely below. */ }
  const exists = table => store?.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?", table);
  const history = exists('lemon_checkout_intents') && store.get('SELECT id FROM lemon_checkout_intents LIMIT 1');
  const enabled = Boolean(store && appUrl && text(config.lemonApiKey) && text(config.lemonWebhookSecret) &&
    numeric(config.lemonStoreId) && typeof config.lemonTestMode === 'boolean' && catalogue(plans) && catalogue(packs) &&
    plans.every(p => positive(p.maxProjects) && positive(p.assetQuotaBytes)) &&
    new Set([...plans, ...packs].map(p => p.variantId)).size === plans.length + packs.length &&
    (plans.length || packs.length || history));
  // Never silently discard live or ambiguous Stripe obligations, even if Lemon is not yet
  // configured. Preserve ALL legacy tables and balances; operators must reconcile first.
  for (const [table, condition] of [
    ['billing_subscriptions', "status NOT IN ('canceled','incomplete_expired')"],
    ['billing_checkout_attempts', "state IN ('pending','open')"],
    ['billing_credit_purchases', "state IN ('pending','open')"],
    ['billing_customers', 'customer_id IS NULL'],
  ]) {
    if (exists(table) && store.get(`SELECT 1 FROM ${table} WHERE ${condition} LIMIT 1`)) {
      throw new BillingError(503, 'Migration Stripe requise : réconcilier les abonnements et paiements en cours avant Lemon Squeezy.');
    }
  }
  if (!enabled) {
    const disabled = async () => { throw unavailable(); };
    return { enabled: false, listPlans: async () => [], listCreditPacks: async () => [], checkout: disabled,
      purchaseCredits: disabled, subscription: disabled, portal: disabled, webhook: disabled, getEntitlements: () => null };
  }
  const client = lemonClient || createLemonClient({ apiKey: config.lemonApiKey });
  const storeId = config.lemonStoreId;
  const testMode = config.lemonTestMode;
  const webhookSecret = config.lemonWebhookSecret;
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS lemon_checkout_intents (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), request_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('plan','pack')), offer_id TEXT NOT NULL, offer_name TEXT NOT NULL,
      variant_id TEXT NOT NULL, product_id TEXT NOT NULL, price_id TEXT NOT NULL,
      store_id TEXT NOT NULL, test_mode INTEGER NOT NULL, binding_hash TEXT NOT NULL,
      amount INTEGER NOT NULL, credits INTEGER NOT NULL, max_projects INTEGER, asset_quota_bytes INTEGER,
      state TEXT NOT NULL CHECK(state IN ('creating','open','paid','expired','review')),
      checkout_id TEXT UNIQUE, order_id TEXT UNIQUE, customer_id TEXT,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, UNIQUE(user_id,kind,request_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS lemon_one_plan_checkout ON lemon_checkout_intents(user_id)
      WHERE kind='plan' AND state IN ('creating','open');
    CREATE TABLE IF NOT EXISTS lemon_subscriptions (
      id TEXT PRIMARY KEY, intent_id TEXT NOT NULL UNIQUE REFERENCES lemon_checkout_intents(id),
      user_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, cancelled INTEGER NOT NULL,
      ends_at INTEGER, renews_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      billing_anchor INTEGER NOT NULL, review INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS lemon_invoices (
      id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL REFERENCES lemon_subscriptions(id),
      outcome TEXT NOT NULL CHECK(outcome IN ('credited','ignored','refunded')),
      period_start INTEGER, period_end INTEGER, credits INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS lemon_one_month ON lemon_invoices(subscription_id,period_start)
      WHERE credits > 0;
    CREATE TABLE IF NOT EXISTS lemon_events (
      id TEXT PRIMARY KEY, event_name TEXT NOT NULL, resource_id TEXT NOT NULL, processed_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lemon_pending_invoices (
      event_key TEXT PRIMARY KEY, event_name TEXT NOT NULL, invoice_id TEXT NOT NULL,
      subscription_id TEXT NOT NULL, order_id TEXT NOT NULL, customer_id TEXT NOT NULL, store_id TEXT NOT NULL,
      test_mode INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
  `);
  // All operations for one database share a queue, including separate module instances.
  // Durable constraints + conditional claim protect additional SQLite connections/processes.
  function serial(fn) {
    const result = (queues.get(store.db) || Promise.resolve()).then(fn);
    const tail = result.then(() => {}, () => {});
    queues.set(store.db, tail);
    void tail.then(() => { if (queues.get(store.db) === tail) queues.delete(store.db); });
    return result;
  }
  function user(userId) {
    if (typeof userId !== 'string' || !store.get('SELECT id FROM users WHERE id=?', userId)) throw invalid();
  }
  function resource(value, type, expected) {
    if (!value || value.type !== type || !id(value.id) || !value.attributes ||
        (expected && value.id !== expected)) throw conflict();
    return value;
  }
  async function get(type, key) {
    if (!id(key)) throw conflict();
    return resource((await client.request(`/${type}/${key}`)).data, type, String(key));
  }
  async function list(type, filter, value) {
    const rows = [];
    for (let page = 1; page <= 100; page++) {
      const doc = await client.request(`/${type}?filter[${filter}]=${value}&page[number]=${page}&page[size]=100`);
      const meta = doc.meta?.page;
      if (!Array.isArray(doc.data) || !meta || meta.currentPage !== page || !positive(meta.lastPage) ||
          meta.lastPage < page) throw unavailable();
      for (const row of doc.data) rows.push(resource(row, type));
      if (page === meta.lastPage) {
        if (new Set(rows.map(row => row.id)).size !== rows.length) throw unavailable();
        return rows;
      }
    }
    throw unavailable();
  }
  function scope(a) {
    if (id(a.store_id) !== storeId || a.test_mode !== testMode) throw conflict();
  }
  function priceShape(a, offer, kind) {
    return id(a.variant_id) === offer.variantId && a.category === (kind === 'plan' ? 'subscription' : 'one_time') &&
      a.scheme === 'standard' && a.usage_aggregation === null && a.unit_price === offer.amount &&
      a.unit_price_decimal === null && a.setup_fee_enabled === false && (a.setup_fee == null || a.setup_fee === 0) &&
      a.package_size === 1 && (a.tiers == null || (Array.isArray(a.tiers) && a.tiers.length === 0)) &&
      a.trial_interval_unit === null && a.trial_interval_quantity === null &&
      (kind === 'plan' ? a.renewal_interval_unit === 'month' && a.renewal_interval_quantity === 1 :
        a.renewal_interval_unit === null && a.renewal_interval_quantity === null);
  }
  async function verifyOffer(offer, kind) {
    const [variant, remoteStore, prices] = await Promise.all([
      get('variants', offer.variantId), get('stores', storeId), list('prices', 'variant_id', offer.variantId),
    ]);
    const v = variant.attributes;
    const product = await get('products', id(v.product_id));
    scope(product.attributes);
    if (remoteStore.attributes.currency !== 'EUR' || v.test_mode !== testMode ||
        !['published', 'pending'].includes(v.status) || product.attributes.status !== 'published' ||
        product.attributes.pay_what_you_want !== false || v.pay_what_you_want !== false ||
        prices.length !== 1 || !priceShape(prices[0].attributes, offer, kind)) throw unavailable();
    return { productId: product.id, priceId: prices[0].id };
  }
  async function catalog(entries, kind) {
    return Promise.all(entries.map(async p => {
      await verifyOffer(p, kind);
      return { id: p.id, name: p.name, credits: p.credits, amount: p.amount, currency: p.currency,
        ...(kind === 'plan' ? { interval: 'month', maxProjects: p.maxProjects, assetQuotaBytes: p.assetQuotaBytes } : {}) };
    }));
  }
  function checkIntent(intent) {
    if (!intent || intent.store_id !== storeId || Boolean(intent.test_mode) !== testMode) throw conflict();
  }
  function customMatches(custom, intent) {
    return custom && custom.billing_intent === intent.id && typeof custom.billing_binding === 'string' &&
      /^[a-f0-9]{64}$/.test(custom.billing_binding) &&
      timingSafeEqual(Buffer.from(hash(custom.billing_binding), 'hex'), Buffer.from(intent.binding_hash, 'hex'));
  }
  function resolveIntent(orderId, subId, custom) {
    const known = store.get('SELECT * FROM lemon_checkout_intents WHERE order_id=?', orderId) ||
      (subId && store.get(`SELECT i.* FROM lemon_checkout_intents i JOIN lemon_subscriptions s ON s.intent_id=i.id WHERE s.id=?`, subId));
    const claimed = custom?.billing_intent && store.get('SELECT * FROM lemon_checkout_intents WHERE id=?', custom.billing_intent);
    const intent = known || claimed;
    if (!intent && custom == null) throw new MissingIntent(orderId);
    checkIntent(intent);
    if ((!known || custom != null) && !customMatches(custom, intent)) throw conflict();
    if (claimed && claimed.id !== intent.id) throw conflict();
    return intent;
  }
  async function validateOrder(order, intent) {
    const a = order.attributes;
    scope(a); checkIntent(intent);
    if (!id(a.customer_id) || (intent.customer_id && intent.customer_id !== id(a.customer_id)) ||
        (intent.order_id && intent.order_id !== order.id)) throw conflict();
    const items = await list('order-items', 'order_id', order.id);
    const item = items[0];
    if (items.length !== 1 || id(item.attributes.order_id) !== order.id ||
        id(item.attributes.product_id) !== intent.product_id || id(item.attributes.variant_id) !== intent.variant_id ||
        item.attributes.quantity !== 1 || item.attributes.price !== intent.amount ||
        id(a.first_order_item?.id) !== item.id) throw conflict();
    store.transaction(() => {
      const latest = store.get('SELECT * FROM lemon_checkout_intents WHERE id=?', intent.id);
      if ((latest.order_id && latest.order_id !== order.id) ||
          (latest.customer_id && latest.customer_id !== id(a.customer_id))) throw conflict();
      store.run('UPDATE lemon_checkout_intents SET order_id=?,customer_id=? WHERE id=?', order.id, id(a.customer_id), intent.id);
    });
    return item;
  }
  function markReview(intent) {
    store.run("UPDATE lemon_checkout_intents SET state='review' WHERE id=?", intent.id);
    store.run('UPDATE lemon_subscriptions SET review=1 WHERE intent_id=?', intent.id);
  }
  async function syncSub(subId, custom, expectedUser) {
    const sub = await get('subscriptions', subId);
    const a = sub.attributes;
    scope(a);
    const intent = resolveIntent(id(a.order_id), sub.id, custom);
    if (intent.kind !== 'plan' || (expectedUser && expectedUser !== intent.user_id)) throw conflict();
    const order = await get('orders', id(a.order_id));
    const item = await validateOrder(order, intent);
    // A successful subscription can precede a consistent read of its initial order.
    // Keep that delivery retryable instead of permanently quarantining transient nonpayment.
    if (['pending', 'failed'].includes(order.attributes.status)) throw conflict();
    if (id(a.customer_id) !== id(order.attributes.customer_id) || id(a.order_item_id) !== item.id ||
        !statuses.has(a.status) || typeof a.cancelled !== 'boolean' || !date(a.created_at) || !version(a.updated_at)) throw conflict();
    const [items, price] = await Promise.all([
      list('subscription-items', 'subscription_id', sub.id), get('prices', intent.price_id),
    ]);
    const si = items[0];
    const original = store.get('SELECT * FROM lemon_subscriptions WHERE id=?', sub.id);
    const origin = new Date(date(a.created_at) * 1000);
    const shape = id(a.product_id) === intent.product_id && id(a.variant_id) === intent.variant_id &&
      a.trial_ends_at === null && a.pause === null && a.status !== 'on_trial' && a.status !== 'paused' &&
      a.billing_anchor === origin.getUTCDate() && (!original || (original.billing_anchor === a.billing_anchor &&
        original.created_at === date(a.created_at))) &&
      (a.ends_at === null || date(a.ends_at)) && (a.renews_at === null || date(a.renews_at)) &&
      (!a.cancelled || date(a.ends_at)) &&
      items.length === 1 && id(si.attributes.subscription_id) === sub.id && id(si.attributes.price_id) === intent.price_id &&
      si.attributes.quantity === 1 && si.attributes.is_usage_based === false && id(a.first_subscription_item?.id) === si.id &&
      priceShape(price.attributes, { variantId: intent.variant_id, amount: intent.amount }, 'plan') &&
      paid(order.attributes, intent);
    store.transaction(() => {
      const bound = store.get('SELECT * FROM lemon_subscriptions WHERE intent_id=?', intent.id);
      const current = store.get('SELECT * FROM lemon_subscriptions WHERE id=?', sub.id);
      if ((bound && bound.id !== sub.id) || (current && (current.intent_id !== intent.id || current.user_id !== intent.user_id))) throw conflict();
      store.run(`INSERT INTO lemon_subscriptions
        (id,intent_id,user_id,status,cancelled,ends_at,renews_at,created_at,updated_at,billing_anchor,review)
        VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
        status=excluded.status,cancelled=excluded.cancelled,ends_at=excluded.ends_at,renews_at=excluded.renews_at,
        updated_at=excluded.updated_at,review=MAX(lemon_subscriptions.review,excluded.review)
        WHERE excluded.updated_at >= lemon_subscriptions.updated_at`,
      sub.id, intent.id, intent.user_id, a.status, Number(a.cancelled), date(a.ends_at), date(a.renews_at),
      date(a.created_at), version(a.updated_at), Number.isInteger(a.billing_anchor) ? a.billing_anchor : 0,
      shape && intent.state !== 'review' ? 0 : 1);
      store.run("UPDATE lemon_checkout_intents SET state=CASE WHEN state='review' THEN state ELSE 'paid' END WHERE id=?", intent.id);
      if (!shape || refunded(order.attributes)) markReview(intent);
    });
    return { sub, intent, row: store.get('SELECT * FROM lemon_subscriptions WHERE id=?', sub.id) };
  }
  function planObligation(userId) {
    return store.get(`SELECT i.id FROM lemon_checkout_intents i LEFT JOIN lemon_subscriptions s ON s.intent_id=i.id
      WHERE i.user_id=? AND i.kind='plan' AND (s.status!='expired' OR
        (s.id IS NULL AND i.state IN ('paid','review'))) LIMIT 1`, userId);
  }
  async function checkout(userId, offerId, requestId, kind = 'plan') {
    user(userId);
    if (typeof offerId !== 'string' || (requestId !== undefined && !uuid(requestId)) ||
        (kind === 'pack' && !uuid(requestId))) throw invalid();
    return serial(async () => {
      let intent = requestId && store.get('SELECT * FROM lemon_checkout_intents WHERE user_id=? AND kind=? AND request_id=?', userId, kind, requestId);
      if (intent && intent.offer_id !== offerId) throw conflict();
      if (kind === 'plan') {
        for (const s of store.all('SELECT id FROM lemon_subscriptions WHERE user_id=?', userId)) await syncSub(s.id, undefined, userId);
        if (planObligation(userId)) throw conflict();
        intent ||= store.get("SELECT * FROM lemon_checkout_intents WHERE user_id=? AND kind='plan' AND state IN ('creating','open')", userId);
        if (intent && intent.offer_id !== offerId) throw conflict();
      }
      let binding;
      let claimed = false;
      if (!intent) {
        const offer = (kind === 'plan' ? plans : packs).find(p => p.id === offerId);
        if (!offer) throw invalid();
        const verified = await verifyOffer(offer, kind);
        binding = randomBytes(32).toString('hex');
        store.transaction(() => {
          // A prior ambiguous POST blocks new request IDs too; otherwise browser retries could charge twice.
          if (store.get("SELECT id FROM lemon_checkout_intents WHERE user_id=? AND kind=? AND state='creating' LIMIT 1", userId, kind)) throw conflict();
          if (kind === 'plan' && planObligation(userId)) throw conflict();
          intent = store.get('SELECT * FROM lemon_checkout_intents WHERE user_id=? AND kind=? AND request_id=?', userId, kind, requestId || '');
          if (intent) { if (intent.offer_id !== offerId) throw conflict(); return; }
          const key = randomUUID();
          store.run(`INSERT INTO lemon_checkout_intents
            (id,user_id,request_id,kind,offer_id,offer_name,variant_id,product_id,price_id,store_id,test_mode,binding_hash,
             amount,credits,max_projects,asset_quota_bytes,state,created_at,expires_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'creating',?,?)`,
          key, userId, requestId || key, kind, offer.id, offer.name, offer.variantId, verified.productId, verified.priceId,
          storeId, Number(testMode), hash(binding), offer.amount, offer.credits, offer.maxProjects ?? null,
          offer.assetQuotaBytes ?? null, now(), now() + 3600);
          intent = store.get('SELECT * FROM lemon_checkout_intents WHERE id=?', key);
          claimed = true;
        });
      }
      checkIntent(intent);
      if (intent.state === 'paid') return { status: 'paid' };
      if (['review', 'expired'].includes(intent.state)) throw conflict();
      if (intent.state === 'creating' && !claimed) throw conflict();
      let doc;
      if (claimed) {
        doc = await client.request('/checkouts', { method: 'POST', body: { data: {
          type: 'checkouts', attributes: {
            product_options: { enabled_variants: [Number(intent.variant_id)], redirect_url: `${appUrl}/?billing=success` },
            checkout_options: { embed: false, discount: false, skip_trial: true },
            checkout_data: { custom: { billing_intent: intent.id, billing_binding: binding },
              variant_quantities: [{ variant_id: Number(intent.variant_id), quantity: 1 }] },
            expires_at: new Date(intent.expires_at * 1000).toISOString(), test_mode: testMode,
          }, relationships: { store: { data: { type: 'stores', id: storeId } },
            variant: { data: { type: 'variants', id: intent.variant_id } } },
        } } });
      } else {
        if (!uuid(intent.checkout_id)) throw conflict();
        doc = await client.request(`/checkouts/${intent.checkout_id}`);
      }
      const c = doc.data;
      const a = c?.attributes;
      if (c?.type !== 'checkouts' || !uuid(c.id) || !a || a.test_mode !== testMode ||
          id(a.store_id) !== storeId || id(a.variant_id) !== intent.variant_id || a.custom_price != null ||
          (intent.checkout_id && intent.checkout_id !== c.id) || !customMatches(a.checkout_data?.custom, intent) ||
          date(a.expires_at) !== intent.expires_at || a.checkout_data?.variant_quantities?.length !== 1 ||
          a.checkout_data.variant_quantities[0].variant_id !== Number(intent.variant_id) ||
          a.checkout_data.variant_quantities[0].quantity !== 1 || a.checkout_options?.discount !== false ||
          a.checkout_options?.skip_trial !== true || a.product_options?.enabled_variants?.length !== 1 ||
          Number(a.product_options.enabled_variants[0]) !== Number(intent.variant_id)) throw conflict();
      const url = hostedUrl(a.url);
      store.run("UPDATE lemon_checkout_intents SET checkout_id=?,state='open' WHERE id=? AND state='creating'", c.id, intent.id);
      const current = store.get('SELECT state FROM lemon_checkout_intents WHERE id=?', intent.id);
      if (current.state === 'paid') return { status: 'paid' };
      if (current.state !== 'open') throw conflict();
      if (intent.expires_at <= now()) {
        store.run("UPDATE lemon_checkout_intents SET state='expired' WHERE id=? AND state='open'", intent.id);
        throw conflict();
      }
      return { url };
    });
  }
  // Lemon invoices have no line periods. Initial periods use the subscription's creation
  // month; renewals must match the immutable billing anchor's UTC calendar day.
  // A recovered invoice retains its original created_at; do not extend from recovery time.
  function period(invoice, sub) {
    const a = invoice.attributes;
    const s = sub.attributes;
    const stamp = date(a.created_at);
    const created = date(s.created_at);
    if (!stamp || stamp > now() + 300 || !created || !['initial', 'renewal'].includes(a.billing_reason)) return null;
    const d = new Date((a.billing_reason === 'initial' ? created : stamp) * 1000);
    const boundary = (y, m) => Date.UTC(y, m, Math.min(s.billing_anchor, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())) / 1000;
    const monthStart = boundary(d.getUTCFullYear(), d.getUTCMonth());
    const end = boundary(d.getUTCFullYear(), d.getUTCMonth() + 1);
    const start = a.billing_reason === 'initial' ? created : monthStart;
    if (a.billing_reason === 'initial' ? Math.abs(stamp - created) > 300 :
      stamp < monthStart || stamp >= monthStart + 86400 || monthStart <= created) return null;
    if (end - start < 27 * 86400 || end - start > 32 * 86400) return null;
    const renews = date(s.renews_at);
    const ends = date(s.ends_at);
    if (renews && renews < end && !ends) return null;
    return { start, end: ends ? Math.min(end, ends) : end };
  }
  function recordEvent(event) {
    store.run('INSERT OR IGNORE INTO lemon_events VALUES (?,?,?,?)', event.key, event.meta.event_name, event.data.id, now());
  }
  const creditPacks = createCreditPacks({ store, checkout: (u, p, r) => checkout(u, p, r, 'pack'),
    list: () => catalog(packs, 'pack'), paid, refunded, markReview, conflict });
  async function webhook(rawBody, signature) {
    if (!Buffer.isBuffer(rawBody) || rawBody.length > 1024 * 1024 || typeof signature !== 'string' ||
        !/^[a-fA-F0-9]{64}$/.test(signature)) throw invalid();
    const digest = createHmac('sha256', webhookSecret).update(rawBody).digest();
    if (!timingSafeEqual(digest, Buffer.from(signature, 'hex'))) throw invalid();
    let event;
    try { event = JSON.parse(rawBody.toString('utf8')); } catch { throw invalid(); }
    if (!event?.meta || typeof event.meta.event_name !== 'string' || !event.data || !id(event.data.id)) throw invalid();
    const name = event.meta.event_name;
    const type = ['order_created', 'order_refunded'].includes(name) ? 'orders' :
      ['subscription_payment_success', 'subscription_payment_recovered', 'subscription_payment_failed', 'subscription_payment_refunded'].includes(name) ? 'subscription-invoices' :
        ['subscription_created', 'subscription_updated', 'subscription_cancelled', 'subscription_resumed', 'subscription_expired', 'subscription_paused', 'subscription_unpaused'].includes(name) ? 'subscriptions' : null;
    if (!type) return;
    resource(event.data, type); scope(event.data.attributes);
    if (event.meta.test_mode !== testMode) throw conflict();
    event.key = hash(rawBody); // Lemon has no documented unique webhook event ID.
    return serial(async () => {
      if (store.get('SELECT id FROM lemon_events WHERE id=?', event.key)) return;
      if (type === 'orders') {
        const order = await get('orders', event.data.id);
        const intent = resolveIntent(order.id, null, event.meta.custom_data);
        await validateOrder(order, intent);
        if (intent.kind === 'pack' && !refunded(order.attributes)) {
          const price = await get('prices', intent.price_id);
          if (!priceShape(price.attributes, { variantId: intent.variant_id, amount: intent.amount }, 'pack')) throw conflict();
        }
        if (id(event.data.attributes.customer_id) !== id(order.attributes.customer_id)) throw conflict();
        if (name === 'order_created' && order.attributes.status !== 'paid' && !refunded(order.attributes)) throw conflict();
        if (name === 'order_refunded' && !refunded(order.attributes)) throw conflict();
        store.transaction(() => {
          if (intent.kind === 'pack') creditPacks.fulfill(order, intent);
          else if (refunded(order.attributes)) markReview(intent);
          else if (paid(order.attributes, intent)) store.run(
            "UPDATE lemon_checkout_intents SET state='paid' WHERE id=? AND state!='review'", intent.id);
          // Subscription order_created NEVER grants: the initial invoice owns that payment.
          if (intent.kind === 'pack') recordEvent(event);
        });
        if (intent.kind === 'plan') {
          await processPending('order_id', order.id);
          store.transaction(() => recordEvent(event));
        }
        return;
      }
      if (type === 'subscriptions') {
        const { sub } = await syncSub(event.data.id, event.meta.custom_data);
        if (id(event.data.attributes.order_id) !== id(sub.attributes.order_id) ||
            id(event.data.attributes.customer_id) !== id(sub.attributes.customer_id)) throw conflict();
        await processPending('subscription_id', sub.id);
        store.transaction(() => recordEvent(event));
        return;
      }
      await processInvoice(event);
    });
  }
  async function processPending(column, key) {
    // column is an internal constant, never taken from a request. Only signed, verified IDs
    // are persisted; raw bodies/custom data/provider secrets are never stored here.
    for (const pending of store.all(`SELECT * FROM lemon_pending_invoices WHERE ${column}=? ORDER BY created_at`, key)) {
      if (pending.store_id !== storeId || Boolean(pending.test_mode) !== testMode) throw conflict();
      await processInvoice({ key: pending.event_key, meta: { event_name: pending.event_name },
        data: { id: pending.invoice_id, attributes: { subscription_id: pending.subscription_id, customer_id: pending.customer_id } } }, false);
    }
  }
  async function processInvoice(event, allowDefer = true) {
    const name = event.meta.event_name;
    const invoice = await get('subscription-invoices', event.data.id);
    const a = invoice.attributes;
    scope(a);
    if (id(event.data.attributes.subscription_id) !== id(a.subscription_id) ||
        id(event.data.attributes.customer_id) !== id(a.customer_id) || !id(a.customer_id) || !id(a.subscription_id)) throw conflict();
    if (name === 'subscription_payment_refunded' && !refunded(a)) throw conflict();
    if (a.status !== 'paid' && !refunded(a) &&
        ['subscription_payment_success', 'subscription_payment_recovered'].includes(name)) throw conflict();
    let owned;
    try { owned = await syncSub(id(a.subscription_id), event.meta.custom_data); }
    catch (error) {
      if (!(error instanceof MissingIntent) || !allowDefer) throw error;
      // Lemon retries only a few times. Persist verified signed invoice triggers until a
      // signed order/subscription event establishes ownership. Never resolve from email/user_id.
      if (!id(error.orderId)) throw conflict();
      store.run('INSERT OR IGNORE INTO lemon_pending_invoices VALUES (?,?,?,?,?,?,?,?,?)',
        event.key, name, invoice.id, id(a.subscription_id), error.orderId, id(a.customer_id), storeId, Number(testMode), now());
      return;
    }
    const { sub, intent, row } = owned;
    if (id(a.customer_id) !== id(sub.attributes.customer_id)) throw conflict();
    const p = period(invoice, sub);
    // A temporarily inconsistent provider snapshot must not consume a valid payment.
    // Unsupported reasons (including prorations) still follow the ignored path below.
    if (paid(a, intent) && ['initial', 'renewal'].includes(a.billing_reason) && !p) throw conflict();
    const canGrant = ['subscription_payment_success', 'subscription_payment_recovered'].includes(name) &&
      paid(a, intent) && !row.review && p && p.end > p.start;
    store.transaction(() => {
      const previous = store.get('SELECT * FROM lemon_invoices WHERE id=?', invoice.id);
      if (previous && previous.subscription_id !== sub.id) throw conflict();
      if (refunded(a)) {
        markReview(intent);
        store.run(`INSERT INTO lemon_invoices VALUES (?,?,'refunded',?,?,0)
          ON CONFLICT(id) DO UPDATE SET outcome='refunded'`, invoice.id, sub.id, p?.start ?? null, p?.end ?? null);
      } else if (!previous) {
        const duplicate = p && store.get('SELECT id FROM lemon_invoices WHERE subscription_id=? AND period_start=? AND credits>0', sub.id, p.start);
        const current = store.get('SELECT review FROM lemon_subscriptions WHERE id=?', sub.id);
        const grant = canGrant && !duplicate && !current.review;
        // Failed/pending invoices stay retryable under a later success event.
        if (a.status === 'paid' && ['subscription_payment_success', 'subscription_payment_recovered'].includes(name)) {
          store.run('INSERT INTO lemon_invoices VALUES (?,?,?,?,?,?)', invoice.id, sub.id,
            grant ? 'credited' : 'ignored', p?.start ?? null, p?.end ?? null, grant ? intent.credits : 0);
          if (grant) store.credit(intent.user_id, intent.credits, { kind: 'subscription',
            reference: `lemon:invoice:${invoice.id}`, description: 'Crédits mensuels de la plateforme' });
        }
      }
      recordEvent(event);
      store.run('DELETE FROM lemon_pending_invoices WHERE event_key=?', event.key);
    });
  }
  function getEntitlements(userId) {
    const rows = store.all(`SELECT i.max_projects,i.asset_quota_bytes FROM lemon_subscriptions s
      JOIN lemon_checkout_intents i ON i.id=s.intent_id WHERE s.user_id=? AND s.review=0 AND i.state!='review'
      AND i.store_id=? AND i.test_mode=? AND s.status IN ('active','cancelled','past_due','unpaid')
      AND (s.ends_at IS NULL OR s.ends_at>?) AND EXISTS (SELECT 1 FROM lemon_invoices v
        WHERE v.subscription_id=s.id AND v.outcome='credited' AND v.period_start<=? AND v.period_end>?)`,
    userId, storeId, Number(testMode), now(), now(), now());
    return rows.length === 1 ? { maxProjects: rows[0].max_projects, assetQuotaBytes: rows[0].asset_quota_bytes } : null;
  }
  async function subscription(userId) {
    user(userId);
    return serial(async () => {
      for (const s of store.all('SELECT id FROM lemon_subscriptions WHERE user_id=?', userId)) await syncSub(s.id, undefined, userId);
      const row = store.get(`SELECT s.*,i.offer_id FROM lemon_subscriptions s JOIN lemon_checkout_intents i ON i.id=s.intent_id
        WHERE s.user_id=? ORDER BY s.created_at DESC,s.id DESC LIMIT 1`, userId);
      if (!row) return null;
      const paidUntil = store.get("SELECT MAX(period_end) AS value FROM lemon_invoices WHERE subscription_id=? AND outcome='credited'", row.id)?.value;
      return { planId: row.offer_id, status: ({ cancelled: 'canceled', expired: 'incomplete_expired', on_trial: 'trialing' })[row.status] || row.status,
        cancelAtPeriodEnd: Boolean(row.cancelled), currentPeriodEnd: paidUntil ? Math.min(paidUntil, row.ends_at || paidUntil) : null };
    });
  }
  async function portal(userId) {
    user(userId);
    return serial(async () => {
      const row = store.get('SELECT id FROM lemon_subscriptions WHERE user_id=? ORDER BY created_at DESC LIMIT 1', userId);
      if (!row) throw conflict();
      const { sub } = await syncSub(row.id, undefined, userId);
      return { url: hostedUrl(sub.attributes.urls?.customer_portal) };
    });
  }
  return { enabled: true, listPlans: safe(() => catalog(plans, 'plan')), listCreditPacks: safe(creditPacks.list),
    checkout: safe((u, p, r) => checkout(u, p, r)), purchaseCredits: safe(creditPacks.checkout),
    subscription: safe(subscription), portal: safe(portal), webhook: safe(webhook), getEntitlements };
}
module.exports = { createBilling };
