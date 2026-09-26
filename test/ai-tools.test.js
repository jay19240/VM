'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createAITools } = require('../server/ai-tools');

async function fixture(t) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-tools-test-'));
  const engineDir = path.join(temp, 'engine'); const gameDir = path.join(temp, 'draft');
  for (const relative of ['src/lib', 'src/game', 'docs', 'examples', 'public/game']) await fs.mkdir(path.join(engineDir, relative), { recursive: true });
  await fs.mkdir(gameDir);
  await fs.writeFile(path.join(gameDir, 'main.js'), 'export const draft = true;');
  await fs.writeFile(path.join(engineDir, 'src/game/main.js'), 'export const live = true;');
  await fs.writeFile(path.join(engineDir, 'src/lib/engine.js'), 'export const immutable = true;');
  await fs.writeFile(path.join(engineDir, 'docs/api.md'), 'Safe documentation');
  await fs.writeFile(path.join(engineDir, 'examples/demo.js'), 'export const demo = true;');
  await fs.writeFile(path.join(engineDir, 'public/game/asset.png'), Buffer.from([1, 2, 3]));
  await fs.writeFile(path.join(engineDir, '.env'), 'private fixture');
  await fs.writeFile(path.join(engineDir, 'public/game/.env'), 'private fixture');
  await fs.writeFile(path.join(engineDir, 'config.json'), '{}');
  const opened = [];
  // Only remove this test's own verified mkdtemp tree, never a repository path.
  t.after(async () => { for (const tools of opened) tools.close(); await fs.rm(temp, { recursive: true, force: true }); });
  const open = overrides => { const tools = createAITools({ engineDir, gameDir, ...overrides }); opened.push(tools); return tools; };
  return { temp, engineDir, gameDir, open };
}
const read = (tools, filename, offset = 0, limit = 16000) => tools.execute('read_file', { path: filename, offset, limit });
const write = (tools, filename, content) => tools.execute('write_game_file', { path: filename, content });
const remove = (tools, filename) => tools.execute('delete_game_file', { path: filename });

test('tools read only allowed text roots, resolve src/game to staging, and list asset paths without contents', async t => {
  const h = await fixture(t); const tools = h.open();
  assert.match(read(tools, 'src/game/main.js').content, /draft/);
  assert.match(read(tools, 'src/lib/engine.js').content, /immutable/);
  assert.equal(read(tools, 'docs/api.md', 5, 4).content, 'docu');
  assert.match(read(tools, 'examples/demo.js').content, /demo/);
  assert.deepEqual(tools.execute('list_assets', {}), { results: ['public/game/asset.png'], truncated: false });
  for (const filename of ['.env', 'config.json', 'public/game/asset.png', 'public/game/.env', 'src/game/file.pem']) assert.throws(() => read(tools, filename));
  const listing = tools.execute('list_files', { scope: 'src/game' });
  assert.deepEqual(listing.results, ['src/game/main.js']);
});

test('read-only agent tools deny mutations even when called directly, not just via advertised definitions', async t => {
  const h = await fixture(t); const tools = h.open({ readOnly: true });
  assert.ok(!tools.definitions.some(tool => ['write_game_file', 'delete_game_file'].includes(tool.name)));
  assert.match(read(tools, 'src/game/main.js').content, /draft/);
  assert.match(read(tools, 'src/lib/engine.js').content, /immutable/);
  assert.throws(() => tools.validate('write_game_file', { path: 'src/game/new.js', content: 'changed' }));
  assert.throws(() => write(tools, 'src/game/main.js', 'changed'));
  assert.throws(() => write(tools, 'src/game/new.js', 'changed'));
  assert.throws(() => remove(tools, 'src/game/main.js'));
  assert.equal(await fs.readFile(path.join(h.gameDir, 'main.js'), 'utf8'), 'export const draft = true;');
  await assert.rejects(fs.stat(path.join(h.gameDir, 'new.js')), { code: 'ENOENT' });
});

