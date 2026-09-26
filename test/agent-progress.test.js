'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { Store, jobView } = require('../server/store');

function fixture(t, { disk = false, running = true } = {}) {
  const directory = disk ? fs.mkdtempSync(path.join(os.tmpdir(), 'agent-progress-')) : null;
  const filename = directory ? path.join(directory, 'store.sqlite') : ':memory:';
  let store = new Store(filename);
  t.after(() => { store.close(); if (directory) fs.rmSync(directory, { recursive: true, force: true }); });
  const userId = randomUUID(); const projectId = randomUUID(); const date = new Date().toISOString();
  store.run('INSERT INTO users(id,email,name,password_hash,credits,created_at) VALUES (?,?,?,?,?,?)',
    userId, `${userId}@example.test`, 'Progress fixture', 'fixture-only', 100, date);
  store.run("INSERT INTO projects(id,user_id,name,status,created_at,updated_at) VALUES (?,?,?,'ready',?,?)",
    projectId, userId, 'Fixture project', date, date);
  const job = store.reserveJob(userId, projectId, randomUUID(), 'Update the game', 10);
  if (running) store.run("UPDATE jobs SET status = 'running' WHERE id = ?", job.id);
  return { get store() { return store; }, filename, jobId: job.id,
    row() { return store.get('SELECT * FROM jobs WHERE id = ?', job.id); },
    wallet() { return store.wallet(userId); },
    restart() { assert.ok(directory); store.close(); store = new Store(filename); },
  };
}

test('jobView exposes nullable progress for legacy jobs and prioritizes publication without changing status compatibility', t => {
  const h = fixture(t);
  const row = h.row();
  assert.equal(row.agent_phase, null); assert.equal(row.agent_plan, null);
  const legacy = { ...row }; delete legacy.agent_phase; delete legacy.agent_plan;
  for (const input of [row, legacy]) {
    assert.equal(jobView(input).phase, null); assert.equal(jobView(input).plan, null);
  }
  for (const phase of [null, 'planning', 'coding', 'validating']) {
    const input = { ...row, agent_phase: phase, agent_plan: 'A public plan' };
    for (const status of ['queued', 'running', 'succeeded', 'failed']) {
      const view = jobView({ ...input, status });
      assert.equal(view.status, status); assert.equal(view.phase, phase); assert.equal(view.plan, 'A public plan');
    }
    const view = jobView({ ...input, status: 'publishing' });
    assert.equal(view.status, 'running'); assert.equal(view.phase, 'publishing'); assert.equal(view.plan, 'A public plan');
  }
  assert.equal(jobView({ ...legacy, status: 'publishing' }).phase, 'publishing');
  assert.equal(jobView(null), null); assert.equal(jobView(undefined), undefined);
});

test('progress callbacks commit synchronously, survive reopening, and never affect accounting', t => {
  const h = fixture(t, { disk: true }); const wallet = h.wallet();
  const plan = '  Préparer la scène 🎮\n\tAjouter un personnage.\r\nVérifier les commandes.  ';
  const callback = progress => h.store.updateJobProgress(h.jobId, progress);
  assert.equal(callback({ phase: 'planning' }), true);
  assert.equal(callback({ phase: 'planning' }), false);
  assert.equal(callback({ phase: 'coding', plan }), true);
  const reader = new DatabaseSync(h.filename);
  try {
    const row = reader.prepare('SELECT agent_phase,agent_plan FROM jobs WHERE id = ?').get(h.jobId);
    assert.equal(row.agent_phase, 'coding'); assert.equal(row.agent_plan, plan);
  } finally { reader.close(); }
  h.restart();
  assert.equal(h.row().agent_plan, plan);
  assert.equal(callback({ phase: 'coding', plan }), false);
  assert.equal(callback({ phase: 'validating' }), true);
  h.restart();
  assert.equal(jobView(h.row()).phase, 'validating'); assert.equal(jobView(h.row()).plan, plan);
  assert.deepEqual(h.wallet(), wallet);
  assert.equal(h.store.get('SELECT COUNT(*) AS count FROM ai_usage').count, 0);
});

