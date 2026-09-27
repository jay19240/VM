'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { createApplication } = require('../server/app');
const { loadConfig } = require('../server/config');
const { Store } = require('../server/store');
const { acquireLock } = require('../server/lock');
const { fixture: lemonFixture } = require('./lemon-client.test');

function usageRecord(overrides = {}) {
  return { costMicroUsd: 20000, inputTokens: 1000, outputTokens: 200, requests: 1, ...overrides };
}

async function fixture(t, { runner, lemonClient, config: overrides = {} } = {}) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-platform-test-'));
  const engineDir = path.join(temp, 'template');
  await fs.mkdir(path.join(engineDir, 'src/game'), { recursive: true });
  await fs.mkdir(path.join(engineDir, 'src/lib'), { recursive: true });
  await fs.mkdir(path.join(engineDir, 'public'), { recursive: true });
  await fs.writeFile(path.join(engineDir, 'src/game/main.js'), 'export const level = 1;\n');
  await fs.writeFile(path.join(engineDir, 'src/lib/legacy.js'), 'export const immutable = true;\n');
  await fs.writeFile(path.join(engineDir, '.env'), 'PRIVATE_TEMPLATE_FILE=fixture\n');
  const dataDir = path.join(temp, 'data');
  const config = { ...loadConfig({ APP_URL: 'http://localhost:3000' }), engineDir, dataDir,
    databasePath: path.join(dataDir, 'platform.sqlite'), jobTimeoutMs: 1000,
    generationMaxCredits: 3, aiMicroUsdPerCredit: 10000, ...overrides };
  const platform = await createApplication({ config, runner: runner || { enabled: false }, lemonClient });
  const server = platform.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await platform.close();
    // Only this test's verified mkdtemp directory contains throwaway fixtures.
    assert.ok(temp.startsWith(path.join(os.tmpdir(), 'legacy-platform-test-')));
    await fs.rm(temp, { recursive: true, force: true });
  });
  const h = { ...platform, temp, engineDir, base };
  h.request = async (url, { method = 'GET', body, session, origin = config.appUrl, csrf = true } = {}) => {
    const headers = { Origin: origin };
    if (session) {
      headers.Cookie = session.cookie;
      if (csrf) headers['X-CSRF-Token'] = session.csrfToken;
    }
    if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
    return fetch(base + url, { method, body, headers });
  };
  h.register = async (suffix = randomUUID()) => {
    const password = randomBytes(20).toString('hex');
    const email = `test-${suffix}@example.test`;
    const response = await h.request('/api/auth/register', { method: 'POST', body: { email, password, name: 'Créateur test' } });
    assert.equal(response.status, 201);
    const data = await response.json();
    const cookie = response.headers.get('set-cookie').split(';')[0];
    return { ...data, cookie, password, email };
  };
  h.createProject = async (session, name = 'Mon univers') => {
    const response = await h.request('/api/projects', { method: 'POST', session, body: { name } });
    assert.equal(response.status, 201);
    return (await response.json()).project;
  };
  h.fund = (session, amount = 12) => platform.store.credit(session.user.id, amount,
    { kind: 'test', reference: randomUUID(), description: 'Fixture test' });
  h.wait = async id => {
    for (let tries = 0; tries < 100; tries++) {
      const row = platform.store.get('SELECT * FROM jobs WHERE id = ?', id);
      if (['succeeded', 'failed'].includes(row.status)) return row;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail('Generation did not complete');
  };
  return h;
}