test('engine layout roots take precedence and retain virtual paths for listing, reading and search', async t => {
  const h = await fixture(t);
  for (const [scope, actual, filename] of [['examples', 'src/examples', 'demo.js'], ['docs', 'doc', 'api.md']]) {
    await fs.mkdir(path.join(h.engineDir, actual), { recursive: true });
    await fs.writeFile(path.join(h.engineDir, actual, filename), 'Preferred engine text');
    await fs.writeFile(path.join(h.engineDir, scope, 'legacy-only.md'), 'Legacy-only text');
  }
  const tools = h.open();
  for (const [scope, filename] of [['examples', 'demo.js'], ['docs', 'api.md']]) {
    const virtual = `${scope}/${filename}`;
    assert.deepEqual(tools.execute('list_files', { scope }), { results: [virtual], truncated: false });
    assert.equal(read(tools, virtual).content, 'Preferred engine text');
    assert.deepEqual(tools.execute('search_files', { scope, query: 'Preferred' }), {
      results: [{ path: virtual, offset: 0, excerpt: 'Preferred engine text' }], truncated: false,
    });
    assert.throws(() => read(tools, `${scope}/legacy-only.md`)); // No per-file fallback.
    assert.throws(() => write(tools, virtual, 'bad'));
    assert.throws(() => remove(tools, virtual));
  }
  for (const filename of ['src/examples/demo.js', 'doc/api.md']) assert.throws(() => read(tools, filename));
});

test('scope fallbacks cannot bypass symlinks or non-directory preferred roots', async t => {
  for (const [scope, actual] of [['examples', 'src/examples'], ['docs', 'doc']]) {
    const h = await fixture(t); const tools = h.open();
    const preferred = path.join(h.engineDir, actual);
    const filename = scope === 'examples' ? 'demo.js' : 'api.md';
    for (const kind of ['symlink', 'dangling', 'file']) {
      if (kind === 'file') await fs.writeFile(preferred, 'not a directory');
      else await fs.symlink(path.join(h.engineDir, kind === 'symlink' ? scope : 'missing'), preferred);
      assert.throws(() => tools.execute('list_files', { scope }));
      assert.throws(() => tools.execute('search_files', { scope, query: 'Safe' }));
      assert.throws(() => read(tools, `${scope}/${filename}`));
      await fs.unlink(preferred);
    }
    assert.ok(read(tools, `${scope}/${filename}`).content); // Absent preferred root uses the legacy layout.
  }
});

test('package and Blender assets are listed but never exposed through text tools', async t => {
  const h = await fixture(t); const tools = h.open();
  for (const filename of ['scene.pak', 'scene.blend', 'UPPER.PAK', 'UPPER.BLEND']) {
    await fs.writeFile(path.join(h.engineDir, 'public', filename), Buffer.from([0xff, 0, 0xfe]));
    for (const scope of ['src/game', 'src/lib', 'examples', 'docs', 'public']) {
      assert.throws(() => read(tools, `${scope}/${filename}`));
      assert.throws(() => write(tools, `${scope}/${filename}`, 'bad'));
    }
  }
  const listing = tools.execute('list_assets', {});
  assert.equal(listing.truncated, false);
  assert.deepEqual(listing.results.sort(), ['public/UPPER.BLEND', 'public/UPPER.PAK', 'public/game/asset.png', 'public/scene.blend', 'public/scene.pak']);
});

test('write/create/delete operate only on staged code; live game and library stay unchanged', async t => {
  const h = await fixture(t); const tools = h.open();
  write(tools, 'src/game/main.js', 'export const draft = 2;');
  write(tools, 'src/game/levels/one.ts', 'export const level: number = 1;');
  assert.match(await fs.readFile(path.join(h.gameDir, 'levels/one.ts'), 'utf8'), /level/);
  remove(tools, 'src/game/levels/one.ts');
  await assert.rejects(fs.stat(path.join(h.gameDir, 'levels/one.ts')), { code: 'ENOENT' });
  assert.throws(() => remove(tools, 'src/game/main.js'));
  write(tools, 'src/game/' + 'd/'.repeat(12) + 'deep.js', 'export const deep = true;');
  assert.match(read(tools, 'src/game/' + 'd/'.repeat(12) + 'deep.js').content, /deep/);
  assert.equal(await fs.readFile(path.join(h.engineDir, 'src/game/main.js'), 'utf8'), 'export const live = true;');
  assert.equal(await fs.readFile(path.join(h.engineDir, 'src/lib/engine.js'), 'utf8'), 'export const immutable = true;');
  assert.ok(!(await fs.readdir(h.gameDir)).some(n => n.startsWith('.')));
  for (const filename of ['src/lib/engine.js', 'docs/api.md', 'examples/demo.js']) {
    assert.throws(() => write(tools, filename, 'bad')); assert.throws(() => remove(tools, filename));
  }
});

