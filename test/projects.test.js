'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createProjects } = require('../server/files');

async function fixture(t, run = async () => {}, overrides = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'poc-projects-'));
  const config = { dataDir: path.join(directory, 'data'), engineDir: path.join(directory, 'engine'), aiderTimeoutMs: 1000, ...overrides };
  const template = path.join(config.engineDir, 'src/game');
  await fs.mkdir(template, { recursive: true });
  await fs.writeFile(path.join(template, 'main.js'), '// original');
  const runner = { enabled: true, run };
  const projects = createProjects({ config, runner });
  t.after(async () => {
    await projects.close().catch(() => {});
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { projects, config, runner, template, root: id => path.join(config.dataDir, 'projects', id) };
}

test('copies persist without database, exclude hidden/dependency files and leave existing data alone', async t => {
  const h = await fixture(t);
  for (const name of ['.git', '.private', 'node_modules', 'dist']) {
    await fs.mkdir(path.join(h.config.engineDir, name));
    await fs.writeFile(path.join(h.config.engineDir, name, 'marker'), 'not copied');
  }
  await fs.mkdir(h.config.dataDir, { recursive: true });
  const legacy = path.join(h.config.dataDir, 'platform.sqlite');
  await fs.writeFile(legacy, 'untouched existing file');
  const project = await h.projects.create('  Demo  ');
  assert.equal(project.name, 'Demo');
  assert.equal(project.generating, false);
  assert.equal(await h.projects.readCode(project.id), '// original');
  for (const name of ['.git', '.private', 'node_modules', 'dist']) {
    await assert.rejects(fs.stat(path.join(h.root(project.id), 'engine', name)), { code: 'ENOENT' });
  }
  const restarted = createProjects({ config: h.config, runner: h.runner });
  assert.deepEqual(await restarted.list(), [project]);
  await restarted.close();
  assert.equal(await fs.readFile(legacy, 'utf8'), 'untouched existing file');
  for (const name of ['', ' ', 'x'.repeat(81), {}, null]) {
    await assert.rejects(h.projects.create(name), { status: 400 });
  }
  await assert.rejects(h.projects.get('../engine'), { status: 404 });
});

test('generation publishes a draft, saves previous code and does not perform syntax/type checks', async t => {
  let args;
  const h = await fixture(t, async value => {
    args = value;
    await fs.writeFile(path.join(value.gameDir, 'main.js'), 'deliberately invalid JavaScript {{');
    await fs.writeFile(path.join(value.gameDir, 'level.ts'), 'type Broken = ;');
  });
  const project = await h.projects.create('Demo');
  const generated = await h.projects.generate(project.id, '  Add double jump  ');
  assert.equal(generated.generating, false);
  assert.equal(args.prompt, 'Add double jump');
  assert.deepEqual(Object.keys(args).sort(), ['engineDir', 'gameDir', 'id', 'prompt', 'signal']);
  assert.equal(await h.projects.readCode(project.id), 'deliberately invalid JavaScript {{');
  assert.equal(await fs.readFile(path.join(h.template, 'main.js'), 'utf8'), '// original');
  assert.equal(await fs.readFile(path.join(path.dirname(args.gameDir), 'previous/main.js'), 'utf8'), '// original');
  assert.equal(await fs.readFile(path.join(h.root(project.id), 'engine/src/game/level.ts'), 'utf8'), 'type Broken = ;');
});

test('nonzero run, timeout and unsafe output never replace the live project', async t => {
  for (const kind of ['error', 'timeout', 'symlink', 'hardlink', 'hidden', 'missing-main', 'large']) {
    await t.test(kind, async t => {
      const h = await fixture(t, async ({ gameDir, signal }) => {
        if (kind === 'error') throw new Error('run failed');
        if (kind === 'timeout') {
          await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
          signal.throwIfAborted();
        }
        if (kind === 'symlink') await fs.symlink(h.template, path.join(gameDir, 'escape'));
        if (kind === 'hardlink') await fs.link(path.join(gameDir, 'main.js'), path.join(gameDir, 'linked.js'));
        if (kind === 'hidden') await fs.writeFile(path.join(gameDir, '.hidden'), 'no');
        if (kind === 'missing-main') await fs.unlink(path.join(gameDir, 'main.js'));
        if (kind === 'large') await fs.writeFile(path.join(gameDir, 'huge.js'), Buffer.alloc(2 * 1024 ** 2 + 1));
      }, { aiderTimeoutMs: 30 });
      const project = await h.projects.create('Demo');
      await assert.rejects(h.projects.generate(project.id, 'Change something'));
      assert.equal(await h.projects.readCode(project.id), '// original');
      assert.equal((await h.projects.get(project.id)).generating, false);
    });
  }
});

test('rejects concurrent operations without queueing; shutdown waits for abort and prevents new work', async t => {
  const started = Promise.withResolvers();
  const h = await fixture(t, async ({ signal }) => {
    started.resolve();
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    signal.throwIfAborted();
  });
  const first = await h.projects.create('First');
  const second = await h.projects.create('Second');
  const pending = h.projects.generate(first.id, 'Wait');
  const rejected = assert.rejects(pending);
  await started.promise;
  assert.equal((await h.projects.get(first.id)).generating, true);
  await assert.rejects(h.projects.generate(second.id, 'Wait'), { status: 409 });
  await assert.rejects(h.projects.create('Third'), { status: 409 });
  await h.projects.close();
  await rejected;
  assert.equal(h.projects.available, false);
  await assert.rejects(h.projects.generate(first.id, 'No'), { status: 503 });
});

test('failed Docker cleanup blocks new work and keeps close unsuccessful for operator recovery', async t => {
  const failure = Object.assign(new Error('cleanup failed'), { cleanupFailed: true });
  const h = await fixture(t, async () => { throw failure; });
  const project = await h.projects.create('Demo');
  await assert.rejects(h.projects.generate(project.id, 'Change'));
  assert.equal(h.projects.available, false);
  await assert.rejects(h.projects.create('Blocked'), { status: 503 });
  await assert.rejects(h.projects.close(), /cleanup failed/);
  assert.equal(await h.projects.readCode(project.id), '// original');
});

test('incomplete project copies and symlinked directories are not listed', async t => {
  const h = await fixture(t);
  await fs.symlink(h.template, path.join(h.config.engineDir, 'forbidden'));
  await assert.rejects(h.projects.create('Bad template'));
  assert.deepEqual(await h.projects.list(), []);
});
