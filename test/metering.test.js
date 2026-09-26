'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { Store, jobView } = require('../server/store');
const { createPricing, ceilDiv, safeNumber, DENOMINATOR } = require('../server/ai-pricing');

function snapshot(config = {}) {
  return { microUsdPerCredit: config.aiMicroUsdPerCredit ?? 10000, rates: createPricing(config).rates };
}
function counts(input = 100, cached = 20, written = 30, output = 10, reasoning = 8) {
  return { input_tokens: input, input_tokens_details: { cached_tokens: cached, cache_write_tokens: written },
    output_tokens: output, output_tokens_details: { reasoning_tokens: reasoning }, total_tokens: input + output };
}
function record(config = {}, usage = counts(), previous = 0n, responseId = `resp_${randomUUID()}`) {
  const pricing = createPricing(config);
  const { costNumerator, ...tokens } = pricing.usage(usage);
  return { responseId, model: 'gpt-6-astra', ...tokens,
    costMicroUsd: safeNumber(ceilDiv(previous + costNumerator, DENOMINATOR) - ceilDiv(previous, DENOMINATOR)),
    costNumerator: costNumerator.toString(), costDenominator: DENOMINATOR.toString(), rates: pricing.rates };
}
function fixture(t, { config = {}, disk = false } = {}) {
  const directory = disk ? fs.mkdtempSync(path.join(os.tmpdir(), 'store-metering-')) : null;
  const filename = directory ? path.join(directory, 'store.sqlite') : ':memory:';
  let store = new Store(filename);
  t.after(() => { store.close(); if (directory) fs.rmSync(directory, { recursive: true, force: true }); });
  const userId = randomUUID();
  const date = new Date().toISOString();
  store.run('INSERT INTO users(id,email,name,password_hash,credits,created_at) VALUES (?,?,?,?,?,?)',
    userId, `${userId}@example.test`, 'Metering fixture', 'fixture-only', 100, date);
  function project() {
    const id = randomUUID();
    store.run("INSERT INTO projects(id,user_id,name,status,created_at,updated_at) VALUES (?,?,?,'ready',?,?)",
      id, userId, 'Fixture project', date, date);
    return id;
  }
  const projectId = project();
  return { get store() { return store; }, userId, projectId, project,
    restart() { assert.ok(directory); store.close(); store = new Store(filename); },
    start({ cost = 10, pricing = snapshot(config), requestId = randomUUID(), target = projectId } = {}) {
      const job = store.reserveJob(userId, target, requestId, 'Update the game', cost, pricing);
      store.run("UPDATE jobs SET status = 'running' WHERE id = ?", job.id);
      return store.get('SELECT * FROM jobs WHERE id = ?', job.id);
    },
    row(id) { return store.get('SELECT * FROM jobs WHERE id = ?', id); },
    wallet() { return store.wallet(userId); },
    usageCount() { return store.get('SELECT COUNT(*) AS count FROM ai_usage').count; },
  };
}

