'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { start, createApplication } = require('../server');
const { loadConfig } = require('../server/config');
const { acquireLock } = require('../server/lock');

async function fixture(t, runner) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'poc-http-'));
  let platform;
  t.after(async () => {
    await platform?.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  // No process.env, real credentials, Docker, or writes to the repository template.
  const config = { ...loadConfig({ DATA_DIR: path.join(directory, 'data') }),
    engineDir: path.join(directory, 'engine'), port: 0 };
  await fs.mkdir(path.join(config.engineDir, 'src', 'game'), { recursive: true });
  await fs.writeFile(path.join(config.engineDir, 'src', 'game', 'main.js'), '// initial game\n');
  platform = await start({ config, runner });
  return platform;
}

// Real HTTP, including raw Host headers that browser fetch cannot set.
function request(platform, pathname, { body, headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: platform.server.address().port,
      path: pathname, method, agent: false,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }
    }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('error', reject);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, text,
            data: res.headers['content-type']?.includes('application/json') ? JSON.parse(text) : null });
        } catch (error) { reject(error); }
      });
    });
    req.setTimeout(5000, () => req.destroy(new Error('HTTP test timed out')));
    req.on('error', reject);
    req.end(body === undefined || typeof body === 'string' ? body : JSON.stringify(body));
  });
}

