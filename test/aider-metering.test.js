'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Store, jobView } = require('../server/store');
const { createPricing, ceilDiv, DENOMINATOR } = require('../server/ai-pricing');

const pricing = (microUsdPerCredit = 1000) => ({ provider: 'aider', microUsdPerCredit });
const usage = (overrides = {}) => ({ costMicroUsd: 1395, inputTokens: 100, outputTokens: 10, requests: 1, ...overrides });
function fixture(t, { disk = false } = {}) {
  const directory = disk ? fs.mkdtempSync(path.join(os.tmpdir(), 'store-aider-metering-')) : null;
  const filename = directory ? path.join(directory, 'store.sqlite') : ':memory:';
  let store = new Store(filename);
  t.after(() => { store.close(); if (directory) fs.rmSync(directory, { recursive: true, force: true }); });
  const userId = randomUUID();
  const date = new Date().toISOString();
  store.run('INSERT INTO users(id,email,name,password_hash,credits,created_at) VALUES (?,?,?,?,?,?)',
    userId, `${userId}@example.test`, 'Aider fixture', 'fixture-only', 100, date);
  function project() {
    const id = randomUUID();
    store.run("INSERT INTO projects(id,user_id,name,status,created_at,updated_at) VALUES (?,?,?,'ready',?,?)",
      id, userId, 'Fixture project', date, date);
    return id;
  }
  const projectId = project();
  return { get store() { return store; }, userId, projectId, project,
    restart() { assert.ok(directory); store.close(); store = new Store(filename); },
    start({ cost = 10, snapshot = pricing(), requestId = randomUUID(), target = projectId, running = true } = {}) {
      const job = store.reserveJob(userId, target, requestId, 'Update the game', cost, snapshot);
      if (running) store.run("UPDATE jobs SET status = 'running' WHERE id = ?", job.id);
      return store.get('SELECT * FROM jobs WHERE id = ?', job.id);
    },
    row(id) { return store.get('SELECT * FROM jobs WHERE id = ?', id); },
    wallet() { return store.wallet(userId); },
    usageCount() { return store.get('SELECT COUNT(*) AS count FROM ai_usage').count; },
  };
}

function legacyRecord() {
  const legacy = createPricing({});
  const { costNumerator, ...tokens } = legacy.usage({
    input_tokens: 100, input_tokens_details: { cached_tokens: 20, cache_write_tokens: 30 },
    output_tokens: 10, output_tokens_details: { reasoning_tokens: 8 }, total_tokens: 110,
  });
  return { responseId: `resp_${randomUUID()}`, model: 'legacy-model', ...tokens,
    costMicroUsd: Number(ceilDiv(costNumerator, DENOMINATOR)), costNumerator: costNumerator.toString(),
    costDenominator: DENOMINATOR.toString(), rates: legacy.rates };
}

test('Aider uses a metered provider snapshot and settles the cumulative estimate exactly once', t => {
  const h = fixture(t); const job = h.start(); const wallet = h.wallet();
  assert.equal(job.billing_mode, 'metered');
  assert.deepEqual(JSON.parse(job.pricing_json), { provider: 'aider' });
  assert.equal(job.micro_usd_per_credit, 1000);
  assert.equal(jobView(job).costSource, 'aider');
  assert.equal(h.store.recordAiderUsage(job.id, usage()), true);
  const recorded = h.row(job.id);
  assert.deepEqual({ ...recorded }, { ...job, provider_cost_micro_usd: 1395,
    usage_json: JSON.stringify({ inputTokens: 100, outputTokens: 10, requests: 1 }) });
  assert.deepEqual(h.wallet(), wallet); assert.equal(h.usageCount(), 0);
  assert.throws(() => h.store.finishJob(job.id, true), /unpublished/);
  assert.equal(h.store.preparePublication(job.id).status, 'publishing');
  assert.equal(h.store.preparePublication(job.id).status, 'publishing');
  assert.deepEqual(h.wallet(), wallet);
  assert.equal(jobView(h.row(job.id)).status, 'running');
  assert.equal(jobView(h.row(job.id)).chargedCredits, null);
  h.store.finishJob(job.id, true);
  const finished = h.row(job.id); const view = jobView(finished);
  assert.equal(finished.status, 'succeeded'); assert.equal(finished.actual_cost, 2);
  assert.equal(view.costSource, 'aider'); assert.equal(view.cost, 2); assert.equal(view.chargedCredits, 2);
  assert.equal(view.reservedCost, 10); assert.equal(view.providerCostMicroUsd, 1395);
  assert.deepEqual(view.usage, { inputTokens: 100, outputTokens: 10, requests: 1 });
  assert.equal(h.wallet().balance, 98); assert.equal(h.wallet().reserved, 0);
  const settled = h.wallet(); const entry = settled.entries[0];
  assert.equal(entry.kind, 'generation'); assert.equal(entry.amount, -2); assert.equal(entry.reservedDelta, -10);
  assert.equal(settled.entries.length, 2);
  assert.equal(settled.entries.reduce((sum, item) => sum + item.reservedDelta, 0), 0);
  h.store.finishJob(job.id, true); h.store.finishJob(job.id, false, 'ignored');
  assert.equal(h.store.preparePublication(job.id).status, 'succeeded');
  assert.deepEqual(h.row(job.id), finished); assert.deepEqual(h.wallet(), settled);
});