test('exact persisted cache/read/write/output costs count reasoning once and release the full reservation', async t => {
  const config = { aiMicroUsdPerCredit: 1000 };
  const h = fixture(t, { config }); const job = h.start(); const usage = record(config);
  assert.equal(await h.store.recordUsage(job.id, usage), true);
  assert.equal(usage.costNumerator, (1395n * DENOMINATOR).toString());
  assert.equal(h.store.get('SELECT cost_numerator FROM ai_usage').cost_numerator, usage.costNumerator);
  assert.deepEqual(JSON.parse(h.row(job.id).usage_json), {
    inputTokens: 100, cachedInputTokens: 20, cacheWriteInputTokens: 30, outputTokens: 10, reasoningTokens: 8, requests: 1,
  });
  assert.equal(h.row(job.id).provider_cost_micro_usd, 1395);
  assert.equal(h.store.preparePublication(job.id).status, 'publishing');
  assert.equal(h.store.preparePublication(job.id).status, 'publishing');
  assert.equal(h.wallet().balance, 100); assert.equal(h.wallet().reserved, 10);
  assert.equal(jobView(h.row(job.id)).status, 'running');
  assert.equal(jobView(h.row(job.id)).chargedCredits, null);
  h.store.finishJob(job.id, true);
  const finished = h.row(job.id); const view = jobView(finished);
  assert.equal(finished.status, 'succeeded'); assert.equal(finished.actual_cost, 2);
  assert.equal(view.cost, 2); assert.equal(view.chargedCredits, 2); assert.equal(view.reservedCost, 10);
  assert.equal(view.providerCostMicroUsd, 1395);
  assert.deepEqual(view.usage, JSON.parse(finished.usage_json));
  assert.equal(h.wallet().balance, 98); assert.equal(h.wallet().reserved, 0); assert.equal(h.wallet().available, 98);
  const entry = h.wallet().entries[0];
  assert.equal(entry.kind, 'generation'); assert.equal(entry.amount, -2); assert.equal(entry.reservedDelta, -10);
  assert.equal(h.wallet().entries.reduce((sum, item) => sum + item.reservedDelta, 0), 0);
  const before = h.wallet();
  h.store.finishJob(job.id, true); h.store.finishJob(job.id, false, 'ignored');
  assert.equal(h.store.preparePublication(job.id).status, 'succeeded');
  assert.equal(await h.store.recordUsage(job.id, usage), false);
  assert.deepEqual(h.wallet(), before); assert.deepEqual(h.row(job.id), finished);
  assert.deepEqual(Object.keys(view).sort(), ['id', 'projectId', 'status', 'prompt', 'cost', 'reservedCost',
    'chargedCredits', 'providerCostMicroUsd', 'usage', 'error', 'createdAt', 'completedAt', 'phase', 'plan'].sort());
  const exposed = JSON.stringify(view);
  for (const privateValue of [usage.responseId, usage.model, 'costNumerator', 'pricing_json', 'password_hash', 'rates']) {
    assert.ok(!exposed.includes(privateValue));
  }
});

test('fractional requests round the exact total once, not each response or each credit', t => {
  const config = { aiMicroUsdPerCredit: 25 }; const h = fixture(t, { config }); const job = h.start();
  const first = record(config, counts(1, 0, 1, 0, 0));
  const second = record(config, counts(1, 0, 1, 0, 0), BigInt(first.costNumerator));
  assert.equal(first.costMicroUsd, 13); assert.equal(second.costMicroUsd, 12);
  h.store.recordUsage(job.id, first); h.store.recordUsage(job.id, second);
  assert.equal(h.row(job.id).provider_cost_micro_usd, 25);
  assert.deepEqual(JSON.parse(h.row(job.id).usage_json), {
    inputTokens: 2, cachedInputTokens: 0, cacheWriteInputTokens: 2, outputTokens: 0, reasoningTokens: 0, requests: 2,
  });
  h.store.preparePublication(job.id); h.store.finishJob(job.id, true);
  assert.equal(h.row(job.id).actual_cost, 1); assert.equal(h.wallet().balance, 99);
});

test('sub-microdollar usage can have zero incremental rounded cost without being discarded', t => {
  const config = { aiMicroUsdPerCredit: 1, openaiInputMicroUsdPerMillion: 1 };
  const h = fixture(t, { config }); const job = h.start();
  const first = record(config, counts(1, 0, 0, 0, 0));
  const second = record(config, counts(1, 0, 0, 0, 0), BigInt(first.costNumerator));
  assert.equal(second.costMicroUsd, 0);
  h.store.recordUsage(job.id, first); h.store.recordUsage(job.id, second);
  assert.equal(h.row(job.id).provider_cost_micro_usd, 1); assert.equal(h.usageCount(), 2);
  h.store.preparePublication(job.id); h.store.finishJob(job.id, true);
  assert.equal(h.row(job.id).actual_cost, 1);
});