test('plans are optional, immutable once set, and accepted only on coding updates', t => {
  const h = fixture(t);
  for (const phase of ['planning', 'coding', 'validating']) {
    assert.equal(h.store.updateJobProgress(h.jobId, { phase }), true);
    assert.equal(h.row().agent_plan, null);
  }
  const plan = 'Plan public';
  assert.equal(h.store.updateJobProgress(h.jobId, { phase: 'coding', plan }), true);
  for (const phase of ['planning', 'validating']) {
    const before = h.row();
    assert.throws(() => h.store.updateJobProgress(h.jobId, { phase, plan }), /Invalid agent plan/);
    assert.deepEqual(h.row(), before);
    assert.equal(h.store.updateJobProgress(h.jobId, { phase }), true);
    assert.equal(h.row().agent_plan, plan);
  }
  assert.equal(h.store.updateJobProgress(h.jobId, { phase: 'coding', plan }), true);
  assert.equal(h.store.updateJobProgress(h.jobId, { phase: 'coding' }), false);
  assert.equal(h.store.updateJobProgress(h.jobId, { phase: 'coding', plan }), false);
  const before = h.row();
  for (const changed of ['Changed plan', plan + ' ', '', null, undefined]) {
    assert.throws(() => h.store.updateJobProgress(h.jobId, { phase: 'coding', plan: changed }), /agent plan/);
    assert.deepEqual(h.row(), before);
  }
});

test('progress requires exact own data fields and rejects provider output or reasoning fields', t => {
  const h = fixture(t); const before = h.row(); const wallet = h.wallet();
  const invalid = [undefined, null, false, 1, 'coding', [], ['coding'], {}, new Date(),
    Object.assign([], { phase: 'coding' }), Object.create({ phase: 'coding' }),
    { phase: 'coding', [Symbol('extra')]: true },
    Object.defineProperty({ phase: 'coding' }, 'extra', { value: true }),
    { get phase() { throw new Error('Must not invoke accessor'); } },
    { phase: 'coding', get plan() { throw new Error('Must not invoke accessor'); } }];
  for (const phase of [undefined, null, '', 'Planning', 'publishing', 'running', 'failed', 0, {}, ['coding']]) invalid.push({ phase });
  for (const field of ['status', 'jobId', 'raw', 'logs', 'reasoning', 'chainOfThought', 'output', 'usage']) {
    invalid.push({ phase: 'coding', [field]: 'not a public summary' });
  }
  for (const progress of invalid) {
    assert.throws(() => h.store.updateJobProgress(h.jobId, progress), /Invalid agent/);
    assert.deepEqual(h.row(), before);
  }
  assert.deepEqual(h.wallet(), wallet);
  assert.equal(h.store.updateJobProgress(h.jobId, Object.assign(Object.create(null), { phase: 'planning' })), true);
});

test('plans must be nonempty primitive well-formed UTF-8 strings and reject control characters', t => {
  const h = fixture(t); const before = h.row();
  const invalid = [undefined, null, false, 1, {}, [], new String('Plan'), '', ' \t\r\n ',
    '\ud800', '\udc00', 'bad\ud800text', 'bad\udc00text', 'a'.repeat(8193), 'é'.repeat(4097), '🎮'.repeat(2049)];
  for (let code = 0; code <= 159; code++) {
    if ((code < 32 && ![9, 10, 13].includes(code)) || code >= 127) invalid.push(`Plan${String.fromCharCode(code)}text`);
  }
  for (const plan of invalid) {
    assert.throws(() => h.store.updateJobProgress(h.jobId, { phase: 'coding', plan }), /Invalid agent plan/);
    assert.deepEqual(h.row(), before);
  }
  for (const phase of ['planning', 'validating']) {
    assert.throws(() => h.store.updateJobProgress(h.jobId, { phase, plan: 'Public plan' }), /Invalid agent plan/);
    assert.deepEqual(h.row(), before);
  }
});

for (const [name, plan] of [['ASCII', 'a'.repeat(8192)], ['accented', 'é'.repeat(4096)], ['astral', '🎮'.repeat(2048)]]) {
  test(`plan byte limit accepts exactly 8192 UTF-8 bytes (${name})`, t => {
    const h = fixture(t);
    assert.equal(Buffer.byteLength(plan, 'utf8'), 8192);
    assert.equal(h.store.updateJobProgress(h.jobId, { phase: 'coding', plan }), true);
    assert.equal(h.row().agent_plan, plan);
    assert.throws(() => h.store.updateJobProgress(h.jobId, { phase: 'coding', plan: plan + 'a' }), /Invalid agent plan/);
    assert.equal(h.row().agent_plan, plan);
  });
}

for (const status of ['queued', 'publishing', 'succeeded', 'failed']) {
  test(`late progress callbacks cannot update ${status} jobs, even with identical values`, t => {
    const h = fixture(t, { running: status !== 'queued' });
    const progress = { phase: 'coding', plan: 'Public plan' };
    if (status !== 'queued') h.store.updateJobProgress(h.jobId, progress);
    if (['publishing', 'succeeded'].includes(status)) h.store.preparePublication(h.jobId);
    if (['succeeded', 'failed'].includes(status)) h.store.finishJob(h.jobId, status === 'succeeded');
    assert.equal(h.row().status, status);
    const before = h.row(); const wallet = h.wallet();
    for (const update of [progress, { phase: 'planning' }, { phase: 'validating' }]) {
      assert.throws(() => h.store.updateJobProgress(h.jobId, update), /not running/);
      assert.deepEqual(h.row(), before); assert.deepEqual(h.wallet(), wallet);
    }
  });
}