test('traversal, absolute paths, hidden files, invalid names and excessive depth cannot escape', async t => {
  const h = await fixture(t); const tools = h.open();
  const paths = ['../main.js', '/tmp/main.js', 'src/game/../lib/engine.js', 'src/game//main.js',
    'src/game/./main.js', 'src/game/.env', 'src/game/.hidden/main.js', 'src/game/x\\main.js',
    'src/game/a:main.js', 'src/game/main.js\0', 'src/game/a\nmain.js', 'src/game/' + 'a'.repeat(101) + '.js',
    'src/game/' + 'level/'.repeat(13) + 'main.js', 'src/game/x.sh'];
  for (const filename of paths) {
    assert.throws(() => read(tools, filename)); assert.throws(() => write(tools, filename, 'bad')); assert.throws(() => remove(tools, filename));
  }
  assert.throws(() => h.open({ gameDir: path.join(h.engineDir, 'src/game') }));
  assert.throws(() => h.open({ gameDir: h.engineDir }));
  assert.throws(() => h.open({ gameDir: h.temp }));
  // The configured template can be separate from the per-project engine.
  assert.throws(() => h.open({ templateDir: h.gameDir }));
});

test('symlink leaves, intermediate directories and aliased roots are rejected', async t => {
  const h = await fixture(t); const tools = h.open();
  const target = path.join(h.engineDir, 'src/lib/engine.js');
  await fs.symlink(target, path.join(h.gameDir, 'linked.js'));
  assert.throws(() => read(tools, 'src/game/linked.js'));
  assert.throws(() => write(tools, 'src/game/linked.js', 'bad'));
  assert.throws(() => remove(tools, 'src/game/linked.js'));
  assert.throws(() => h.open());
  await fs.unlink(path.join(h.gameDir, 'linked.js'));
  await fs.symlink(path.join(h.engineDir, 'src/lib'), path.join(h.gameDir, 'linkdir'));
  assert.throws(() => read(tools, 'src/game/linkdir/engine.js'));
  assert.throws(() => write(tools, 'src/game/linkdir/new.js', 'bad'));
  assert.throws(() => remove(tools, 'src/game/linkdir/engine.js'));
  assert.match(read(tools, 'src/game/main.js').content, /draft/);
  assert.match(read(tools, 'src/lib/engine.js').content, /immutable/);
  await fs.symlink(h.gameDir, path.join(h.temp, 'alias'));
  assert.throws(() => h.open({ gameDir: path.join(h.temp, 'alias') }));
  await fs.symlink(h.temp, path.join(h.temp, 'parent-alias'));
  assert.throws(() => h.open({ gameDir: path.join(h.temp, 'parent-alias/draft') }));
  assert.equal(await fs.readFile(target, 'utf8'), 'export const immutable = true;');
});