test('numerators larger than Number precision remain exact in SQLite and on settlement', t => {
  const config = { aiMicroUsdPerCredit: Number.MAX_SAFE_INTEGER, openaiInputMicroUsdPerMillion: Number.MAX_SAFE_INTEGER };
  const h = fixture(t, { config }); const job = h.start();
  const usage = record(config, counts(272000, 0, 0, 0, 0));
  const expected = 272000n * BigInt(Number.MAX_SAFE_INTEGER) * 4n;
  assert.ok(expected > BigInt(Number.MAX_SAFE_INTEGER));
  h.store.recordUsage(job.id, usage);
  assert.equal(h.store.get('SELECT cost_numerator FROM ai_usage').cost_numerator, expected.toString());
  assert.equal(h.row(job.id).provider_cost_micro_usd, Number(ceilDiv(expected, DENOMINATOR)));
  h.store.preparePublication(job.id); h.store.finishJob(job.id, true);
  assert.equal(h.row(job.id).actual_cost, 1);
});

for (const publishing of [false, true]) test(`failure is free and retains incurred usage (publishing=${publishing})`, t => {
  const h = fixture(t); const job = h.start(); const usage = record();
  h.store.recordUsage(job.id, usage);
  if (publishing) h.store.preparePublication(job.id);
  const before = h.row(job.id);
  h.store.finishJob(job.id, false, 'Generation failed');
  const failed = h.row(job.id);
  assert.equal(failed.status, 'failed'); assert.equal(failed.actual_cost, 0);
  assert.equal(failed.provider_cost_micro_usd, before.provider_cost_micro_usd);
  assert.equal(failed.usage_json, before.usage_json); assert.equal(h.usageCount(), 1);
  assert.equal(jobView(failed).cost, 0); assert.equal(jobView(failed).chargedCredits, 0);
  assert.equal(h.wallet().balance, 100); assert.equal(h.wallet().reserved, 0);
  assert.equal(h.wallet().entries[0].kind, 'release'); assert.equal(h.wallet().entries[0].amount, 0);
  assert.equal(h.wallet().entries[0].reservedDelta, -10);
  assert.equal(h.store.recordUsage(job.id, usage), false);
  assert.throws(() => h.store.recordUsage(job.id, record()), /not running/);
  assert.throws(() => h.store.preparePublication(job.id), /not running/);
  h.store.finishJob(job.id, true); assert.deepEqual(h.row(job.id), failed);
});

test('metered publication and direct settlement both fail closed without recorded usage', t => {
  const h = fixture(t); const job = h.start(); const wallet = h.wallet();
  assert.throws(() => h.store.preparePublication(job.id), /without valid AI usage/);
  assert.equal(h.row(job.id).status, 'running');
  assert.throws(() => h.store.finishJob(job.id, true), /unpublished/);
  h.store.run("UPDATE jobs SET status = 'publishing' WHERE id = ?", job.id);
  assert.throws(() => h.store.finishJob(job.id, true), /without valid AI usage/);
  assert.deepEqual(h.wallet(), wallet); assert.equal(h.row(job.id).actual_cost, null);
  h.store.finishJob(job.id, false); assert.equal(h.wallet().reserved, 0);
});

test('a valid zero-cost usage record is distinct from missing usage', t => {
  const h = fixture(t); const job = h.start();
  h.store.recordUsage(job.id, record({}, counts(0, 0, 0, 0, 0)));
  h.store.preparePublication(job.id); h.store.finishJob(job.id, true);
  assert.equal(h.row(job.id).actual_cost, 0); assert.equal(h.wallet().balance, 100);
  assert.equal(h.wallet().reserved, 0); assert.equal(jobView(h.row(job.id)).usage.requests, 1);
});

test('overbudget usage is retained but cannot publish or debit even through direct settlement', t => {
  const config = { aiMicroUsdPerCredit: 25 }; const h = fixture(t, { config }); const job = h.start({ cost: 1 });
  const usage = record(config, counts(3, 0, 3, 0, 0));
  assert.equal(h.store.recordUsage(job.id, usage), true);
  assert.equal(h.row(job.id).provider_cost_micro_usd, 38);
  const wallet = h.wallet();
  assert.throws(() => h.store.preparePublication(job.id), /budget/);
  assert.equal(h.row(job.id).status, 'running'); assert.deepEqual(h.wallet(), wallet);
  h.store.run("UPDATE jobs SET status = 'publishing' WHERE id = ?", job.id);
  assert.throws(() => h.store.finishJob(job.id, true), /budget/);
  assert.deepEqual(h.wallet(), wallet);
  h.store.finishJob(job.id, false);
  assert.equal(h.row(job.id).provider_cost_micro_usd, 38); assert.equal(h.usageCount(), 1);
  assert.equal(h.row(job.id).actual_cost, 0); assert.equal(h.wallet().balance, 100); assert.equal(h.wallet().reserved, 0);
});