test('simulated Aider session publishes only its validated draft with cumulative usage and private progress', async t => {
  let release; let calls = 0; let draftReady = false;
  const gate = new Promise(resolve => { release = resolve; });
  const runner = { enabled: true, async run(args) {
    calls++;
    assert.deepEqual(Object.keys(args).sort(), ['id', 'engineDir', 'gameDir', 'prompt', 'budgetMicroUsd', 'signal', 'onUsage'].sort());
    const { id, engineDir, gameDir, prompt, budgetMicroUsd, signal, onUsage } = args;
    assert.equal(prompt, 'Créer un niveau.'); assert.equal(budgetMicroUsd, 2000000n);
    assert.ok(signal instanceof AbortSignal); assert.equal(signal.aborted, false);
    const root = path.dirname(engineDir);
    assert.equal(gameDir, path.join(root, 'generations', id, 'game'));
    assert.equal(await fs.readFile(path.join(engineDir, 'src/lib/legacy.js'), 'utf8'), 'export const immutable = true;\n');
    assert.equal(await fs.readFile(path.join(gameDir, 'main.js'), 'utf8'), 'export const level = 1;\n');
    assert.equal(h.store.get('SELECT agent_phase FROM jobs WHERE id=?', id).agent_phase, 'coding');
    // Simulate an initial edit followed by a refinement; all reports are session totals.
    assert.equal(onUsage(usageRecord({ costMicroUsd: 1395, inputTokens: 100, outputTokens: 10 })), true);
    await fs.writeFile(path.join(gameDir, 'main.js'), 'export const level = 2;');
    assert.equal(onUsage(usageRecord({ costMicroUsd: 2790, inputTokens: 200, outputTokens: 20, requests: 2 })), true);
    await fs.writeFile(path.join(gameDir, 'level.json'), JSON.stringify({ enemies: 3 }));
    const total = usageRecord({ costMicroUsd: 5580, inputTokens: 400, outputTokens: 40, requests: 3 });
    assert.equal(onUsage(total), true); assert.equal(onUsage({ ...total }), false);
    draftReady = true;
    await Promise.race([gate, new Promise((_, reject) => signal.addEventListener('abort',
      () => reject(new Error('Interrupted test runner')), { once: true }))]);
  } };
  const h = await fixture(t, { runner, config: { generationMaxCredits: 200, jobTimeoutMs: 5000 } });
  const user = await h.register(); const outsider = await h.register(); h.fund(user, 200);
  const project = await h.createProject(user); const route = `/api/projects/${project.id}/generations`;
  const response = await h.request(route, { method: 'POST', session: user,
    body: { prompt: 'Créer un niveau.', budgetCredits: 200, requestId: randomUUID() } });
  assert.equal(response.status, 202);
  const initial = (await response.json()).job;
  for (let tries = 0; tries < 100 && !draftReady; tries++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(draftReady, 'Aider simulation did not prepare its draft');
  const root = path.join(h.config.dataDir, 'users', user.user.id, project.id);
  const live = path.join(root, 'engine/src/game');
  assert.equal(await fs.readFile(path.join(live, 'main.js'), 'utf8'), 'export const level = 1;\n');
  await assert.rejects(fs.stat(path.join(live, 'level.json')), { code: 'ENOENT' });
  const running = (await (await h.request(route, { session: user })).json()).jobs[0];
  assert.equal(running.status, 'running'); assert.equal(running.phase, 'coding'); assert.equal(running.plan, null);
  assert.equal(running.costSource, 'aider'); assert.equal(running.chargedCredits, null);
  assert.equal(running.providerCostMicroUsd, 5580);
  assert.deepEqual(running.usage, { inputTokens: 400, outputTokens: 40, requests: 3 });
  assert.equal(h.store.wallet(user.user.id).balance, 200); assert.equal(h.store.wallet(user.user.id).reserved, 200);
  assert.equal((await h.request(route)).status, 401);
  assert.equal((await h.request(route, { session: outsider })).status, 404);
  assert.equal((await h.request(`/api/events?projectId=${project.id}`, { session: outsider })).status, 404);
  assert.equal((await h.request(`/users/${user.user.id}/${project.id}/generations/${initial.id}/game/main.js`, { session: user })).status, 404);
  for (const privateValue of [h.config.dataDir, 'pricing_json', 'engineDir', 'gameDir']) {
    assert.ok(!JSON.stringify(running).includes(privateValue));
  }
  release(); const job = await h.wait(initial.id);
  assert.equal(job.status, 'succeeded'); assert.equal(job.agent_plan, null); assert.equal(job.agent_phase, 'validating');
  assert.equal(job.actual_cost, 1); assert.equal(job.provider_cost_micro_usd, 5580); assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(job.usage_json), running.usage);
  assert.deepEqual(JSON.parse(job.pricing_json), { provider: 'aider' }); assert.equal(job.micro_usd_per_credit, 10000);
  assert.equal(h.store.get('SELECT count(*) AS n FROM ai_usage WHERE job_id=?', job.id).n, 0);
  assert.equal(h.store.wallet(user.user.id).balance, 199); assert.equal(h.store.wallet(user.user.id).reserved, 0);
  const listed = (await (await h.request(route, { session: user })).json()).jobs[0];
  assert.equal(listed.plan, null); assert.equal(listed.phase, 'validating'); assert.equal(listed.costSource, 'aider');
  assert.equal((await h.request(route, { session: outsider })).status, 404);
  assert.equal(await fs.readFile(path.join(live, 'main.js'), 'utf8'), 'export const level = 2;');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(live, 'level.json'), 'utf8')), { enemies: 3 });
  assert.equal(await fs.readFile(path.join(root, 'generations', job.id, 'previous/main.js'), 'utf8'), 'export const level = 1;\n');
  assert.equal(await fs.readFile(path.join(root, 'engine/src/lib/legacy.js'), 'utf8'), 'export const immutable = true;\n');
  assert.equal(await fs.readFile(path.join(h.engineDir, 'src/game/main.js'), 'utf8'), 'export const level = 1;\n');
});

test('authentication: hashed password, private session cookie, origin/CSRF, login rotation, logout', async t => {
  const h = await fixture(t);
  assert.equal((await h.request('/api/projects')).status, 401);
  const session = await h.register();
  const row = h.store.get('SELECT * FROM users WHERE id = ?', session.user.id);
  assert.ok(row.password_hash !== session.password && row.password_hash.includes(':'));
  assert.equal(row.credits, 0);
  const live = await h.request('/api/session', { session });
  assert.equal((await live.json()).user.id, session.user.id);
  assert.equal(live.headers.get('cache-control'), 'no-store');
  assert.equal((await h.request('/api/projects', { method: 'POST', session, csrf: false, body: { name: 'Refused' } })).status, 403);
  assert.equal((await h.request('/api/projects', { method: 'POST', session, origin: 'https://attacker.test', body: { name: 'Refused' } })).status, 403);
  const failed = await h.request('/api/auth/login', { method: 'POST', body: { email: session.email, password: 'wrong-fixture' } });
  assert.equal(failed.status, 401);
  const login = await h.request('/api/auth/login', { method: 'POST', session, body: { email: session.email.toUpperCase(), password: session.password } });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.ok(cookie.includes('HttpOnly') && cookie.includes('SameSite=Lax'));
  assert.ok(cookie.split(';')[0] !== session.cookie);
  assert.equal((await (await h.request('/api/session', { session })).json()).user, null);
  const newSession = { ...await login.json(), cookie: cookie.split(';')[0] };
  assert.equal((await h.request('/api/auth/logout', { method: 'POST', session: newSession })).status, 204);
  assert.equal((await (await h.request('/api/session', { session: newSession })).json()).user, null);
});

