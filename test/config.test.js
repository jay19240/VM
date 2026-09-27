'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { loadConfig } = require('../server/config');

test('minimal local defaults need no credentials', () => {
  const config = loadConfig({});
  const root = path.resolve(__dirname, '..');
  assert.deepEqual(config, {
    root, engineDir: path.join(root, 'engine'), dataDir: path.join(root, 'data', 'poc'),
    host: '127.0.0.1', port: 3000,
    aiderModel: 'anthropic/claude-sonnet-4-6', aiderImage: 'paulgauthier/aider:v0.86.2',
    anthropicApiKey: '', openaiApiKey: '', aiderTimeoutMs: 600000
  });
  assert.deepEqual(loadConfig({ LEMON_PLANS: 'not-json', STRIPE_PLANS: 'obsolete',
    JOB_TIMEOUT_SECONDS: 'invalid', APP_URL: 'not-a-url', TRUST_PROXY: 'loopback' }), config);
});

test('only loopback HOST is accepted and binding is always IPv4 loopback', () => {
  for (const HOST of ['localhost', '127.0.0.1']) assert.equal(loadConfig({ HOST }).host, '127.0.0.1');
  for (const HOST of ['', '0.0.0.0', '::', '::1', 'localhost.example.test', '127.1', ' localhost']) {
    assert.throws(() => loadConfig({ HOST }), /HOST/);
  }
});

test('port and Aider timeout have bounded integer values', () => {
  for (const PORT of ['1', '65535']) assert.equal(loadConfig({ PORT }).port, Number(PORT));
  for (const PORT of ['0', '65536', '-1', '1.5', 'NaN']) assert.throws(() => loadConfig({ PORT }), /PORT/);
  for (const AIDER_TIMEOUT_SECONDS of ['1', '1800']) {
    assert.equal(loadConfig({ AIDER_TIMEOUT_SECONDS }).aiderTimeoutMs, Number(AIDER_TIMEOUT_SECONDS) * 1000);
  }
  for (const AIDER_TIMEOUT_SECONDS of ['0', '1801', '-1', '1.5', 'Infinity', 'invalid']) {
    assert.throws(() => loadConfig({ AIDER_TIMEOUT_SECONDS }), /AIDER_TIMEOUT_SECONDS/);
  }
});

test('removed commercial settings are ignored', () => {
  const live = { NODE_ENV: 'production', APP_URL: 'https://studio.example.test',
    LEMON_API_KEY: randomBytes(24).toString('hex') };
  assert.deepEqual(loadConfig(live), loadConfig({}));
});
test('Aider defaults and provider-prefixed model overrides do not require configured credentials', () => {
  const defaults = loadConfig({});
  assert.equal(defaults.aiderModel, 'anthropic/claude-sonnet-4-6');
  assert.equal(defaults.aiderImage, 'paulgauthier/aider:v0.86.2');
  assert.equal(Boolean(defaults.anthropicApiKey), false); assert.equal(Boolean(defaults.openaiApiKey), false);
  for (const aiderModel of ['anthropic/claude-sonnet-4-6', 'anthropic/custom-model_1.2', 'openai/gpt-4.1', 'openai/custom-model']) {
    assert.equal(loadConfig({ AIDER_MODEL: aiderModel }).aiderModel, aiderModel);
  }
  const image = 'registry.example.test/tools/aider:v0.86.2';
  assert.equal(loadConfig({ AIDER_DOCKER_IMAGE: image }).aiderImage, image);
  const env = { ANTHROPIC_API_KEY: randomBytes(24).toString('hex'), OPENAI_API_KEY: randomBytes(24).toString('hex') };
  const configured = loadConfig(env);
  assert.ok(configured.anthropicApiKey === env.ANTHROPIC_API_KEY);
  assert.ok(configured.openaiApiKey === env.OPENAI_API_KEY);
});
test('Aider model provider prefixes and Docker image arguments fail closed', () => {
  for (const model of ['claude-sonnet-4-6', 'google/gemini', 'azure/gpt-4.1', 'Anthropic/claude',
    'anthropic/', 'openai/', 'openai/model/extra', 'anthropic/model name', 'openai/model;command',
    'openai/model\n', `anthropic/${'x'.repeat(101)}`]) {
    assert.throws(() => loadConfig({ AIDER_MODEL: model }), /AIDER_MODEL/);
  }
  for (const image of ['--privileged', 'aider image', 'aider;command', 'aider$(command)', 'x'.repeat(202)]) {
    assert.throws(() => loadConfig({ AIDER_DOCKER_IMAGE: image }), /AIDER_DOCKER_IMAGE/);
  }
});

test('DATA_DIR cannot be a source directory or an ancestor of the repository', () => {
  const { root } = loadConfig({});
  for (const directory of ['engine', 'web', 'server', 'src', 'test', 'scripts', '.git', 'node_modules']) {
    for (const suffix of ['', 'nested/data']) {
      assert.throws(() => loadConfig({ DATA_DIR: path.join(root, directory, suffix) }), /DATA_DIR/);
    }
  }
  for (const DATA_DIR of [root, path.dirname(root), path.parse(root).root]) {
    assert.throws(() => loadConfig({ DATA_DIR }), /DATA_DIR/);
  }
  assert.equal(loadConfig({ DATA_DIR: './data/custom' }).dataDir, path.resolve('data/custom'));
});

test('DATA_DIR protections follow symlinks and reject dangling links', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'poc-config-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { root } = loadConfig({});
  for (const name of ['web', 'engine', 'server', 'test']) {
    const link = path.join(directory, name);
    fs.symlinkSync(path.join(root, name), link, 'dir');
    assert.throws(() => loadConfig({ DATA_DIR: path.join(link, 'missing', 'data') }), /DATA_DIR/);
  }
  const ancestor = path.join(directory, 'ancestor');
  fs.symlinkSync(path.dirname(root), ancestor, 'dir');
  assert.throws(() => loadConfig({ DATA_DIR: ancestor }), /DATA_DIR/);
  const dangling = path.join(directory, 'dangling');
  fs.symlinkSync(path.join(directory, 'missing'), dangling, 'dir');
  assert.throws(() => loadConfig({ DATA_DIR: path.join(dangling, 'data') }), /DATA_DIR/);
  const safe = path.join(directory, 'web-sibling', 'data');
  assert.equal(loadConfig({ DATA_DIR: safe }).dataDir, safe);
});