test('long-context provider usage keeps its higher tariff, even when the job then fails', t => {
  const h = fixture(t); const job = h.start(); const usage = record({}, counts(272001, 1, 2, 10, 3));
  h.store.recordUsage(job.id, usage);
  assert.equal(h.row(job.id).provider_cost_micro_usd, 271998 * 20 + 2 + 50 + 750);
  assert.throws(() => h.store.preparePublication(job.id), /budget/);
  h.store.finishJob(job.id, false);
  assert.equal(h.row(job.id).provider_cost_micro_usd, usage.costMicroUsd);
});

test('canonical duplicate responses are idempotent, conflicts throw, and IDs are global across jobs', t => {
  const h = fixture(t); const job = h.start(); const usage = record();
  h.store.recordUsage(job.id, usage);
  const reordered = Object.fromEntries(Object.entries(usage).reverse());
  reordered.rates = Object.fromEntries(Object.entries(usage.rates).reverse());
  delete reordered.longContext; // Optional runner metadata is derived, not a different accounting record.
  assert.equal(h.store.recordUsage(job.id, reordered), false);
  for (const conflict of [{ ...usage, model: 'different-model' }, { ...usage, costMicroUsd: usage.costMicroUsd + 1 },
    record({}, counts(101, 20, 30, 10, 8), 0n, usage.responseId)]) {
    assert.throws(() => h.store.recordUsage(job.id, conflict), /Conflicting/);
  }
  const other = h.start({ target: h.project() });
  assert.throws(() => h.store.recordUsage(other.id, usage), /Conflicting AI response identifier/);
  assert.equal(h.row(other.id).usage_json, null); assert.equal(h.row(other.id).provider_cost_micro_usd, 0);
  assert.equal(h.usageCount(), 1); assert.equal(jobView(h.row(job.id)).usage.requests, 1);
  h.store.preparePublication(job.id);
  assert.throws(() => h.store.recordUsage(job.id, record()), /not running/);
  assert.equal(h.store.recordUsage(job.id, usage), false);
});

test('invalid or forged usage never persists or changes aggregates', t => {
  const h = fixture(t); const job = h.start(); const good = record(); const before = h.row(job.id);
  const invalid = [null, {}, { ...good, responseId: '' }, { ...good, model: 'not a model' },
    { ...good, inputTokens: '100' }, { ...good, inputTokens: -1 }, { ...good, inputTokens: 0.5 },
    { ...good, cachedInputTokens: 101 }, { ...good, cacheWriteInputTokens: 81 },
    { ...good, cacheWriteInputTokens: undefined }, { ...good, outputTokens: Infinity },
    { ...good, reasoningTokens: 11 }, { ...good, reasoningTokens: Number.MAX_SAFE_INTEGER + 1 },
    { ...good, costNumerator: '1' }, { ...good, costNumerator: BigInt(good.costNumerator) },
    { ...good, costDenominator: '1000000' }, { ...good, costDenominator: 4000000 },
    { ...good, costMicroUsd: good.costMicroUsd + 1 }, { ...good, costMicroUsd: -1 },
    { ...good, costMicroUsd: '1395' }, { ...good, longContext: true },
    { ...good, rates: { ...good.rates, inputMicroUsdPerMillion: 1 } },
    { ...good, rates: { ...good.rates, cacheWriteMultiplierNumerator: 4 } },
    { ...good, rates: undefined }, { ...good, privateOutput: 'must not persist' }];
  for (const value of invalid) {
    assert.throws(() => h.store.recordUsage(job.id, value));
    assert.equal(h.usageCount(), 0); assert.deepEqual(h.row(job.id), before);
  }
  assert.equal(h.wallet().balance, 100); assert.equal(h.wallet().reserved, 10);
  assert.equal(h.store.recordUsage(job.id, good), true);
});