test('secure deployment uses host-only secure cookie; registration validates input and duplicates', async t => {
  const h = await fixture(t, { config: { appUrl: 'https://studio.example.test', secureCookies: true } });
  const session = await h.register();
  assert.ok(session.cookie.startsWith('__Host-legacy_session='));
  const login = await h.request('/api/auth/login', { method: 'POST', body: { email: session.email, password: session.password } });
  assert.ok(login.headers.get('set-cookie').includes('Secure'));
  const duplicate = await h.request('/api/auth/register', { method: 'POST', body: { email: session.email, password: session.password, name: 'Bis' } });
  assert.equal(duplicate.status, 409);
  assert.equal((await h.request('/api/auth/register', { method: 'POST', body: { email: 'bad', password: 'short', name: 'T' } })).status, 400);
});

test('multiple private engine copies under user/project: original intact, secrets excluded, ownership enforced', async t => {
  const h = await fixture(t);
  const alice = await h.register(); const bob = await h.register();
  const one = await h.createProject(alice, '../Affichage uniquement');
  const two = await h.createProject(alice, 'Second');
  const root = path.join(h.config.dataDir, 'users', alice.user.id, one.id, 'engine');
  assert.ok(await fs.stat(path.join(root, 'src/lib/legacy.js')));
  await assert.rejects(fs.stat(path.join(root, '.env')), { code: 'ENOENT' });
  await fs.writeFile(path.join(root, 'src/game/main.js'), 'export const level = 99;');
  assert.equal(await fs.readFile(path.join(h.engineDir, 'src/game/main.js'), 'utf8'), 'export const level = 1;\n');
  assert.equal(await fs.readFile(path.join(h.config.dataDir, 'users', alice.user.id, two.id, 'engine/src/game/main.js'), 'utf8'), 'export const level = 1;\n');
  assert.equal((await (await h.request('/api/projects', { session: alice })).json()).projects.length, 2);
  assert.equal((await (await h.request('/api/projects', { session: bob })).json()).projects.length, 0);
  for (const suffix of ['', '/assets', '/generations']) assert.equal((await h.request(`/api/projects/${one.id}${suffix}`, { session: bob })).status, 404);
  assert.equal((await h.request(`/api/projects/${one.id}/generations`, { method: 'POST', session: bob, body: { prompt: 'test', requestId: randomUUID() } })).status, 404);
});

test('project quotas and auth input types fail safely', async t => {
  const h = await fixture(t, { config: { maxProjects: 1 } });
  const user = await h.register();
  assert.equal((await h.request('/api/projects', { method: 'POST', session: user, body: { name: {} } })).status, 400);
  await h.createProject(user);
  assert.equal((await h.request('/api/projects', { method: 'POST', session: user, body: { name: 'Overflow' } })).status, 409);
});

function form(folder = '', filename = 'sprite.png', content = 'fixture-image') {
  const body = new FormData(); body.append('folder', folder); body.append('file', new Blob([content]), filename); return body;
}
test('assets: upload/download isolation, no overwrite, traversal, hidden paths, symlinks and quotas', async t => {
  const h = await fixture(t, { config: { maxAssetBytes: 1024, maxUserAssetBytes: 20 } });
  const user = await h.register(); const outsider = await h.register(); const project = await h.createProject(user);
  const route = `/api/projects/${project.id}/assets`;
  const result = await h.request(route, { method: 'POST', session: user, body: form('sprites') });
  assert.equal(result.status, 201);
  const file = (await result.json()).file;
  assert.equal(file.folder, 'sprites');
  const download = await h.request(file.downloadUrl, { session: user });
  assert.equal(download.status, 200); assert.ok(download.headers.get('content-disposition').startsWith('attachment'));
  assert.equal(await download.text(), 'fixture-image');
  assert.equal((await h.request(file.downloadUrl, { session: outsider })).status, 404);
  assert.equal((await h.request(route, { method: 'POST', session: user, body: form('sprites') })).status, 409);
  for (const folder of ['../outside', '/absolute', '.augment', 'sprites/../../outside', 'bad\\path']) {
    assert.equal((await h.request(route, { method: 'POST', session: user, body: form(folder, 'x.png', 'x') })).status, 400);
  }
  const assetRoot = path.join(h.config.dataDir, 'users', user.user.id, project.id, 'engine/public/game');
  await fs.symlink(h.temp, path.join(assetRoot, 'link'));
  assert.equal((await h.request(route, { method: 'POST', session: user, body: form('link', 'x.png', 'x') })).status, 400);
  assert.equal((await h.request(route, { method: 'POST', session: user, body: form('', 'other.png', 'too-large-for-quota') })).status, 413);
  assert.equal((await h.request(route, { method: 'POST', session: user, body: form('', 'big.png', 'x'.repeat(1025)) })).status, 413);
  assert.equal((await h.request(route, { method: 'POST', session: outsider, body: form() })).status, 404);
});

test('generation disabled fails before reservation; enabled insufficient credit cannot invoke runner', async t => {
  let calls = 0;
  const runner = { enabled: false, run: async () => { calls++; } };
  const h = await fixture(t, { runner }); const user = await h.register(); const project = await h.createProject(user);
  const route = `/api/projects/${project.id}/generations`;
  assert.equal((await h.request(route, { method: 'POST', session: user, body: { prompt: 'test', requestId: randomUUID() } })).status, 503);
  runner.enabled = true;
  assert.equal((await h.request(route, { method: 'POST', session: user, body: { prompt: 'test', requestId: randomUUID() } })).status, 402);
  assert.equal(calls, 0); assert.equal(h.store.wallet(user.user.id).reserved, 0);
});

