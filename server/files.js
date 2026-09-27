const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const httpError = status => Object.assign(new Error('Projet indisponible.'), { status });

// Filesystem safety only: no syntax, TypeScript, build or gameplay checks.
async function checkFiles(root) {
  let files = 0;
  let bytes = 0;
  async function visit(directory, depth = 0) {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || depth > 12) throw new Error('Invalid directory');
    for (const name of await fs.readdir(directory)) {
      if (name.startsWith('.')) throw new Error('Hidden game file');
      const filename = path.join(directory, name);
      const info = await fs.lstat(filename);
      if (info.isSymbolicLink()) throw new Error('Symlink refused');
      if (info.isDirectory()) { await visit(filename, depth + 1); continue; }
      if (!info.isFile() || info.nlink !== 1 || ++files > 200 || info.size > 2 * 1024 ** 2 ||
          (bytes += info.size) > 10 * 1024 ** 2) throw new Error('Invalid game file');
    }
  }
  await visit(root);
  if (!(await fs.lstat(path.join(root, 'main.js'))).isFile()) throw new Error('Missing main.js');
}

function createProjects({ config, runner }) {
  const directory = path.join(config.dataDir, 'projects');
  let active = null;
  let stopped = false;
  let cleanupError = null;
  function root(id) {
    if (typeof id !== 'string' || !UUID.test(id)) throw httpError(404);
    return path.join(directory, id);
  }
  async function get(id) {
    try {
      const location = root(id);
      const stat = await fs.lstat(location);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw httpError(404);
      const project = JSON.parse(await fs.readFile(path.join(location, 'project.json'), 'utf8'));
      return { id, name: project.name, createdAt: project.createdAt, generating: active?.id === id };
    } catch (error) {
      if (error.code === 'ENOENT') throw httpError(404);
      throw error;
    }
  }
  async function list() {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const projects = [];
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !UUID.test(entry.name)) continue;
      try { projects.push(await get(entry.name)); }
      catch (error) { if (error.status !== 404) throw error; } // Ignore unfinished copies.
    }
    return projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function exclusive(id, action) {
    if (stopped || cleanupError) throw httpError(503);
    if (active) throw httpError(409);
    const controller = new AbortController();
    const promise = Promise.resolve().then(() => action(controller.signal));
    active = { id, controller, promise };
    try { return await promise; }
    catch (error) {
      if (error.cleanupFailed) cleanupError = error;
      throw error;
    } finally { active = null; }
  }
  async function create(name) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) throw httpError(400);
    const id = randomUUID();
    await exclusive(id, async signal => {
      const engine = path.join(root(id), 'engine');
      await fs.mkdir(root(id), { recursive: true, mode: 0o700 });
      await fs.cp(config.engineDir, engine, { recursive: true, errorOnExist: true, force: false,
        filter: async filename => {
          signal.throwIfAborted();
          const relative = path.relative(config.engineDir, filename);
          if (relative.split(path.sep).some(part => part.startsWith('.') ||
              ['node_modules', 'dist', 'target', 'coverage'].includes(part))) return false;
          const stat = await fs.lstat(filename);
          if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error('Invalid template');
          return true;
        } });
      await checkFiles(path.join(engine, 'src/game'));
      signal.throwIfAborted();
      await fs.writeFile(path.join(root(id), 'project.json'), JSON.stringify({ name: name.trim(), createdAt: new Date().toISOString() }),
        { flag: 'wx', mode: 0o600 });
    });
    return get(id);
  }
  async function readCode(id) {
    await get(id);
    const game = path.join(root(id), 'engine/src/game');
    await checkFiles(game);
    return fs.readFile(path.join(game, 'main.js'), 'utf8');
  }
  async function generate(id, prompt) {
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 16000) throw httpError(400);
    if (!runner.enabled) throw httpError(503);
    await exclusive(id, async signal => {
      await get(id);
      const requestId = randomUUID();
      const engineDir = path.join(root(id), 'engine');
      const live = path.join(engineDir, 'src/game');
      const work = path.join(root(id), 'attempts', requestId);
      const gameDir = path.join(work, 'game');
      const previous = path.join(work, 'previous');
      const timer = setTimeout(() => active.controller.abort(), config.aiderTimeoutMs);
      try {
        await checkFiles(live);
        await fs.mkdir(work, { recursive: true, mode: 0o700 });
        await fs.cp(live, gameDir, { recursive: true, errorOnExist: true, force: false });
        signal.throwIfAborted();
        await runner.run({ id: requestId, engineDir, gameDir, prompt: prompt.trim(), signal });
        signal.throwIfAborted();
        await checkFiles(gameDir);
        signal.throwIfAborted();
        await fs.rename(live, previous);
        try { await fs.rename(gameDir, live); }
        catch (error) { await fs.rename(previous, live); throw error; }
      } finally { clearTimeout(timer); }
    });
    return get(id);
  }
  async function close() {
    stopped = true;
    active?.controller.abort();
    await active?.promise.catch(() => {});
    if (cleanupError) throw cleanupError; // Keep the server lock until Docker is stopped manually.
  }
  return { list, get, create, readCode, generate, close, get available() { return !stopped && !cleanupError; } };
}
module.exports = { createProjects, UUID };