test('aggregate token overflow rolls back the second response rather than storing imprecise counts', t => {
  const config = { openaiInputMicroUsdPerMillion: 1 }; const h = fixture(t, { config }); const job = h.start();
  const first = record(config, counts(Number.MAX_SAFE_INTEGER, 0, 0, 0, 0));
  const second = record(config, counts(Number.MAX_SAFE_INTEGER, 0, 0, 0, 0), BigInt(first.costNumerator));
  h.store.recordUsage(job.id, first); const before = h.row(job.id);
  assert.throws(() => h.store.recordUsage(job.id, second), /limits/);
  assert.equal(h.usageCount(), 1); assert.deepEqual(h.row(job.id), before);
});

test('usage insert and aggregate updates roll back together on a storage failure', t => {
  const h = fixture(t); const job = h.start(); const usage = record(); const before = h.row(job.id);
  h.store.db.exec(`CREATE TRIGGER reject_usage BEFORE UPDATE OF usage_json ON jobs
    BEGIN SELECT RAISE(ABORT, 'fixture aggregate failure'); END;`);
  assert.throws(() => h.store.recordUsage(job.id, usage), /fixture aggregate failure/);
  assert.equal(h.usageCount(), 0); assert.deepEqual(h.row(job.id), before);
  h.store.db.exec('DROP TRIGGER reject_usage');
  assert.equal(h.store.recordUsage(job.id, usage), true); assert.equal(h.usageCount(), 1);
});

for (const success of [true, false]) test(`settlement rolls back wallet, ledger and job atomically (success=${success})`, t => {
  const h = fixture(t); const job = h.start(); h.store.recordUsage(job.id, record()); h.store.preparePublication(job.id);
  const wallet = h.wallet(); const before = h.row(job.id);
  h.store.db.exec(`CREATE TRIGGER reject_finish BEFORE INSERT ON ledger
    WHEN NEW.kind IN ('generation','release') BEGIN SELECT RAISE(ABORT, 'fixture ledger failure'); END;`);
  assert.throws(() => h.store.finishJob(job.id, success), /fixture ledger failure/);
  assert.deepEqual(h.wallet(), wallet); assert.deepEqual(h.row(job.id), before); assert.equal(h.usageCount(), 1);
  h.store.db.exec('DROP TRIGGER reject_finish');
  h.store.finishJob(job.id, success); h.store.finishJob(job.id, success);
  assert.equal(h.wallet().entries.length, 2); assert.equal(h.wallet().reserved, 0);
  assert.equal(h.row(job.id).actual_cost, success ? 1 : 0);
});

test('nested accounting transactions roll back with their enclosing transaction', t => {
  const h = fixture(t); const wallet = h.wallet();
  assert.throws(() => h.store.transaction(() => {
    const job = h.start(); h.store.recordUsage(job.id, record());
    h.store.preparePublication(job.id); h.store.finishJob(job.id, true);
    throw new Error('fixture outer rollback');
  }), /outer rollback/);
  assert.deepEqual(h.wallet(), wallet); assert.equal(h.usageCount(), 0);
  assert.equal(h.store.get('SELECT COUNT(*) AS count FROM jobs').count, 0);
});