test('generation reserves once, idempotent HTTP retries, locks project and debits only after publication', async t => {
  let release; let calls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const h = await fixture(t, { runner: { enabled: true, async run({ id, gameDir, budgetMicroUsd, onUsage, signal }) {
    calls++; assert.equal(budgetMicroUsd, 30000n);
    await Promise.race([gate, new Promise((_, reject) => signal.addEventListener('abort',
      () => reject(new Error('Interrupted test runner')), { once: true }))]);
    const usage = usageRecord();
    assert.equal(usage.costMicroUsd, 20000);
    assert.equal(onUsage(usage), true);
    assert.equal(h.store.get('SELECT provider_cost_micro_usd FROM jobs WHERE id = ?', id).provider_cost_micro_usd, 20000);
    await fs.writeFile(path.join(gameDir, 'main.js'), 'export const level = 2;');
  } } });
  const user = await h.register(); const project = await h.createProject(user); h.fund(user);
  const route = `/api/projects/${project.id}/generations`;
  const body = { prompt: 'Change le niveau', requestId: randomUUID() };
  const responses = await Promise.all([h.request(route, { method: 'POST', session: user, body }), h.request(route, { method: 'POST', session: user, body })]);
  for (const response of responses) assert.equal(response.status, 202);
  const jobs = await Promise.all(responses.map(r => r.json()));
  assert.equal(jobs[0].job.id, jobs[1].job.id);
  assert.equal(h.store.wallet(user.user.id).balance, 12); assert.equal(h.store.wallet(user.user.id).reserved, 3);
  assert.equal((await h.request(route, { method: 'POST', session: user, body: { ...body, prompt: 'autre' } })).status, 409);
  assert.equal((await h.request(route, { method: 'POST', session: user, body: { ...body, budgetCredits: 2 } })).status, 409);
  assert.equal((await h.request(route, { method: 'POST', session: user, body: { ...body, requestId: randomUUID() } })).status, 409);
  assert.equal((await h.request(`/api/projects/${project.id}/assets`, { method: 'POST', session: user, body: form() })).status, 409);
  release(); const job = await h.wait(jobs[0].job.id);
  assert.equal(job.status, 'succeeded'); assert.equal(calls, 1);
  assert.equal(h.store.wallet(user.user.id).balance, 10); assert.equal(h.store.wallet(user.user.id).reserved, 0);
  assert.equal(h.store.wallet(user.user.id).available, 10);
  assert.equal(job.billing_mode, 'metered'); assert.equal(job.micro_usd_per_credit, 10000);
  assert.deepEqual(JSON.parse(job.pricing_json), { provider: 'aider' });
  assert.equal(job.cost, 3); assert.equal(job.actual_cost, 2); assert.equal(job.provider_cost_micro_usd, 20000);
  assert.deepEqual(JSON.parse(job.usage_json), { inputTokens: 1000, outputTokens: 200, requests: 1 });
  assert.equal(h.store.get('SELECT count(*) AS n FROM ai_usage WHERE job_id = ?', job.id).n, 0);
  assert.deepEqual({ ...h.store.get('SELECT amount,reserved_delta FROM ledger WHERE reference = ?', `job:${job.id}:finish`) },
    { amount: -2, reserved_delta: -3 });
  assert.equal((await h.request(route, { method: 'POST', session: user, body: { ...body, budgetCredits: 2 } })).status, 409);
  h.jobs.pause();
  const replay = await h.request(route, { method: 'POST', session: user, body });
  assert.equal(replay.status, 202);
  const view = (await replay.json()).job;
  assert.equal(view.id, job.id); assert.equal(calls, 1);
  assert.equal(view.reservedCost, 3); assert.equal(view.chargedCredits, 2); assert.equal(view.providerCostMicroUsd, 20000);
  assert.deepEqual(view.usage, JSON.parse(job.usage_json)); assert.equal(view.costSource, 'aider');
  assert.equal(h.store.get('SELECT count(*) AS n FROM ledger WHERE reference = ?', `job:${job.id}:finish`).n, 1);
  const source = await fs.readFile(path.join(h.engineDir, 'src/game/main.js'), 'utf8'); assert.equal(source, 'export const level = 1;\n');
  const gameRoot = path.join(h.config.dataDir, 'users', user.user.id, project.id);
  assert.equal(await fs.readFile(path.join(gameRoot, 'engine/src/game/main.js'), 'utf8'), 'export const level = 2;');
  assert.equal(await fs.readFile(path.join(gameRoot, 'generations', job.id, 'previous/main.js'), 'utf8'), source);
});

