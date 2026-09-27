'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { start } = require('../server');
const { loadConfig } = require('../server/config');
const { acquireLock } = require('../server/lock');

test('HTTP startup works without providers and shutdown releases the exclusive data lock', { timeout: 10000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-startup-test-'));
  let platform;
  t.after(async () => {
    await platform?.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  // Deliberately isolated from real environment keys and the repository data directory.
  const config = { ...loadConfig({ DATA_DIR: directory }), port: 0 };
  platform = await start({ config });
  const base = `http://127.0.0.1:${platform.server.address().port}`;
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Legacy/);
  const session = await fetch(base + '/api/session');
  assert.equal(session.status, 200);
  const data = await session.json();
  assert.equal(data.user, null);
  assert.equal(data.generationEnabled, false);
  assert.equal(data.billingEnabled, false);
  assert.equal(data.aiModel, config.aiderModel);
  const privateRoute = await fetch(base + '/api/projects');
  assert.equal(privateRoute.status, 401);
  await privateRoute.json();
  assert.throws(() => acquireLock(directory));
  await Promise.all([platform.close(), platform.close()]);
  assert.equal(platform.server.listening, false);
  const release = acquireLock(directory);
  release();
});
