'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Store } = require('../server/store');
const { createJobs } = require('../server/jobs');
const { createPricing, ceilDiv, safeNumber, DENOMINATOR } = require('../server/ai-pricing');

function usageRecord(config) {
  const pricing = createPricing(config);
  const { costNumerator, ...tokens } = pricing.usage({ input_tokens: 1000,
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens: 200,
    output_tokens_details: { reasoning_tokens: 100 }, total_tokens: 1200 });
  return { responseId: `resp_${randomUUID()}`, model: 'gpt-6-astra', ...tokens,
    costMicroUsd: safeNumber(ceilDiv(costNumerator, DENOMINATOR)), costNumerator: costNumerator.toString(),
    costDenominator: DENOMINATOR.toString(), rates: pricing.rates };
}

async function fixture(t, { metered = false } = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-recovery-test-'));
  const databasePath = path.join(dataDir, 'test.sqlite');
  let store = new Store(databasePath);
  const config = { dataDir, databasePath, aiMicroUsdPerCredit: 10000 };
  t.after(async () => { store.close(); await fs.rm(dataDir, { recursive: true, force: true }); });
  const userId = randomUUID(); const projectId = randomUUID(); const now = new Date().toISOString();
  store.run('INSERT INTO users(id,email,name,password_hash,created_at) VALUES (?,?,?,?,?)', userId, 'fixture@example.test', 'Fixture', 'fixture', now);
  store.run('INSERT INTO projects VALUES (?,?,?,?,?,?)', projectId, userId, 'Fixture', 'ready', now, now);
  store.credit(userId, 10, { kind: 'test', reference: randomUUID(), description: 'Test' });
  const job = metered
    ? store.reserveJob(userId, projectId, randomUUID(), 'Test', 3,
      { microUsdPerCredit: config.aiMicroUsdPerCredit, rates: createPricing(config).rates })
    : store.reserveJob(userId, projectId, randomUUID(), 'Test', 3);
  const root = path.join(dataDir, 'users', userId, projectId);
  const live = path.join(root, 'engine/src/game');
  const work = path.join(root, 'generations', job.id);
  const draft = path.join(work, 'game'); const backup = path.join(work, 'previous');
  await fs.mkdir(live, { recursive: true }); await fs.mkdir(draft, { recursive: true });
  await fs.writeFile(path.join(live, 'main.js'), 'export const level = 1;');
  await fs.writeFile(path.join(draft, 'main.js'), 'export const level = 2;');
  return { get store() { return store; }, userId, projectId, job, live, work, draft, backup, config,
    restart() { store.close(); store = new Store(databasePath); } };
}
for (const point of ['queued', 'running', 'before-renames', 'after-first-rename', 'after-second-rename']) {
  test(`recovery at ${point} reconciles publication and reservation exactly once`, async t => {
    const h = await fixture(t); let cleanup = 0;
    assert.equal(h.job.billing_mode, 'fixed'); assert.equal(h.job.micro_usd_per_credit, null);
    const status = ['queued', 'running'].includes(point) ? point : 'publishing';
    h.store.run('UPDATE jobs SET status = ? WHERE id = ?', status, h.job.id);
    if (point.startsWith('after-')) await fs.rename(h.live, h.backup);
    if (point === 'after-second-rename') await fs.rename(h.draft, h.live);
    const jobs = createJobs({ store: h.store, config: h.config, runner: { cleanup: async () => { cleanup++; } } });
    await jobs.recover(); await jobs.recover();
    const paid = point === 'after-second-rename';
    assert.equal(h.store.wallet(h.userId).reserved, 0);
    assert.equal(h.store.wallet(h.userId).balance, paid ? 7 : 10);
    assert.equal(h.store.get('SELECT status FROM jobs WHERE id = ?', h.job.id).status, paid ? 'succeeded' : 'failed');
    assert.equal(await fs.readFile(path.join(h.live, 'main.js'), 'utf8'), `export const level = ${paid ? 2 : 1};`);
    assert.equal(cleanup, point === 'running' ? 1 : 0);
    assert.equal(h.store.get('SELECT count(*) AS n FROM ai_usage').n, 0);
    assert.equal(h.store.all("SELECT id FROM ledger WHERE kind IN ('generation','release')").length, 1);
  });
}
for (const point of ['queued', 'running', 'before-renames', 'after-first-rename', 'after-second-rename']) {
  test(`metered recovery at ${point} preserves pricing and usage and settles exactly once`, async t => {
    const h = await fixture(t, { metered: true });
    const usage = usageRecord(h.config);
    assert.equal(usage.costMicroUsd, 20000);
    assert.equal(usage.costNumerator, (20000n * DENOMINATOR).toString());
    assert.equal(h.job.billing_mode, 'metered');
    if (point !== 'queued') {
      h.store.run("UPDATE jobs SET status='running' WHERE id=?", h.job.id);
      assert.equal(h.store.recordUsage(h.job.id, usage), true);
    }
    if (!['queued', 'running'].includes(point)) {
      assert.equal(h.store.preparePublication(h.job.id).status, 'publishing');
    }
    assert.equal(h.store.wallet(h.userId).balance, 10); assert.equal(h.store.wallet(h.userId).reserved, 3);
    assert.equal(h.store.get('SELECT actual_cost FROM jobs WHERE id=?', h.job.id).actual_cost, null);
    if (point.startsWith('after-')) await fs.rename(h.live, h.backup);
    if (point === 'after-second-rename') await fs.rename(h.draft, h.live);
    // A restarted server must use the durable job snapshot, not current fees or rates.
    h.config.aiMicroUsdPerCredit = 1;
    h.config.openaiInputMicroUsdPerMillion = 1;
    h.config.openaiOutputMicroUsdPerMillion = 1;
    h.restart();
    const persisted = h.store.get('SELECT * FROM jobs WHERE id=?', h.job.id);
    assert.equal(persisted.status, ['queued', 'running'].includes(point) ? point : 'publishing');
    assert.equal(persisted.micro_usd_per_credit, 10000);
    assert.deepEqual(JSON.parse(persisted.pricing_json), usage.rates);
    const usageRows = h.store.all('SELECT * FROM ai_usage WHERE job_id=?', h.job.id);
    assert.equal(usageRows.length, point === 'queued' ? 0 : 1);
    if (usageRows.length) {
      assert.equal(usageRows[0].cost_numerator, usage.costNumerator);
      assert.deepEqual(JSON.parse(usageRows[0].record_json), usage);
    }
    // OpenAI jobs have no legacy container to clean up, even in the running state.
    const jobs = createJobs({ store: h.store, config: h.config, runner: {} });
    await jobs.recover(); await jobs.recover();
    const paid = point === 'after-second-rename';
    const job = h.store.get('SELECT * FROM jobs WHERE id=?', h.job.id);
    assert.equal(job.status, paid ? 'succeeded' : 'failed'); assert.equal(job.actual_cost, paid ? 2 : 0);
    assert.equal(job.provider_cost_micro_usd, point === 'queued' ? 0 : 20000);
    assert.equal(job.micro_usd_per_credit, 10000); assert.equal(job.pricing_json, persisted.pricing_json);
    assert.equal(job.usage_json, persisted.usage_json);
    if (point !== 'queued') assert.deepEqual(JSON.parse(job.usage_json), { inputTokens: 1000,
      cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 200, reasoningTokens: 100, requests: 1 });
    assert.equal(h.store.wallet(h.userId).balance, paid ? 8 : 10);
    assert.equal(h.store.wallet(h.userId).reserved, 0); assert.equal(h.store.wallet(h.userId).available, paid ? 8 : 10);
    assert.equal(await fs.readFile(path.join(h.live, 'main.js'), 'utf8'), `export const level = ${paid ? 2 : 1};`);
    if (paid) assert.equal(await fs.readFile(path.join(h.backup, 'main.js'), 'utf8'), 'export const level = 1;');
    const entries = h.store.all("SELECT amount,reserved_delta,kind FROM ledger WHERE kind IN ('generation','release')");
    assert.equal(entries.length, 1);
    assert.deepEqual({ ...entries[0] }, { amount: paid ? -2 : 0, reserved_delta: -3, kind: paid ? 'generation' : 'release' });
    const wallet = h.store.wallet(h.userId);
    h.restart();
    await createJobs({ store: h.store, config: h.config, runner: {} }).recover();
    assert.deepEqual(h.store.wallet(h.userId), wallet);
    assert.deepEqual(h.store.get('SELECT * FROM jobs WHERE id=?', h.job.id), job);
    assert.deepEqual(h.store.all('SELECT * FROM ai_usage WHERE job_id=?', h.job.id), usageRows);
  });
}