test('failed opens and rejected traversals close only their own descriptors, even after reuse', async t => {
  const h = await fixture(t);
  const originalOpen = fsSync.openSync; const originalClose = fsSync.closeSync;
  const owned = new Set(); const invalidCloses = [];
  const openMock = t.mock.method(fsSync, 'openSync', (...args) => {
    const fd = originalOpen(...args);
    assert.ok(!owned.has(fd), 'an open descriptor must not be reused'); owned.add(fd);
    return fd;
  });
  const closeMock = t.mock.method(fsSync, 'closeSync', fd => {
    if (!owned.has(fd)) invalidCloses.push(fd);
    assert.ok(owned.has(fd), 'must not double-close or close an unowned descriptor');
    originalClose(fd); owned.delete(fd);
  });
  try {
    const tools = h.open(); const roots = [...owned].sort((a, b) => a - b);
    assert.equal(roots.length, 2);
    const rootStats = roots.map(fd => fsSync.fstatSync(fd));
    for (let i = 0; i < 3; i++) {
      const link = path.join(h.gameDir, 'linked.js');
      fsSync.symlinkSync(path.join(h.engineDir, 'src/lib/engine.js'), link);
      assert.throws(() => h.open());
      assert.deepEqual([...owned].sort((a, b) => a - b), roots);
      fsSync.unlinkSync(link);
      const intermediate = path.join(h.gameDir, 'linkdir');
      fsSync.symlinkSync(path.join(h.engineDir, 'src/lib'), intermediate);
      assert.throws(() => read(tools, 'src/game/linkdir/engine.js'));
      assert.throws(() => h.open());
      fsSync.unlinkSync(intermediate);
      const alias = path.join(h.temp, 'alias');
      fsSync.symlinkSync(h.gameDir, alias);
      assert.throws(() => h.open({ gameDir: alias }));
      fsSync.unlinkSync(alias);
      write(tools, 'src/game/nested/file.js', 'export const safe = true;');
      assert.match(read(tools, 'src/game/nested/file.js').content, /safe/);
      assert.match(read(tools, 'src/game/main.js').content, /draft/);
      assert.match(read(tools, 'src/lib/engine.js').content, /immutable/);
      assert.deepEqual([...owned].sort((a, b) => a - b), roots);
      roots.forEach((fd, index) => {
        const stat = fsSync.fstatSync(fd);
        assert.equal(stat.dev, rootStats[index].dev); assert.equal(stat.ino, rootStats[index].ino);
      });
    }
    tools.close(); assert.equal(owned.size, 0);
    const reused = fsSync.openSync(path.join(h.gameDir, 'main.js'), 'r');
    try { tools.close(); assert.ok(fsSync.fstatSync(reused).isFile()); }
    finally { fsSync.closeSync(reused); }
    assert.equal(owned.size, 0);
    assert.deepEqual(invalidCloses, []); // Cleanup errors must not be hidden by an expected refusal.
  } finally { openMock.mock.restore(); closeMock.mock.restore(); }
});

test('directory substitutions between inspection and open are refused without leaking descriptors', async t => {
  for (const replacement of ['directory', 'symlink']) await t.test(replacement, async t => {
    const h = await fixture(t);
    const branch = path.join(h.gameDir, 'branch');
    await fs.mkdir(branch);
    await fs.writeFile(path.join(branch, 'engine.js'), 'original branch');
    const tools = h.open(); const originalOpen = fsSync.openSync;
    let swapped = false; let child;
    const openMock = t.mock.method(fsSync, 'openSync', (filename, ...args) => {
      if (!swapped && filename.endsWith('/branch')) {
        swapped = true;
        fsSync.renameSync(branch, path.join(h.temp, 'original-branch'));
        if (replacement === 'symlink') fsSync.symlinkSync(path.join(h.engineDir, 'src/lib'), branch);
        else {
          fsSync.mkdirSync(branch);
          fsSync.writeFileSync(path.join(branch, 'engine.js'), 'substituted branch');
        }
        child = originalOpen(filename, ...args);
        return child;
      }
      return originalOpen(filename, ...args);
    });
    try {
      assert.throws(() => read(tools, 'src/game/branch/engine.js'));
      assert.equal(swapped, true);
      if (child !== undefined) assert.throws(() => fsSync.fstatSync(child), { code: 'EBADF' });
      assert.match(read(tools, 'src/game/main.js').content, /draft/);
      assert.match(read(tools, 'src/lib/engine.js').content, /immutable/);
    } finally { openMock.mock.restore(); }
  });
});