test('failures, no-op, invalid syntax, symlinks and timeout release reservations without publication', async t => {
  const scenarios = [
    async () => { throw new Error('private diagnostic must not be returned'); },
    async () => {},
    async ({ gameDir }) => fs.writeFile(path.join(gameDir, 'main.js'), 'export const = invalid;'),
    async ({ gameDir }) => fs.symlink('/tmp', path.join(gameDir, 'outside')),
    async ({ gameDir }) => fs.writeFile(path.join(gameDir, 'broken.ts'), 'export const value: = 3;'),
    async ({ signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })),
  ];
  for (let index = 0; index < scenarios.length; index++) await t.test(`scenario ${index}`, async t => {
    const h = await fixture(t, { runner: { enabled: true, async run(args) {
      assert.equal(args.onUsage(usageRecord()), true);
      return scenarios[index](args);
    } }, config: { jobTimeoutMs: 1000 } });
    const user = await h.register(); const project = await h.createProject(user); h.fund(user);
    const response = await h.request(`/api/projects/${project.id}/generations`, { method: 'POST', session: user, body: { prompt: 'test', requestId: randomUUID() } });
    assert.equal(response.status, 202); const id = (await response.json()).job.id;
    const job = await h.wait(id); assert.equal(job.status, 'failed'); assert.ok(!job.error.includes('private'));
    assert.equal(h.store.wallet(user.user.id).balance, 12); assert.equal(h.store.wallet(user.user.id).reserved, 0);
    assert.equal(job.actual_cost, 0); assert.equal(job.provider_cost_micro_usd, 20000);
    assert.equal(JSON.parse(job.usage_json).requests, 1);
    assert.equal(h.store.get('SELECT count(*) AS n FROM ai_usage WHERE job_id = ?', id).n, 0);
    assert.equal(await fs.readFile(path.join(h.config.dataDir, 'users', user.user.id, project.id, 'engine/src/game/main.js'), 'utf8'), 'export const level = 1;\n');
  });
});

test('static UI is served separately with security headers and no private filesystem exposure', async t => {
  const h = await fixture(t);
  const page = await h.request('/'); assert.equal(page.status, 200); assert.ok((await page.text()).includes('LEGACY'));
  assert.ok(page.headers.get('content-security-policy').includes("script-src 'self'"));
  for (const url of ['/engine/src/lib/legacy.js', '/data/platform.sqlite', '/server.js', '/.env']) assert.equal((await h.request(url)).status, 404);
  const user = await h.register();
  assert.equal((await (await h.request('/api/billing/plans', { session: user })).json()).plans.length, 0);
  assert.equal((await h.request('/api/billing/checkout', { method: 'POST', session: user, body: { planId: 'unknown' } })).status, 503);
  assert.equal((await h.request('/api/billing/webhook', { method: 'POST', body: { type: 'invoice.paid' } })).status, 503);
});

test('integer ledger rejects invalid amounts and conflicting references, transactions roll back', () => {
  const store = new Store(':memory:');
  try {
    const id = randomUUID(); store.run('INSERT INTO users(id,email,name,password_hash,created_at) VALUES (?,?,?,?,?)', id, 'ledger@example.test', 'Ledger', 'fixture', new Date().toISOString());
    const details = { kind: 'test', reference: 'invoice-test', description: 'Test' };
    assert.equal(store.credit(id, 10, details), true); assert.equal(store.credit(id, 10, details), false);
    assert.throws(() => store.credit(id, 11, details));
    for (const amount of [0, -1, 0.5, NaN, Infinity, 1e12]) assert.throws(() => store.credit(id, amount, { ...details, reference: randomUUID() }));
    assert.throws(() => store.transaction(() => { store.credit(id, 50, { ...details, reference: 'rollback' }); throw new Error('rollback'); }));
    assert.equal(store.wallet(id).balance, 10); assert.equal(store.wallet(id).entries.length, 1);
  } finally { store.close(); }
});

test('configuration and exclusive coordinator lock fail closed', async t => {
  assert.throws(() => loadConfig({ GENERATION_MAX_CREDITS: '0.1' }));
  assert.throws(() => loadConfig({ AI_MICRO_USD_PER_CREDIT: '0' }));
  assert.throws(() => loadConfig({ MAX_USER_ASSET_BYTES: '-1' }));
  assert.equal(loadConfig({}).maxProjects, 2);
  assert.throws(() => loadConfig({ DATA_DIR: path.resolve('engine/data') }));
  assert.throws(() => loadConfig({ DATA_DIR: path.resolve('web/data') }));
  assert.throws(() => loadConfig({ NODE_ENV: 'production', APP_URL: 'http://example.test' }));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-platform-test-lock-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const unlock = acquireLock(directory); assert.throws(() => acquireLock(directory)); unlock();
  const again = acquireLock(directory); again();
});

test('scheduler unavailable rejects new reservations without reserving credits', async t => {
  const h = await fixture(t, { runner: { enabled: true, run: async () => {} } });
  const user = await h.register(); const project = await h.createProject(user); h.fund(user);
  h.jobs.pause();
  const response = await h.request(`/api/projects/${project.id}/generations`, { method: 'POST', session: user,
    body: { prompt: 'test', requestId: randomUUID() } });
  assert.equal(response.status, 503); assert.equal(h.store.wallet(user.user.id).reserved, 0);
  assert.equal((await (await h.request('/api/session', { session: user })).json()).generationEnabled, false);
});

test('data directory symlinks cannot bypass public-static-directory protection', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-config-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const link = path.join(directory, 'alias');
  await fs.symlink(path.resolve('web'), link);
  assert.throws(() => loadConfig({ DATA_DIR: path.join(link, 'data') }));
});