test('unknown jobs fail without inserting a row or changing other jobs', t => {
  const h = fixture(t); const before = h.row(); const wallet = h.wallet();
  assert.throws(() => h.store.updateJobProgress(randomUUID(), { phase: 'coding', plan: 'Public plan' }), /Unknown job/);
  assert.equal(h.store.get('SELECT COUNT(*) AS count FROM jobs').count, 1);
  assert.deepEqual(h.row(), before); assert.deepEqual(h.wallet(), wallet);
});

test('progress storage failures and outer transaction failures roll back both phase and plan', t => {
  const h = fixture(t); const before = h.row(); const wallet = h.wallet();
  h.store.db.exec(`CREATE TRIGGER reject_progress BEFORE UPDATE OF agent_phase,agent_plan ON jobs
    BEGIN SELECT RAISE(ABORT, 'fixture progress failure'); END;`);
  assert.throws(() => h.store.updateJobProgress(h.jobId, { phase: 'coding', plan: 'Public plan' }), /fixture progress failure/);
  assert.deepEqual(h.row(), before);
  h.store.db.exec('DROP TRIGGER reject_progress');
  assert.throws(() => h.store.transaction(() => {
    h.store.updateJobProgress(h.jobId, { phase: 'coding', plan: 'Public plan' });
    throw new Error('fixture outer rollback');
  }), /fixture outer rollback/);
  assert.deepEqual(h.row(), before); assert.deepEqual(h.wallet(), wallet);
  assert.equal(h.store.updateJobProgress(h.jobId, { phase: 'coding', plan: 'Public plan' }), true);
});

test('old databases migrate additively once with nullable columns and a phase CHECK constraint', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-progress-migration-'));
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
    INSERT INTO jobs VALUES ('j','u','p','r','legacy prompt',3,'running',NULL,'old',NULL);
    INSERT INTO jobs VALUES ('completed','u','p','old-r','old prompt',5,'succeeded',NULL,'old','old');
    INSERT INTO ledger VALUES ('l','u',0,3,'reservation','job:j:reserve','Legacy reservation','old');`);
  const original = legacy.prepare('SELECT * FROM jobs ORDER BY id').all();
  legacy.close(); legacy = null;
  store = new Store(filename);
  const columns = store.all('PRAGMA table_info(jobs)');
  for (const name of ['agent_phase', 'agent_plan']) {
    const matches = columns.filter(column => column.name === name);
    assert.equal(matches.length, 1); assert.equal(matches[0].type, 'TEXT'); assert.equal(matches[0].notnull, 0);
  }
  for (const previous of original) {
    const migrated = store.get('SELECT * FROM jobs WHERE id = ?', previous.id);
    for (const [key, value] of Object.entries(previous)) assert.equal(migrated[key], value, key);
    assert.equal(migrated.agent_phase, null); assert.equal(migrated.agent_plan, null);
    assert.equal(jobView(migrated).phase, null); assert.equal(jobView(migrated).plan, null);
  }
  const wallet = store.wallet('u');
  for (const phase of ['publishing', 'invalid', '']) {
    assert.throws(() => store.run("UPDATE jobs SET agent_phase = ? WHERE id = 'j'", phase), /CHECK constraint failed/);
  }
  for (const phase of ['planning', 'coding', 'validating', null]) store.run("UPDATE jobs SET agent_phase = ? WHERE id = 'j'", phase);
  const plan = '<script>plain text, not HTML</script>\nPlan public';
  store.updateJobProgress('j', { phase: 'coding', plan });
  const persisted = store.all('SELECT * FROM jobs ORDER BY id');
  store.close(); store = new Store(filename);
  assert.deepEqual(store.all('PRAGMA table_info(jobs)'), columns);
  assert.deepEqual(store.all('SELECT * FROM jobs ORDER BY id'), persisted);
  assert.deepEqual(store.wallet('u'), wallet);
  assert.equal(jobView(store.get("SELECT * FROM jobs WHERE id = 'j'")).plan, plan);
  assert.throws(() => store.run("UPDATE jobs SET agent_phase = 'publishing' WHERE id = 'j'"), /CHECK constraint failed/);
  assert.equal(store.updateJobProgress('j', { phase: 'coding', plan }), false);
});