test('reservation validates integer costs and complete pricing snapshots before reserving funds', t => {
  const h = fixture(t); const before = h.wallet();
  for (const cost of [undefined, null, '3', 0, -1, 0.5, Infinity, NaN, 9000000000001, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => h.store.reserveJob(h.userId, h.projectId, randomUUID(), 'prompt', cost, snapshot()));
  }
  const good = snapshot();
  const invalid = [null, {}, { ...good, rates: {} }, { ...good, rates: undefined }];
  for (const value of [undefined, 0, -1, 1.2, Infinity, '100', Number.MAX_SAFE_INTEGER + 1]) {
    invalid.push({ ...good, microUsdPerCredit: value });
    for (const key of ['inputMicroUsdPerMillion', 'cachedInputMicroUsdPerMillion', 'outputMicroUsdPerMillion']) {
      invalid.push({ ...good, rates: { ...good.rates, [key]: value } });
    }
  }
  invalid.push({ ...good, rates: { ...good.rates, cacheWriteMultiplierNumerator: 4 } });
  invalid.push({ ...good, rates: { ...good.rates, cacheWriteMultiplierDenominator: 5 } });
  for (const pricing of invalid) assert.throws(() => h.store.reserveJob(h.userId, h.projectId, randomUUID(), 'prompt', 3, pricing));
  assert.deepEqual(h.wallet(), before); assert.equal(h.store.get('SELECT COUNT(*) AS count FROM jobs').count, 0);
});

test('duplicate requests require the same project, prompt and reserved cost without changing old billing mode', t => {
  const h = fixture(t); const requestId = randomUUID(); const otherProject = h.project();
  const fixed = h.store.reserveJob(h.userId, h.projectId, requestId, 'prompt', 3);
  assert.equal(fixed.billing_mode, 'fixed'); assert.equal(fixed.pricing_json, null);
  assert.deepEqual(h.store.reserveJob(h.userId, h.projectId, requestId, 'prompt', 3), fixed);
  assert.deepEqual(h.store.reserveJob(h.userId, h.projectId, requestId, 'prompt', 3, snapshot()), fixed);
  for (const [project, prompt, cost] of [[otherProject, 'prompt', 3], [h.projectId, 'changed', 3], [h.projectId, 'prompt', 4]]) {
    assert.throws(() => h.store.reserveJob(h.userId, project, requestId, prompt, cost), error => error.status === 409);
  }
  assert.equal(h.wallet().reserved, 3); assert.equal(h.wallet().entries.length, 1);
  assert.throws(() => h.store.recordUsage(fixed.id, record()), /not metered/);
  assert.throws(() => h.store.preparePublication(fixed.id), /not running/);
  h.store.run("UPDATE jobs SET status = 'running' WHERE id = ?", fixed.id);
  h.store.preparePublication(fixed.id); h.store.finishJob(fixed.id, true);
  assert.equal(h.row(fixed.id).actual_cost, 3); assert.equal(h.wallet().balance, 97); assert.equal(h.wallet().reserved, 0);
  assert.equal(h.usageCount(), 0); assert.equal(jobView(h.row(fixed.id)).usage, null);
});

test('persisted snapshots survive config changes and running/publishing restarts with exactly-once settlement', t => {
  const original = { aiMicroUsdPerCredit: 25 }; const h = fixture(t, { config: original, disk: true });
  const accepted = snapshot(original); const job = h.start({ pricing: accepted });
  const first = record(original, counts(1, 0, 1, 0, 0)); h.store.recordUsage(job.id, first);
  const changed = { aiMicroUsdPerCredit: 1, openaiInputMicroUsdPerMillion: 100000000 };
  accepted.microUsdPerCredit = 1; accepted.rates = createPricing(changed).rates;
  h.restart();
  assert.equal(h.row(job.id).micro_usd_per_credit, 25);
  assert.deepEqual(JSON.parse(h.row(job.id).pricing_json), createPricing(original).rates);
  for (const pricing of [undefined, snapshot(changed)]) {
    const retry = h.store.reserveJob(h.userId, h.projectId, job.request_id, job.prompt, job.cost, pricing);
    assert.equal(retry.id, job.id); assert.equal(retry.micro_usd_per_credit, 25);
  }
  assert.equal(h.store.recordUsage(job.id, first), false);
  assert.throws(() => h.store.recordUsage(job.id, record(changed, counts(1, 0, 1, 0, 0))), /pricing/);
  const second = record(original, counts(1, 0, 1, 0, 0), BigInt(first.costNumerator));
  h.store.recordUsage(job.id, second); h.store.preparePublication(job.id);
  h.restart(); assert.equal(h.row(job.id).status, 'publishing');
  assert.equal(h.row(job.id).actual_cost, null); assert.equal(h.wallet().balance, 100); assert.equal(h.wallet().reserved, 10);
  h.store.preparePublication(job.id); h.store.finishJob(job.id, true);
  h.restart(); h.store.finishJob(job.id, true);
  assert.equal(h.row(job.id).actual_cost, 1); assert.equal(h.row(job.id).provider_cost_micro_usd, 25);
  assert.equal(h.wallet().balance, 99); assert.equal(h.wallet().reserved, 0); assert.equal(h.wallet().entries.length, 2);
  assert.equal(h.usageCount(), 2);
});