test('credit-pack routes require authentication/CSRF and ignore client-supplied credit amounts and owners', async t => {
  const lemon = lemonFixture(t, { packsOnly: true });
  const h = await fixture(t, { lemonClient: lemon.client, config: lemon.config });
  const user = await h.register(); const route = '/api/billing/credit-checkout';
  const body = { packId: 'boost', requestId: randomUUID(), credits: 999999, amount: 1, userId: 'someone-else' };
  assert.equal((await h.request('/api/billing/credit-packs')).status, 401);
  assert.equal((await h.request(route, { method: 'POST', body })).status, 401);
  assert.equal((await h.request(route, { method: 'POST', body, session: user, csrf: false })).status, 403);
  const packs = await (await h.request('/api/billing/credit-packs', { session: user })).json();
  assert.equal(packs.packs[0].credits, 50); assert.equal(packs.packs[0].amount, 500);
  assert.equal((await h.request(route, { method: 'POST', body, session: user, origin: 'https://attacker.test' })).status, 403);
  const checkout = await h.request(route, { method: 'POST', body, session: user });
  assert.equal(checkout.status, 200);
  assert.equal((await checkout.json()).url, 'https://fixture-store.lemonsqueezy.com/checkout/custom/fixture');
  assert.equal((await h.request(route, { method: 'POST', body, session: user })).status, 200);
  const purchase = h.store.get('SELECT * FROM lemon_checkout_intents WHERE user_id=? AND request_id=?', user.user.id, body.requestId);
  assert.equal(purchase.user_id, user.user.id); assert.equal(purchase.credits, 50); assert.equal(purchase.amount, 500);
  assert.equal(purchase.kind, 'pack'); assert.equal(purchase.offer_id, 'boost'); assert.equal(purchase.state, 'open');
  assert.equal(lemon.checkouts.get(purchase.checkout_id).attributes.checkout_data.custom.billing_intent, purchase.id);
  assert.equal(lemon.posts(), 1); assert.equal(h.store.wallet(user.user.id).balance, 0);
  assert.equal(lemon.store.get('SELECT count(*) AS n FROM lemon_checkout_intents').n, 0);
  assert.equal(h.store.get('SELECT count(*) AS n FROM lemon_pack_orders').n, 0);
  await h.request('/?billing=credits-success', { session: user });
  assert.equal(h.store.wallet(user.user.id).balance, 0);
});

test('asset quota is aggregate across two projects and independent for each user', async t => {
  const h = await fixture(t, { config: { maxUserAssetBytes: 10 } });
  const alice = await h.register(); const bob = await h.register();
  const one = await h.createProject(alice); const two = await h.createProject(alice);
  const other = await h.createProject(bob);
  const upload = (session, project, filename, content) => h.request(`/api/projects/${project.id}/assets`,
    { method: 'POST', session, body: form('', filename, content) });
  assert.equal((await upload(alice, one, 'one.png', '123456')).status, 201);
  assert.equal((await upload(alice, two, 'two.png', '1234')).status, 201);
  assert.equal((await upload(alice, two, 'overflow.png', 'x')).status, 413);
  assert.equal((await upload(bob, other, 'other.png', '1234567890')).status, 201);
  for (const session of [alice, bob]) {
    const view = await (await h.request('/api/session', { session })).json();
    assert.deepEqual(view.storage, { usedBytes: 10, limitBytes: 10, maxProjects: 2 });
  }
  assert.equal((await h.request('/api/projects', { method: 'POST', session: alice, body: { name: 'Third' } })).status, 409);
  assert.equal(h.store.get('SELECT count(*) AS n FROM assets WHERE project_id = ?', two.id).n, 1);
  await assert.rejects(fs.stat(path.join(h.config.dataDir, 'users', alice.user.id, two.id,
    'engine/public/game/overflow.png')), { code: 'ENOENT' });
});

test('concurrent cross-project uploads cannot exceed the shared user quota', async t => {
  const h = await fixture(t, { config: { maxUserAssetBytes: 10 } });
  const user = await h.register(); const projects = [await h.createProject(user), await h.createProject(user)];
  const responses = await Promise.all(projects.map(project => h.request(`/api/projects/${project.id}/assets`,
    { method: 'POST', session: user, body: form('', 'race.png', '123456') })));
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 413]);
  const row = h.store.get(`SELECT count(*) AS n, sum(a.size) AS bytes FROM assets a
    JOIN projects p ON p.id=a.project_id WHERE p.user_id=?`, user.user.id);
  assert.equal(row.n, 1); assert.equal(row.bytes, 6);
  for (let index = 0; index < projects.length; index++) {
    const root = path.join(h.config.dataDir, 'users', user.user.id, projects[index].id, 'engine/public/game');
    assert.deepEqual(await fs.readdir(root), responses[index].status === 201 ? ['race.png'] : []);
  }
  const loser = projects[responses.findIndex(response => response.status === 413)];
  assert.equal((await h.request(`/api/projects/${loser.id}/assets`, { method: 'POST', session: user,
    body: form('', 'remaining.png', '1234') })).status, 201);
  const view = await (await h.request('/api/session', { session: user })).json();
  assert.deepEqual(view.storage, { usedBytes: 10, limitBytes: 10, maxProjects: 2 });
});

test('generation budgets reject invalid values before reservation or runner invocation', async t => {
  let calls = 0;
  const h = await fixture(t, { runner: { enabled: true, async run() { calls++; } } });
  const user = await h.register(); const project = await h.createProject(user); h.fund(user);
  for (const budgetCredits of [0, -1, 1.5, '3', null, true, {}, [], 4, Number.MAX_SAFE_INTEGER + 1]) {
    const response = await h.request(`/api/projects/${project.id}/generations`, { method: 'POST', session: user,
      body: { prompt: 'Change the game', requestId: randomUUID(), budgetCredits } });
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 0); assert.equal(h.store.get('SELECT count(*) AS n FROM jobs').n, 0);
  assert.equal(h.store.wallet(user.user.id).balance, 12); assert.equal(h.store.wallet(user.user.id).reserved, 0);
  assert.equal(h.store.get("SELECT count(*) AS n FROM ledger WHERE kind='reservation'").n, 0);
});