test('HTTP smoke: no providers, project create/list/code, static UI and exclusive lock', { timeout: 10000 }, async t => {
  const signals = ['SIGTERM', 'SIGINT'].map(name => process.listenerCount(name));
  const platform = await fixture(t);
  const { config, server } = platform;
  assert.equal(server.address().address, '127.0.0.1');
  const page = await request(platform, '/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.match(page.headers['content-security-policy'], /script-src 'self'/);
  assert.doesNotMatch(page.headers['content-security-policy'], /unsafe-inline|unsafe-eval/);
  assert.equal(page.headers['x-content-type-options'], 'nosniff');
  const settings = await request(platform, '/api/config');
  assert.deepEqual(settings.data, { model: config.aiderModel, generationEnabled: false });
  assert.equal(settings.headers['cache-control'], 'no-store');
  assert.deepEqual((await request(platform, '/api/projects')).data, { projects: [] });
  const created = await request(platform, '/api/projects', { body: { name: 'First game' } });
  assert.equal(created.status, 201);
  const { project } = created.data;
  assert.deepEqual(Object.keys(project).sort(), ['createdAt', 'generating', 'id', 'name']);
  assert.equal(project.name, 'First game');
  assert.equal(project.generating, false);
  assert.equal(typeof project.id, 'string');
  assert.ok(Number.isFinite(Date.parse(project.createdAt)));
  assert.deepEqual((await request(platform, '/api/projects')).data, { projects: [project] });
  assert.deepEqual((await request(platform, `/api/projects/${project.id}/code`)).data, { code: '// initial game\n' });
  assert.equal((await request(platform, `/api/projects/${project.id}/generate`, { body: { prompt: 'Add a tree' } })).status, 503);
  assert.equal((await request(platform, '/api/projects/missing/code')).status, 404);
  assert.equal((await request(platform, '/api/projects', { body: { name: '' } })).status, 400);
  await fs.writeFile(path.join(config.dataDir, 'never-public.js'), '// private file');
  for (const url of ['/data/never-public.js', '/.server.lock', '/engine/src/game/main.js',
    `/projects/${project.id}/main.js`, '/api/session', '/api/events', '/api/wallet']) {
    assert.equal((await request(platform, url)).status, 404, url);
  }
  assert.throws(() => acquireLock(config.dataDir));
  await assert.rejects(start({ config }));
  const closing = platform.close();
  assert.equal(platform.close(), closing);
  await closing;
  assert.equal(server.listening, false);
  assert.equal(server.listenerCount('error'), 0);
  assert.deepEqual(['SIGTERM', 'SIGINT'].map(name => process.listenerCount(name)), signals);
  acquireLock(config.dataDir)();
});

test('API rejects rebinding, cross-site requests, forms and malformed/large JSON', { timeout: 10000 }, async t => {
  const platform = await fixture(t);
  const host = `127.0.0.1:${platform.server.address().port}`;
  for (const Host of ['attacker.example', 'localhost.attacker.example', '127.0.0.1.attacker.example',
    '127.1', '[::1]', 'localhost:65536', 'localhost@attacker.example', 'localhost, attacker.example']) {
    const response = await request(platform, '/api/config', { headers: { Host, 'X-Forwarded-Host': host } });
    assert.equal(response.status, 403, Host);
  }
  for (const Host of ['localhost', '127.0.0.1', `localhost:${platform.server.address().port}`]) {
    assert.equal((await request(platform, '/api/config', { headers: { Host } })).status, 200);
  }
  for (const Origin of ['https://attacker.example', 'null', `https://${host}`, `http://${host}/`, '']) {
    assert.equal((await request(platform, '/api/projects', { body: { name: 'Blocked' }, headers: { Origin } })).status, 403);
  }
  for (const pathname of ['/api/config', '/api/projects']) {
    assert.equal((await request(platform, pathname, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  }
  assert.equal((await request(platform, '/api/projects', { body: { name: 'Blocked' },
    headers: { Origin: `http://${host}`, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  for (const type of ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain']) {
    assert.equal((await request(platform, '/api/projects', { body: 'name=Blocked', headers: { 'Content-Type': type } })).status, 415);
  }
  for (const body of ['{"name":"parser-marker"', '[]', 'null', '42']) {
    const response = await request(platform, '/api/projects', { body });
    assert.equal(response.status, 400);
    assert.doesNotMatch(response.text, /parser-marker|SyntaxError|stack/);
  }
  assert.equal((await request(platform, '/api/projects', { body: { name: 'x'.repeat(65536) } })).status, 413);
  assert.deepEqual((await request(platform, '/api/projects')).data, { projects: [] });
  assert.equal((await request(platform, '/api/projects', { body: { name: 'Local browser' },
    headers: { Origin: `http://${host}`, 'Sec-Fetch-Site': 'same-origin' } })).status, 201);
});

test('generation returns project and code as JSON and sanitizes failures', { timeout: 10000 }, async t => {
  let initialized = false;
  let fail = false;
  const code = '// generated code, not executable by the UI\n';
  const runner = {
    enabled: true,
    async initialize() { initialized = true; },
    async cleanup() {},
    async run({ gameDir }) {
      if (fail) throw new Error('provider-internal-marker /private/provider-file');
      await fs.writeFile(path.join(gameDir, 'main.js'), code);
    }
  };
  const platform = await fixture(t, runner);
  assert.equal(initialized, true);
  assert.equal((await request(platform, '/api/config')).data.generationEnabled, true);
  const { project } = (await request(platform, '/api/projects', { body: { name: 'Generated' } })).data;
  const route = `/api/projects/${project.id}/generate`;
  assert.equal((await request(platform, route, { body: { prompt: '' } })).status, 400);
  const response = await request(platform, route, { body: { prompt: 'Add a tree' } });
  assert.equal(response.status, 200);
  assert.equal(response.data.project.id, project.id);
  assert.equal(response.data.project.generating, false);
  assert.equal(response.data.code, code);
  assert.match(response.headers['content-type'], /application\/json/);
  fail = true;
  const failed = await request(platform, route, { body: { prompt: 'Fail safely' } });
  assert.ok(failed.status >= 500);
  assert.deepEqual(Object.keys(failed.data), ['error']);
  assert.doesNotMatch(failed.text, /provider-internal-marker|private\/provider-file|stack/);
});

test('only one generation runs globally; shutdown aborts and waits before HTTP close or unlock', { timeout: 10000 }, async t => {
  const started = Promise.withResolvers();
  const aborted = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const runner = {
    enabled: true, async initialize() {}, async cleanup() {},
    async run({ signal }) {
      started.resolve();
      await new Promise(resolve => {
        if (signal.aborted) resolve();
        else signal.addEventListener('abort', resolve, { once: true });
      });
      aborted.resolve();
      await finish.promise;
      throw new Error('Generation interrupted');
    }
  };
  const platform = await fixture(t, runner);
  try {
    const first = (await request(platform, '/api/projects', { body: { name: 'First' } })).data.project;
    const second = (await request(platform, '/api/projects', { body: { name: 'Second' } })).data.project;
    const generation = request(platform, `/api/projects/${first.id}/generate`, { body: { prompt: 'Wait' } });
    await started.promise;
    assert.equal((await request(platform, `/api/projects/${second.id}/generate`, { body: { prompt: 'Conflict' } })).status, 409);
    const stopping = platform.close();
    assert.equal(platform.close(), stopping);
    await aborted.promise;
    assert.equal(platform.server.listening, true);
    assert.throws(() => acquireLock(platform.config.dataDir));
    assert.equal((await request(platform, '/api/projects')).status, 503);
    finish.resolve();
    await Promise.all([stopping, generation]);
    assert.equal(platform.server.listening, false);
    acquireLock(platform.config.dataDir)();
  } finally {
    finish.resolve();
    await platform.close();
  }
});

test('initialization and listen failures release their locks without adding signal handlers', { timeout: 10000 }, async t => {
  const platform = await fixture(t);
  const signals = ['SIGTERM', 'SIGINT'].map(name => process.listenerCount(name));
  const config = { ...platform.config, dataDir: path.join(path.dirname(platform.config.dataDir), 'failed'),
    port: platform.server.address().port };
  const runner = { enabled: false, async initialize() { throw new Error('Initialization failed'); } };
  await assert.rejects(createApplication({ config, runner }), /Initialization failed/);
  acquireLock(config.dataDir)();
  await assert.rejects(start({ config }), { code: 'EADDRINUSE' });
  acquireLock(config.dataDir)();
  assert.deepEqual(['SIGTERM', 'SIGINT'].map(name => process.listenerCount(name)), signals);
});