test('legacy jobs migrate non-destructively, missing columns are added once, and publishing recovery stays fixed-price', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'store-metering-migration-'));
  const filename = path.join(directory, 'legacy.sqlite');
  let store; let legacy = new DatabaseSync(filename);
  t.after(() => { store?.close(); legacy?.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  legacy.exec(`CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
      credits INTEGER NOT NULL DEFAULT 0, reserved INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
      status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), project_id TEXT NOT NULL REFERENCES projects(id),
      request_id TEXT NOT NULL, prompt TEXT NOT NULL, cost INTEGER NOT NULL CHECK(cost > 0),
      status TEXT NOT NULL CHECK(status IN ('queued','running','publishing','succeeded','failed')),
      error TEXT, created_at TEXT NOT NULL, completed_at TEXT, UNIQUE(user_id,request_id));
    CREATE TABLE ledger (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), amount INTEGER NOT NULL,
      reserved_delta INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL, reference TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL, created_at TEXT NOT NULL);
    INSERT INTO users VALUES ('u','legacy@example.test','Legacy','fixture-only',20,3,'old');
    INSERT INTO projects VALUES ('p','u','Legacy project','ready','old','old');
    INSERT INTO jobs VALUES ('j','u','p','r','legacy prompt',3,'publishing',NULL,'old',NULL);
    INSERT INTO jobs VALUES ('completed','u','p','old-r','old prompt',5,'succeeded',NULL,'old','old');
    INSERT INTO ledger VALUES ('l','u',0,3,'reservation','job:j:reserve','Legacy reservation','old');`);
  legacy.close(); legacy = null;
  store = new Store(filename);
  const columns = store.all('PRAGMA table_info(jobs)').map(column => column.name);
  for (const name of ['billing_mode', 'micro_usd_per_credit', 'pricing_json', 'actual_cost', 'provider_cost_micro_usd', 'usage_json']) {
    assert.equal(columns.filter(column => column === name).length, 1);
  }
  const job = store.get("SELECT * FROM jobs WHERE id = 'j'");
  assert.equal(job.billing_mode, 'fixed'); assert.equal(job.actual_cost, null); assert.equal(job.provider_cost_micro_usd, 0);
  assert.equal(job.pricing_json, null); assert.equal(job.micro_usd_per_credit, null); assert.equal(job.usage_json, null);
  const completed = store.get("SELECT * FROM jobs WHERE id = 'completed'");
  assert.equal(jobView(completed).cost, 5); assert.equal(jobView(completed).chargedCredits, null);
  assert.equal(store.wallet('u').balance, 20); assert.equal(store.wallet('u').reserved, 3);
  assert.deepEqual(store.reserveJob('u', 'p', 'r', 'legacy prompt', 3), job);
  store.preparePublication('j'); store.finishJob('j', true);
  assert.equal(store.wallet('u').balance, 17); assert.equal(store.wallet('u').reserved, 0);
  store.close(); store = new Store(filename); store.finishJob('j', true);
  assert.equal(store.wallet('u').balance, 17); assert.equal(store.wallet('u').entries.length, 2);
  assert.equal(store.get("SELECT actual_cost FROM jobs WHERE id = 'j'").actual_cost, 3);
  assert.deepEqual(store.get("SELECT * FROM jobs WHERE id = 'completed'"), completed);
  assert.deepEqual(store.all('PRAGMA table_info(jobs)').map(column => column.name), columns);
  assert.equal(store.get('SELECT COUNT(*) AS count FROM ai_usage').count, 0);
});
