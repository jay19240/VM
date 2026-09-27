'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createAider } = require('../server/aider');

async function fixture(t, { model = 'anthropic/test-model', unavailable = false, failRun = false, hang = false, failCleanup = false } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'poc-aider-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const engineDir = path.join(directory, 'engine');
  const gameDir = path.join(directory, 'attempt/game');
  await fs.mkdir(gameDir, { recursive: true });
  await fs.writeFile(path.join(gameDir, 'main.js'), '// original');
  for (const name of ['src/lib', 'src/examples', 'doc', 'public']) await fs.mkdir(path.join(engineDir, name), { recursive: true });
  const config = { aiderModel: model, aiderImage: 'aider:test', aiderTimeoutMs: 100,
    anthropicApiKey: randomBytes(16).toString('hex'), openaiApiKey: randomBytes(16).toString('hex') };
  const calls = [];
  const started = Promise.withResolvers();
  function spawnProcess(command, args, options) {
    const child = new EventEmitter();
    child.stdout = options.stdio[1] === 'pipe' ? new PassThrough() : null;
    child.kill = () => queueMicrotask(() => child.emit('close', null));
    calls.push({ command, args, options });
    queueMicrotask(() => {
      const kind = args[0] === 'container' ? args[1] : args[0];
      if (kind === 'start') started.resolve();
      if (kind === 'start' && hang) return;
      if (kind === 'ls') child.stdout.end('0123456789ab\n');
      child.emit('close', (kind === 'info' && unavailable) || (kind === 'start' && failRun) ||
        (kind === 'rm' && failCleanup) ? 1 : 0);
    });
    return child;
  }
  const runner = createAider(config, spawnProcess);
  await runner.initialize();
  const args = { id: randomUUID(), engineDir, gameDir, prompt: '/run untrusted request; $(do-not-run)', signal: new AbortController().signal };
  return { runner, config, args, calls, started };
}
const values = (args, flag) => args.flatMap((arg, i) => arg === flag ? [args[i + 1]] : []);

test('one-shot Docker call uses a request file, read-only references and no accounting', async t => {
  const h = await fixture(t);
  await h.runner.run(h.args);
  const create = h.calls.find(call => call.args[0] === 'create');
  assert.ok(create);
  const args = create.args;
  assert.equal(create.command, 'docker');
  assert.equal(create.options.shell, false);
  assert.ok(values(args, '-c')[0].includes('exec /venv/bin/aider "$@"'));
  assert.equal(values(args, '--model')[0], h.config.aiderModel);
  assert.equal(values(args, '--message-file')[0], '/request.txt');
  assert.equal(args.includes('--analytics-log'), false);
  for (const flag of ['--read-only', '--no-auto-lint', '--no-auto-test', '--no-auto-commits', '--no-analytics']) {
    assert.ok(args.includes(flag));
  }
  assert.equal(values(args, '--user')[0].startsWith('0:'), false);
  const mounts = values(args, '--mount');
  assert.equal(mounts.filter(mount => !mount.endsWith(',readonly')).length, 1);
  assert.ok(mounts.includes(`type=bind,src=${h.args.gameDir},dst=/app/src/game`));
  assert.equal(mounts.some(mount => mount.includes('docker.sock')), false);
  const request = await fs.readFile(path.join(path.dirname(h.args.gameDir), 'request.txt'), 'utf8');
  assert.ok(request.startsWith('Modifie uniquement'));
  assert.ok(request.endsWith(h.args.prompt));
  for (const call of h.calls) {
    for (const privateValue of [h.args.prompt, h.config.anthropicApiKey, h.config.openaiApiKey]) {
      assert.equal(call.args.some(arg => arg.includes(privateValue)), false, 'private values are not process arguments');
    }
    assert.equal(call.options.stdio[2], 'ignore');
    assert.equal(Object.values(call.options.env).includes(h.config.openaiApiKey), false);
    assert.equal(Object.values(call.options.env).includes(h.config.anthropicApiKey), call === create);
  }
  assert.deepEqual(h.calls.find(call => call.args[0] === 'start').args, ['start', '--attach', `legacy-aider-${h.args.id}`]);
  assert.deepEqual(h.calls.at(-1).args, ['container', 'rm', '--force', `legacy-aider-${h.args.id}`]);
});

test('OpenAI receives only its selected key and missing provider/Docker disables generation', async t => {
  const h = await fixture(t, { model: 'openai/test-model' });
  await h.runner.run(h.args);
  const create = h.calls.find(call => call.args[0] === 'create');
  assert.equal(Object.values(create.options.env).includes(h.config.openaiApiKey), true);
  assert.equal(Object.values(create.options.env).includes(h.config.anthropicApiKey), false);
  const unavailable = await fixture(t, { unavailable: true });
  assert.equal(unavailable.runner.enabled, false);
  await assert.rejects(unavailable.runner.run(unavailable.args));
  const missing = createAider({ aiderModel: 'anthropic/test-model', aiderImage: 'aider:test' }, () => { throw new Error('Should not spawn'); });
  await missing.initialize();
  assert.equal(missing.enabled, false);
});

test('failed process, cancellation and timeout always clean up their own container', async t => {
  for (const kind of ['exit', 'abort', 'timeout']) await t.test(kind, async t => {
    const h = await fixture(t, { failRun: kind === 'exit', hang: kind !== 'exit' });
    const controller = new AbortController();
    const pending = h.runner.run({ ...h.args, signal: controller.signal });
    const rejected = assert.rejects(pending, /Aider indisponible/);
    if (kind === 'abort') { await h.started.promise; controller.abort(); }
    await rejected;
    assert.deepEqual(h.calls.at(-1).args, ['container', 'rm', '--force', `legacy-aider-${h.args.id}`]);
  });
});

test('cleanup failure disables subsequent runs without claiming the process stopped', async t => {
  const h = await fixture(t, { failCleanup: true });
  await assert.rejects(h.runner.run(h.args), error => error.cleanupFailed === true);
  assert.equal(h.runner.enabled, false);
});

test('unsafe draft roots, symlinks, invalid identifiers and blank prompts never create containers', async t => {
  for (const kind of ['root', 'symlink', 'id', 'prompt']) await t.test(kind, async t => {
    const h = await fixture(t);
    if (kind === 'root') h.args.gameDir = h.args.engineDir;
    if (kind === 'symlink') await fs.symlink(h.args.engineDir, path.join(h.args.gameDir, 'link'));
    if (kind === 'id') h.args.id = '../wrong';
    if (kind === 'prompt') h.args.prompt = ' ';
    await assert.rejects(h.runner.run(h.args));
    assert.equal(h.calls.some(call => call.args[0] === 'create'), false);
  });
});