test('hardlinked files cannot be read, overwritten or deleted, including preexisting draft links', async t => {
  const h = await fixture(t); const tools = h.open();
  const target = path.join(h.engineDir, 'src/lib/engine.js');
  await fs.link(target, path.join(h.gameDir, 'linked.js'));
  assert.throws(() => read(tools, 'src/game/linked.js'));
  assert.throws(() => read(tools, 'src/lib/engine.js'));
  assert.throws(() => write(tools, 'src/game/linked.js', 'bad'));
  assert.throws(() => remove(tools, 'src/game/linked.js'));
  assert.throws(() => h.open());
  assert.equal(await fs.readFile(target, 'utf8'), 'export const immutable = true;');
});

test('held root descriptors prevent a substituted stage path from redirecting writes to live code', async t => {
  const h = await fixture(t); const tools = h.open();
  const moved = path.join(h.temp, 'moved-draft');
  await fs.rename(h.gameDir, moved);
  await fs.symlink(path.join(h.engineDir, 'src/game'), h.gameDir);
  write(tools, 'src/game/main.js', 'export const draft = 3;');
  assert.equal(await fs.readFile(path.join(moved, 'main.js'), 'utf8'), 'export const draft = 3;');
  assert.equal(await fs.readFile(path.join(h.engineDir, 'src/game/main.js'), 'utf8'), 'export const live = true;');
});

test('unknown names and extra, missing or wrongly typed arguments are explicitly rejected', async t => {
  const h = await fixture(t); const tools = h.open();
  const bad = [['execute', {}], ['list_assets', { path: '/' }], ['list_files', { scope: 'public' }],
    ['write_game_file', { path: 'src/game/main.js', content: 'x', extra: 1 }], ['write_game_file', { path: 'src/game/main.js' }],
    ['write_game_file', { path: 'src/game/main.js', content: null }], ['read_file', { path: 'src/game/main.js', offset: -1, limit: 1 }],
    ['read_file', { path: 'src/game/main.js', offset: 0, limit: 16001 }], ['list_assets', []],
    ['search_files', { scope: 'src/game', query: '' }], ['search_files', { scope: 'src/game', query: 'a'.repeat(201) }]];
  for (const [name, args] of bad) assert.throws(() => tools.execute(name, args));
});

test('file and aggregate size/count limits match inspectGame and oversized reads fail', async t => {
  const h = await fixture(t); const tools = h.open(); const max = 2 * 1024 ** 2;
  assert.throws(() => write(tools, 'src/game/large.js', 'x'.repeat(max + 1)));
  await fs.writeFile(path.join(h.engineDir, 'docs/large.txt'), 'x'.repeat(max + 1));
  assert.throws(() => read(tools, 'docs/large.txt'));
  await Promise.all(Array.from({ length: 199 }, (_, i) => fs.writeFile(path.join(h.gameDir, `f${i}.js`), '')));
  assert.throws(() => write(tools, 'src/game/extra.js', 'x'));
  write(tools, 'src/game/main.js', 'export const draft = 2;');
  const other = await fixture(t); const limited = other.open();
  for (let i = 0; i < 4; i++) write(limited, `src/game/large${i}.js`, 'x'.repeat(max));
  assert.throws(() => write(limited, 'src/game/overflow.js', 'x'.repeat(max)));
});

test('literal search is bounded by file count, byte budget and excerpt length; no regex interpretation', async t => {
  const h = await fixture(t); const tools = h.open();
  await fs.writeFile(path.join(h.gameDir, 'literal.js'), '/* (a+)+$ */');
  const literal = tools.execute('search_files', { scope: 'src/game', query: '(a+)+$' });
  assert.equal(literal.results.length, 1); assert.equal(literal.results[0].path, 'src/game/literal.js');
  await Promise.all(Array.from({ length: 70 }, (_, i) => fs.writeFile(path.join(h.gameDir, `f${i}.js`), '/* needle */')));
  const bounded = tools.execute('search_files', { scope: 'src/game', query: 'needle' });
  assert.equal(bounded.results.length, 50); assert.equal(bounded.truncated, true);
  assert.ok(bounded.results.every(r => r.excerpt.length <= 320));
  const controller = new AbortController(); const cancelled = h.open({ signal: controller.signal }); controller.abort();
  assert.throws(() => cancelled.execute('list_assets', {}));
  tools.close(); assert.throws(() => read(tools, 'src/game/main.js'));
});
