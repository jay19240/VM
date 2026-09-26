'use strict';

// Pack purchases are independent of subscription eligibility/quotas. The billing module
// verifies the signed intent, authoritative order, complete item list and store/mode first.
// A subscription's order must NEVER pass through this grant path.
function createCreditPacks({ store, checkout, list, paid, refunded, markReview, conflict }) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS lemon_pack_orders (
    id TEXT PRIMARY KEY, intent_id TEXT NOT NULL UNIQUE REFERENCES lemon_checkout_intents(id),
    user_id TEXT NOT NULL REFERENCES users(id), credits INTEGER NOT NULL,
    outcome TEXT NOT NULL CHECK(outcome IN ('credited','refunded'))
  );`);
  // Called inside the same synchronous transaction as the signed event acknowledgement.
  function fulfill(order, intent) {
    if (intent.kind !== 'pack') throw conflict();
    const previous = store.get('SELECT * FROM lemon_pack_orders WHERE id=?', order.id);
    if (previous && (previous.intent_id !== intent.id || previous.user_id !== intent.user_id)) throw conflict();
    if (refunded(order.attributes)) {
      markReview(intent);
      store.run(`INSERT INTO lemon_pack_orders VALUES (?,?,?,0,'refunded')
        ON CONFLICT(id) DO UPDATE SET outcome='refunded'`, order.id, intent.id, intent.user_id);
      return; // Never debit possibly spent credits; durable reconciliation flag prevents re-grants.
    }
    if (previous) return;
    const current = store.get('SELECT state FROM lemon_checkout_intents WHERE id=?', intent.id);
    if (current.state === 'review') throw conflict();
    if (!paid(order.attributes, intent)) {
      if (order.attributes.status === 'paid') throw conflict();
      return; // Pending/failed payments can succeed later.
    }
    store.run("INSERT INTO lemon_pack_orders VALUES (?,?,?,?,'credited')", order.id, intent.id, intent.user_id, intent.credits);
    store.credit(intent.user_id, intent.credits, { kind: 'credit_purchase', reference: `lemon:order:${order.id}`,
      description: `Achat ponctuel — ${intent.offer_name}` });
    store.run("UPDATE lemon_checkout_intents SET state='paid' WHERE id=?", intent.id);
  }
  return { checkout, list, fulfill };
}
module.exports = { createCreditPacks };