test('missing legacy cleanup fails closed and retains the active fixed-price reservation', async t => {
  const h = await fixture(t);
  h.store.run("UPDATE jobs SET status='running' WHERE id=?", h.job.id);
  const jobs = createJobs({ store: h.store, config: h.config, runner: {} });
  await assert.rejects(jobs.recover(), /Ancienne génération/);
  assert.equal(h.store.get('SELECT status FROM jobs WHERE id=?', h.job.id).status, 'running');
  assert.equal(h.store.wallet(h.userId).balance, 10); assert.equal(h.store.wallet(h.userId).reserved, 3);
  assert.equal(h.store.all("SELECT id FROM ledger WHERE kind IN ('generation','release')").length, 0);
});

test('unavailable container cleanup fails closed without refunding an unknown active job', async t => {
  const h = await fixture(t); h.store.run("UPDATE jobs SET status = 'running' WHERE id = ?", h.job.id);
  const jobs = createJobs({ store: h.store, config: h.config, runner: { cleanup: async () => { throw new Error('unavailable'); } } });
  await assert.rejects(jobs.recover());
  assert.equal(h.store.wallet(h.userId).reserved, 3);
});
test('concurrent reservations across independent SQLite connections cannot overspend', async t => {
  const h = await fixture(t); const other = new Store(h.config.databasePath); t.after(() => other.close());
  const secondProject = randomUUID(); const thirdProject = randomUUID(); const now = new Date().toISOString();
  for (const id of [secondProject, thirdProject]) h.store.run('INSERT INTO projects VALUES (?,?,?,?,?,?)', id, h.userId, 'Other', 'ready', now, now);
  other.reserveJob(h.userId, secondProject, randomUUID(), 'Second', 6);
  assert.throws(() => h.store.reserveJob(h.userId, thirdProject, randomUUID(), 'Third', 3), error => error.status === 402);
  assert.equal(h.store.wallet(h.userId).reserved, 9); assert.equal(h.store.wallet(h.userId).available, 1);
});