test('valid explicit and omitted generation budgets reach the runner and settle actual usage', async t => {
  const budgets = [];
  const h = await fixture(t, { runner: { enabled: true, async run({ gameDir, budgetMicroUsd, onUsage }) {
    budgets.push(budgetMicroUsd);
    assert.equal(onUsage(usageRecord({ costMicroUsd: 10000, inputTokens: 0 })), true);
    await fs.writeFile(path.join(gameDir, 'main.js'), `export const level = ${budgets.length + 1};`);
  } } });
  const user = await h.register(); const project = await h.createProject(user); h.fund(user);
  for (const budgetCredits of [1, 2, 3, undefined]) {
    const body = { prompt: 'Change the game', requestId: randomUUID(),
      ...(budgetCredits === undefined ? {} : { budgetCredits }) };
    const response = await h.request(`/api/projects/${project.id}/generations`, { method: 'POST', session: user, body });
    assert.equal(response.status, 202);
    const job = await h.wait((await response.json()).job.id);
    assert.equal(job.status, 'succeeded'); assert.equal(job.cost, budgetCredits ?? 3);
    assert.equal(job.actual_cost, 1); assert.equal(job.provider_cost_micro_usd, 10000);
  }
  assert.deepEqual(budgets, [10000n, 20000n, 30000n, 30000n]);
  assert.equal(h.store.wallet(user.user.id).balance, 8); assert.equal(h.store.wallet(user.user.id).reserved, 0);
  const view = await (await h.request('/api/session', { session: user })).json();
  assert.equal(view.generationMaxCredits, 3); assert.equal(view.microUsdPerCredit, 10000);
});

for (const scenario of ['missing-usage', 'invalid-usage', 'over-budget', 'failure-after-usage']) {
  test(`changed game with ${scenario} fails without publication or charge`, async t => {
    const h = await fixture(t, { runner: { enabled: true, async run({ gameDir, onUsage }) {
      await fs.writeFile(path.join(gameDir, 'main.js'), 'export const level = 2;');
      if (scenario === 'missing-usage') return;
      const record = usageRecord({ costMicroUsd: scenario === 'over-budget' ? 40000 : 20000 });
      if (scenario === 'invalid-usage') record.costMicroUsd = '20000';
      assert.equal(onUsage(record), true);
      if (scenario === 'failure-after-usage') throw new Error('private diagnostic must not escape');
    } } });
    const user = await h.register(); const project = await h.createProject(user); h.fund(user);
    const route = `/api/projects/${project.id}/generations`;
    const response = await h.request(route, { method: 'POST', session: user,
      body: { prompt: 'Change the game', requestId: randomUUID(), budgetCredits: 3 } });
    assert.equal(response.status, 202);
    const job = await h.wait((await response.json()).job.id);
    assert.equal(job.status, 'failed'); assert.equal(job.actual_cost, 0);
    assert.ok(!job.error.includes('private'));
    const recorded = ['over-budget', 'failure-after-usage'].includes(scenario);
    assert.equal(job.provider_cost_micro_usd, scenario === 'over-budget' ? 40000 : recorded ? 20000 : 0);
    assert.equal(h.store.get('SELECT count(*) AS n FROM ai_usage WHERE job_id=?', job.id).n, 0);
    assert.equal(JSON.parse(job.usage_json)?.requests ?? 0, recorded ? 1 : 0);
    assert.equal(h.store.wallet(user.user.id).balance, 12); assert.equal(h.store.wallet(user.user.id).reserved, 0);
    assert.deepEqual({ ...h.store.get('SELECT amount,reserved_delta,kind FROM ledger WHERE reference=?', `job:${job.id}:finish`) },
      { amount: 0, reserved_delta: -3, kind: 'release' });
    const root = path.join(h.config.dataDir, 'users', user.user.id, project.id);
    assert.equal(await fs.readFile(path.join(root, 'engine/src/game/main.js'), 'utf8'), 'export const level = 1;\n');
    await assert.rejects(fs.stat(path.join(root, 'generations', job.id, 'previous')), { code: 'ENOENT' });
    const view = (await (await h.request(route, { session: user })).json()).jobs[0];
    assert.equal(view.chargedCredits, 0); assert.equal(view.providerCostMicroUsd, job.provider_cost_micro_usd);
    assert.deepEqual(view.usage, JSON.parse(job.usage_json));
  });
}