test('Aider identical retries are idempotent and cumulative updates replace rather than sum totals', t => {
  const h = fixture(t); const job = h.start(); const first = usage();
  assert.equal(h.store.recordAiderUsage(job.id, first), true);
  const before = h.row(job.id); const wallet = h.wallet();
  assert.equal(h.store.recordAiderUsage(job.id, Object.fromEntries(Object.entries(first).reverse())), false);
  assert.deepEqual(h.row(job.id), before); assert.deepEqual(h.wallet(), wallet);
  const second = usage({ costMicroUsd: 2000, inputTokens: 150, outputTokens: 25, requests: 3 });
  assert.equal(h.store.recordAiderUsage(job.id, second), true);
  assert.equal(h.row(job.id).provider_cost_micro_usd, 2000);
  assert.deepEqual(JSON.parse(h.row(job.id).usage_json), { inputTokens: 150, outputTokens: 25, requests: 3 });
  assert.equal(h.store.recordAiderUsage(job.id, { ...second, requests: 4 }), true);
  assert.deepEqual(h.wallet(), wallet); assert.equal(h.usageCount(), 0);
  h.store.preparePublication(job.id); h.store.finishJob(job.id, true);
  assert.equal(h.row(job.id).actual_cost, 2); assert.equal(h.wallet().balance, 98);
});

test('Aider rejects invalid, missing, extra, inherited and accessor fields without changing accounting', t => {
  const h = fixture(t); const job = h.start(); const before = h.row(job.id); const wallet = h.wallet();
  const invalid = [null, undefined, {}, [], 'usage', { ...usage(), privateOutput: 'not persisted' },
    Object.assign(Object.create({ inherited: true }), usage()), { ...usage(), [Symbol('extra')]: 1 }];
  for (const key of ['costMicroUsd', 'inputTokens', 'outputTokens', 'requests']) {
    for (const value of [undefined, null, false, '1', -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 1n]) {
      invalid.push(usage({ [key]: value }));
    }
    const missing = usage(); delete missing[key]; invalid.push(missing);
  }
  invalid.push(usage({ requests: 0 }));
  let getterCalled = false;
  invalid.push(Object.defineProperty(usage(), 'costMicroUsd', { enumerable: true,
    get() { getterCalled = true; return 1395; } }));
  for (const value of invalid) {
    assert.throws(() => h.store.recordAiderUsage(job.id, value));
    assert.deepEqual(h.row(job.id), before); assert.deepEqual(h.wallet(), wallet);
    assert.equal(h.usageCount(), 0);
  }
  assert.equal(getterCalled, false);
  assert.equal(h.store.recordAiderUsage(job.id, usage()), true);
});

test('Aider rejects decreasing cumulative totals and conflicting same-request reports', t => {
  const h = fixture(t); const job = h.start(); const original = usage({ requests: 3 });
  h.store.recordAiderUsage(job.id, original);
  const before = h.row(job.id); const wallet = h.wallet();
  const decreases = [usage({ requests: 2 }), usage({ requests: 4, costMicroUsd: 1394 }),
    usage({ requests: 4, inputTokens: 99 }), usage({ requests: 4, outputTokens: 9 })];
  for (const value of decreases) {
    assert.throws(() => h.store.recordAiderUsage(job.id, value), /Decreasing/);
    assert.deepEqual(h.row(job.id), before); assert.deepEqual(h.wallet(), wallet);
  }
  for (const key of ['costMicroUsd', 'inputTokens', 'outputTokens']) {
    for (const change of [-1, 1]) {
      assert.throws(() => h.store.recordAiderUsage(job.id, { ...original, [key]: original[key] + change }), /Conflicting/);
      assert.deepEqual(h.row(job.id), before); assert.deepEqual(h.wallet(), wallet);
    }
  }
  assert.equal(h.store.recordAiderUsage(job.id, original), false);
});

for (const state of ['queued', 'publishing', 'succeeded', 'failed']) {
  test(`Aider requires running state, even for identical retries (${state})`, t => {
    const h = fixture(t); const job = h.start({ running: state !== 'queued' });
    if (state !== 'queued') {
      h.store.recordAiderUsage(job.id, usage());
      if (state !== 'failed') h.store.preparePublication(job.id);
      if (state === 'succeeded' || state === 'failed') h.store.finishJob(job.id, state === 'succeeded');
    }
    assert.equal(h.row(job.id).status, state);
    const before = h.row(job.id); const wallet = h.wallet();
    assert.throws(() => h.store.recordAiderUsage(job.id, usage()), /not running/);
    assert.deepEqual(h.row(job.id), before); assert.deepEqual(h.wallet(), wallet);
  });
}

test('Aider usage requires an existing job and valid Aider-only pricing snapshot', t => {
  const h = fixture(t);
  assert.throws(() => h.store.recordAiderUsage(randomUUID(), usage()), /Unknown job/);
  const fixed = h.store.reserveJob(h.userId, h.projectId, randomUUID(), 'fixed', 10);
  h.store.run("UPDATE jobs SET status = 'running' WHERE id = ?", fixed.id);
  assert.throws(() => h.store.recordAiderUsage(fixed.id, usage()), /Aider pricing/);
  const legacy = h.start({ target: h.project(), snapshot: { microUsdPerCredit: 1000, rates: createPricing({}).rates } });
  assert.throws(() => h.store.recordAiderUsage(legacy.id, usage()), /Aider pricing/);
  const aider = h.start({ target: h.project() });
  assert.throws(() => h.store.recordUsage(aider.id, legacyRecord()));
  for (const snapshot of [null, {}, { provider: 'other' }, { provider: 'aider', rates: {} }]) {
    h.store.run('UPDATE jobs SET pricing_json = ? WHERE id = ?', JSON.stringify(snapshot), aider.id);
    assert.throws(() => h.store.recordAiderUsage(aider.id, usage()));
    assert.throws(() => h.store.preparePublication(aider.id));
  }
  h.store.run('UPDATE jobs SET pricing_json = ? WHERE id = ?', JSON.stringify({ provider: 'aider' }), aider.id);
  for (const value of [null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    h.store.run('UPDATE jobs SET micro_usd_per_credit = ? WHERE id = ?', value, aider.id);
    assert.throws(() => h.store.recordAiderUsage(aider.id, usage()));
    assert.throws(() => h.store.preparePublication(aider.id));
  }
  // Restore a readable integer after deliberately persisting an unsafe SQLite value.
  h.store.run('UPDATE jobs SET micro_usd_per_credit = ? WHERE id = ?', 1000, aider.id);
  assert.equal(h.row(aider.id).usage_json, null); assert.equal(h.row(aider.id).provider_cost_micro_usd, 0);
  assert.equal(h.wallet().balance, 100); assert.equal(h.wallet().entries.length, 3); assert.equal(h.usageCount(), 0);
});

test('Aider cannot publish or settle without valid positive-request usage', t => {
  const h = fixture(t); const job = h.start(); const wallet = h.wallet();
  assert.throws(() => h.store.preparePublication(job.id), /without valid AI usage/);
  assert.equal(h.row(job.id).status, 'running');
  assert.throws(() => h.store.finishJob(job.id, true), /unpublished/);
  h.store.run("UPDATE jobs SET status = 'publishing' WHERE id = ?", job.id);
  assert.throws(() => h.store.finishJob(job.id, true), /without valid AI usage/);
  for (const invalid of [{ inputTokens: 0, outputTokens: 0, requests: 0 },
    { inputTokens: 0, requests: 1 }, { inputTokens: -1, outputTokens: 0, requests: 1 }]) {
    h.store.run('UPDATE jobs SET usage_json = ? WHERE id = ?', JSON.stringify(invalid), job.id);
    assert.throws(() => h.store.preparePublication(job.id));
    assert.throws(() => h.store.finishJob(job.id, true));
  }
  assert.deepEqual(h.wallet(), wallet); assert.equal(h.row(job.id).actual_cost, null);
  h.store.finishJob(job.id, false);
  assert.equal(h.wallet().balance, 100); assert.equal(h.wallet().reserved, 0);
});

for (const [costMicroUsd, expected] of [[0, 0], [1, 1], [1000, 1], [1001, 2], [10000, 10]]) {
  test(`Aider rounds the session estimate up to credits (${costMicroUsd} micro-USD)`, t => {
    const h = fixture(t); const job = h.start();
    h.store.recordAiderUsage(job.id, usage({ costMicroUsd, inputTokens: 0, outputTokens: 0 }));
    h.store.preparePublication(job.id); h.store.finishJob(job.id, true);
    assert.equal(h.row(job.id).actual_cost, expected);
    assert.equal(h.wallet().balance, 100 - expected); assert.equal(h.wallet().reserved, 0);
  });
}

test('Aider accounting stays exact at the safe integer limit without overflowing budget products', t => {
  const h = fixture(t); const job = h.start({ snapshot: pricing(Number.MAX_SAFE_INTEGER - 1) });
  h.store.recordAiderUsage(job.id, usage({ costMicroUsd: Number.MAX_SAFE_INTEGER,
    inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: Number.MAX_SAFE_INTEGER, requests: Number.MAX_SAFE_INTEGER }));
  h.store.preparePublication(job.id); h.store.finishJob(job.id, true);
  assert.equal(h.row(job.id).actual_cost, 2);
  assert.equal(h.row(job.id).provider_cost_micro_usd, Number.MAX_SAFE_INTEGER);
  assert.equal(jobView(h.row(job.id)).usage.requests, Number.MAX_SAFE_INTEGER);
  assert.equal(h.wallet().balance, 98);
});

test('Aider records over-budget usage but refuses publication and direct settlement without debiting', t => {
  const h = fixture(t); const job = h.start({ cost: 1 });
  assert.equal(h.store.recordAiderUsage(job.id, usage({ costMicroUsd: 1001 })), true);
  const wallet = h.wallet(); const before = h.row(job.id);
  assert.equal(before.provider_cost_micro_usd, 1001);
  assert.throws(() => h.store.preparePublication(job.id), /budget/);
  assert.deepEqual(h.row(job.id), before); assert.deepEqual(h.wallet(), wallet);
  h.store.run("UPDATE jobs SET status = 'publishing' WHERE id = ?", job.id);
  assert.throws(() => h.store.finishJob(job.id, true), /budget/);
  assert.deepEqual(h.wallet(), wallet); assert.equal(h.row(job.id).actual_cost, null);
  h.store.finishJob(job.id, false, 'Over budget');
  assert.equal(h.row(job.id).actual_cost, 0); assert.equal(h.row(job.id).provider_cost_micro_usd, 1001);
  assert.equal(h.row(job.id).usage_json, before.usage_json);
  assert.equal(h.wallet().balance, 100); assert.equal(h.wallet().reserved, 0);
  assert.equal(h.wallet().entries[0].kind, 'release'); assert.equal(h.wallet().entries[0].amount, 0);
});

for (const state of ['queued', 'running', 'publishing']) {
  test(`Aider failure from ${state} always releases the full reservation without a debit`, t => {
    const h = fixture(t); const job = h.start({ running: state !== 'queued' });
    if (state !== 'queued') h.store.recordAiderUsage(job.id, usage());
    if (state === 'publishing') h.store.preparePublication(job.id);
    const before = h.row(job.id);
    h.store.finishJob(job.id, false, 'Generation failed');
    const failed = h.row(job.id); const wallet = h.wallet();
    assert.equal(failed.status, 'failed'); assert.equal(failed.actual_cost, 0);
    assert.equal(failed.usage_json, before.usage_json); assert.equal(failed.provider_cost_micro_usd, before.provider_cost_micro_usd);
    assert.equal(jobView(failed).chargedCredits, 0); assert.equal(jobView(failed).costSource, 'aider');
    assert.equal(wallet.balance, 100); assert.equal(wallet.reserved, 0);
    assert.equal(wallet.entries[0].kind, 'release'); assert.equal(wallet.entries[0].amount, 0);
    assert.equal(wallet.entries[0].reservedDelta, -10);
    h.store.finishJob(job.id, true); h.store.finishJob(job.id, false);
    assert.deepEqual(h.row(job.id), failed); assert.deepEqual(h.wallet(), wallet);
  });
}

test('Aider usage and settlement are transactional on storage failures', t => {
  const h = fixture(t); const job = h.start(); const before = h.row(job.id); const wallet = h.wallet();
  h.store.db.exec(`CREATE TRIGGER reject_usage BEFORE UPDATE OF usage_json ON jobs
    BEGIN SELECT RAISE(ABORT, 'fixture usage failure'); END;`);
  assert.throws(() => h.store.recordAiderUsage(job.id, usage()), /fixture usage failure/);
  assert.deepEqual(h.row(job.id), before); assert.deepEqual(h.wallet(), wallet);
  h.store.db.exec('DROP TRIGGER reject_usage');
  assert.throws(() => h.store.transaction(() => {
    h.store.recordAiderUsage(job.id, usage());
    throw new Error('fixture outer rollback');
  }), /outer rollback/);
  assert.deepEqual(h.row(job.id), before);
  h.store.recordAiderUsage(job.id, usage()); h.store.preparePublication(job.id);
  const publishing = h.row(job.id);
  h.store.db.exec(`CREATE TRIGGER reject_finish BEFORE INSERT ON ledger
    WHEN NEW.kind IN ('generation','release') BEGIN SELECT RAISE(ABORT, 'fixture ledger failure'); END;`);
  for (const success of [true, false]) {
    assert.throws(() => h.store.finishJob(job.id, success), /fixture ledger failure/);
    assert.deepEqual(h.row(job.id), publishing); assert.deepEqual(h.wallet(), wallet);
  }
  h.store.db.exec('DROP TRIGGER reject_finish');
  h.store.finishJob(job.id, true);
  assert.equal(h.wallet().balance, 98); assert.equal(h.wallet().entries.length, 2);
});

test('Aider rejects invalid pricing before making a reservation', t => {
  const h = fixture(t); const before = h.wallet();
  const invalid = [{ provider: 'aider' }, { provider: 'other', microUsdPerCredit: 1000 },
    { ...pricing(), rates: createPricing({}).rates }];
  for (const value of [null, 0, -1, 1.5, Infinity, NaN, '1000', Number.MAX_SAFE_INTEGER + 1]) invalid.push(pricing(value));
  for (const snapshot of invalid) {
    assert.throws(() => h.store.reserveJob(h.userId, h.projectId, randomUUID(), 'prompt', 10, snapshot));
    assert.deepEqual(h.wallet(), before);
  }
  assert.equal(h.store.get('SELECT COUNT(*) AS count FROM jobs').count, 0);
});

test('Aider snapshots and cumulative usage survive config changes and running/publishing restarts', t => {
  const h = fixture(t, { disk: true }); const accepted = pricing(25); const job = h.start({ snapshot: accepted });
  const first = usage({ costMicroUsd: 13 });
  h.store.recordAiderUsage(job.id, first);
  accepted.microUsdPerCredit = 1; accepted.provider = 'changed';
  h.restart();
  assert.equal(h.row(job.id).micro_usd_per_credit, 25);
  assert.deepEqual(JSON.parse(h.row(job.id).pricing_json), { provider: 'aider' });
  assert.equal(h.row(job.id).provider_cost_micro_usd, 13);
  const wallet = h.wallet();
  for (const snapshot of [undefined, pricing(1), { microUsdPerCredit: 1, rates: createPricing({}).rates }]) {
    assert.deepEqual(h.store.reserveJob(h.userId, h.projectId, job.request_id, job.prompt, job.cost, snapshot), h.row(job.id));
  }
  assert.deepEqual(h.wallet(), wallet);
  assert.equal(h.store.recordAiderUsage(job.id, first), false);
  h.store.recordAiderUsage(job.id, usage({ costMicroUsd: 25, inputTokens: 200, outputTokens: 20, requests: 2 }));
  h.store.preparePublication(job.id); h.restart();
  assert.equal(h.row(job.id).status, 'publishing'); assert.equal(h.row(job.id).actual_cost, null);
  assert.equal(h.wallet().balance, 100); assert.equal(h.wallet().reserved, 10);
  h.store.preparePublication(job.id); h.store.finishJob(job.id, true);
  const settled = h.wallet(); h.restart(); h.store.finishJob(job.id, true);
  assert.deepEqual(h.wallet(), settled);
  assert.equal(h.row(job.id).actual_cost, 1); assert.equal(h.row(job.id).provider_cost_micro_usd, 25);
  assert.equal(h.wallet().balance, 99); assert.equal(h.wallet().reserved, 0); assert.equal(h.wallet().entries.length, 2);
});

test('historical fixed and legacy metered jobs, usage and ledger survive alongside Aider jobs', t => {
  const h = fixture(t, { disk: true });
  const fixed = h.store.reserveJob(h.userId, h.projectId, randomUUID(), 'Historical fixed job', 3);
  assert.deepEqual(h.store.reserveJob(h.userId, h.projectId, fixed.request_id, fixed.prompt, fixed.cost, pricing()), fixed);
  h.store.run("UPDATE jobs SET status = 'running' WHERE id = ?", fixed.id);
  h.store.preparePublication(fixed.id); h.store.finishJob(fixed.id, true);
  const legacy = h.start({ snapshot: { microUsdPerCredit: 1000, rates: createPricing({}).rates } });
  const record = legacyRecord();
  h.store.recordUsage(legacy.id, record); h.store.preparePublication(legacy.id); h.store.finishJob(legacy.id, true);
  assert.equal(h.store.recordUsage(legacy.id, record), false);
  assert.equal(h.row(legacy.id).actual_cost, 2);
  assert.deepEqual(h.store.reserveJob(h.userId, h.projectId, legacy.request_id, legacy.prompt, legacy.cost, pricing()), h.row(legacy.id));
  const oldJobs = h.store.all('SELECT * FROM jobs ORDER BY rowid');
  const oldLedger = h.store.all('SELECT * FROM ledger ORDER BY rowid');
  const oldUsage = h.store.all('SELECT * FROM ai_usage ORDER BY rowid');
  const columns = h.store.all('PRAGMA table_info(jobs)');
  const aider = h.start(); h.store.recordAiderUsage(aider.id, usage());
  h.store.preparePublication(aider.id); h.store.finishJob(aider.id, true); h.restart();
  for (const old of oldJobs) {
    assert.deepEqual(h.row(old.id), old); assert.equal(jobView(h.row(old.id)).costSource, 'legacy');
  }
  assert.deepEqual(h.store.all('SELECT * FROM ledger ORDER BY rowid').slice(0, oldLedger.length), oldLedger);
  assert.deepEqual(h.store.all('SELECT * FROM ai_usage ORDER BY rowid'), oldUsage);
  assert.deepEqual(h.store.all('PRAGMA table_info(jobs)'), columns);
  assert.equal(h.wallet().balance, 93); assert.equal(h.wallet().reserved, 0);
  assert.equal(jobView(h.row(aider.id)).costSource, 'aider');
  assert.equal(jobView({ ...h.row(fixed.id), pricing_json: undefined, actual_cost: null }).costSource, 'legacy');
});

test('restored project ownership aliases and progress methods retain authorization and immutable plans', t => {
  const h = fixture(t);
  assert.equal(h.store.assertOwnProject(h.userId, h.projectId).id, h.projectId);
  assert.deepEqual(h.store.ownProject(h.userId, h.projectId), h.store.assertOwnProject(h.userId, h.projectId));
  for (const method of ['assertOwnProject', 'ownProject']) {
    assert.throws(() => h.store[method](randomUUID(), h.projectId), error => error.status === 404);
    assert.throws(() => h.store[method](h.userId, randomUUID()), error => error.status === 404);
  }
  const job = h.start();
  assert.equal(h.store.updateJobProgress(job.id, { phase: 'planning' }), true);
  assert.equal(h.store.updateJobProgress(job.id, { phase: 'coding', plan: 'Update game movement.' }), true);
  assert.equal(h.store.updateJobProgress(job.id, { phase: 'coding', plan: 'Update game movement.' }), false);
  assert.throws(() => h.store.updateJobProgress(job.id, { phase: 'coding', plan: 'Different plan.' }), /Conflicting/);
  assert.equal(h.store.updateJobProgress(job.id, { phase: 'validating' }), true);
  assert.equal(jobView(h.row(job.id)).plan, 'Update game movement.');
  h.store.finishJob(job.id, false);
  assert.throws(() => h.store.updateJobProgress(job.id, { phase: 'planning' }), /not running/);
});