test('paid invoice entitlements raise project and shared asset quotas only until the paid period expires', async t => {
  const lemon = lemonFixture(t);
  const h = await fixture(t, { lemonClient: lemon.client, config: { ...lemon.config, maxUserAssetBytes: 10,
    plans: lemon.config.plans.map(plan => ({ ...plan, maxProjects: 3, assetQuotaBytes: 20 })) } });
  const user = await h.register(); const outsider = await h.register();
  const one = await h.createProject(user); const two = await h.createProject(user);
  const storage = async session => (await (await h.request('/api/session', { session })).json()).storage;
  const free = { usedBytes: 10, limitBytes: 10, maxProjects: 2 };
  const upload = await h.request(`/api/projects/${one.id}/assets`, { method: 'POST', session: user,
    body: form('', 'one.png', '1234567890') });
  assert.equal(upload.status, 201); const file = (await upload.json()).file;
  assert.deepEqual(await storage(user), free);
  assert.equal((await h.request('/api/projects', { method: 'POST', session: user, body: { name: 'Too soon' } })).status, 409);
  const requestId = randomUUID();
  assert.equal((await h.request('/api/billing/checkout', { method: 'POST', session: user,
    body: { planId: 'monthly', requestId } })).status, 200);
  const intent = h.store.get('SELECT * FROM lemon_checkout_intents WHERE user_id=? AND request_id=?', user.user.id, requestId);
  assert.deepEqual(await storage(user), free); // Checkout alone grants nothing.
  const now = Math.floor(Date.now() / 1000);
  // Seed verified local billing tables, not a public credit or entitlement endpoint.
  h.store.run("UPDATE lemon_checkout_intents SET state='paid' WHERE id=?", intent.id);
  h.store.run(`INSERT INTO lemon_subscriptions
    (id,intent_id,user_id,status,cancelled,ends_at,renews_at,created_at,updated_at,billing_anchor,review)
    VALUES (?,?,?,'active',0,NULL,?,?,?,15,0)`, '900', intent.id, user.user.id, now + 60, now - 60, now * 1000000);
  assert.deepEqual(await storage(user), free); // An active subscription alone is still not a paid period.
  h.store.run("INSERT INTO lemon_invoices VALUES (?,?,'ignored',?,?,0)", '901', '900', now - 60, now + 60);
  assert.deepEqual(await storage(user), free);
  h.store.run("UPDATE lemon_invoices SET outcome='credited',credits=? WHERE id=?", intent.credits, '901');
  assert.deepEqual(await storage(user), { usedBytes: 10, limitBytes: 20, maxProjects: 3 });
  await h.createProject(user, 'Paid third project');
  assert.equal((await h.request('/api/projects', { method: 'POST', session: user, body: { name: 'Fourth' } })).status, 409);
  assert.equal((await h.request(`/api/projects/${two.id}/assets`, { method: 'POST', session: user,
    body: form('', 'two.png', '1234567890') })).status, 201);
  assert.deepEqual(await storage(user), { usedBytes: 20, limitBytes: 20, maxProjects: 3 });
  assert.deepEqual(await storage(outsider), { usedBytes: 0, limitBytes: 10, maxProjects: 2 });
  t.mock.timers.tick(60000);
  assert.deepEqual(await storage(user), { usedBytes: 20, limitBytes: 10, maxProjects: 2 });
  assert.equal((await h.request('/api/projects', { method: 'POST', session: user, body: { name: 'Expired' } })).status, 409);
  assert.equal((await h.request(`/api/projects/${two.id}/assets`, { method: 'POST', session: user,
    body: form('', 'expired.png', 'x') })).status, 413);
  assert.equal((await (await h.request('/api/projects', { session: user })).json()).projects.length, 3);
  assert.equal(await (await h.request(file.downloadUrl, { session: user })).text(), '1234567890');
});

test('only the raw-body Lemon webhook bypasses origin and CSRF, and valid HMAC grants a pack once', async t => {
  const lemon = lemonFixture(t, { packsOnly: true });
  const h = await fixture(t, { lemonClient: lemon.client, config: lemon.config });
  const user = await h.register(); const requestId = randomUUID();
  assert.equal((await h.request('/api/billing/credit-checkout', { method: 'POST', session: user,
    body: { packId: 'boost', requestId } })).status, 200);
  const intent = h.store.get('SELECT * FROM lemon_checkout_intents WHERE user_id=? AND request_id=?', user.user.id, requestId);
  const order = lemon.order(intent);
  // Whitespace is intentional: signing re-serialized JSON must not authenticate these bytes.
  const raw = Buffer.from(JSON.stringify(lemon.event(order, 'order_created'), null, 2) + '\n');
  const send = (body, signature, origin) => fetch(h.base + '/api/billing/webhook', { method: 'POST', body,
    headers: { 'Content-Type': 'application/json', ...(signature ? { 'x-signature': signature } : {}),
      ...(origin ? { Origin: origin } : {}) } });
  const calls = lemon.calls.length;
  assert.equal((await send(raw)).status, 400);
  assert.equal((await send(raw, '0'.repeat(64), 'https://attacker.test')).status, 400);
  assert.equal((await send(raw, lemon.sign(Buffer.from(JSON.stringify(JSON.parse(raw)))))).status, 400);
  assert.equal((await send(Buffer.concat([raw, Buffer.from(' ')]), lemon.sign(raw))).status, 400);
  const malformed = Buffer.from('{');
  assert.equal((await send(malformed, lemon.sign(malformed))).status, 400);
  assert.equal(lemon.calls.length, calls); assert.equal(h.store.wallet(user.user.id).balance, 0);
  assert.equal(h.store.get('SELECT count(*) AS n FROM lemon_events').n, 0);
  const accepted = await send(raw, lemon.sign(raw), 'https://attacker.test');
  assert.equal(accepted.status, 200); assert.deepEqual(await accepted.json(), { received: true });
  assert.equal((await send(raw, lemon.sign(raw))).status, 200);
  assert.equal(h.store.wallet(user.user.id).balance, 50);
  assert.equal(h.store.get('SELECT count(*) AS n FROM lemon_pack_orders').n, 1);
  assert.equal(h.store.get('SELECT count(*) AS n FROM lemon_events').n, 1);
  assert.equal(h.store.get("SELECT count(*) AS n FROM ledger WHERE kind='credit_purchase'").n, 1);
  assert.equal((await h.request('/api/billing/credit-checkout', { method: 'POST', session: user, csrf: false,
    body: { packId: 'boost', requestId: randomUUID() } })).status, 403);
  assert.equal((await h.request('/api/billing/credit-checkout', { method: 'POST', session: user, origin: 'https://attacker.test',
    body: { packId: 'boost', requestId: randomUUID() } })).status, 403);
});

module.exports = { fixture };
