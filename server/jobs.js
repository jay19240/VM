'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { projectRoot, exists } = require('./files');

class GameSyntaxError extends Error {
  constructor(message, code, relative) {
    super(message);
    this.issue = { valid: false, code, path: `src/game/${relative}` };
  }
}
async function inspectGame(root, signal) {
  const entries = [];
  let bytes = 0;
  let files = 0;
  async function visit(directory, prefix = '', depth = 0) {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || depth > 12) throw new Error('Invalid game directory');
    for (const name of (await fs.readdir(directory)).sort()) {
      if (signal?.aborted) throw new Error('Game validation interrupted');
      if (name.startsWith('.') || /[\\\x00-\x1f\x7f:]/.test(name) || name.length > 100) throw new Error('Invalid game filename');
      const filename = path.join(directory, name);
      const relative = prefix + name;
      const info = await fs.lstat(filename);
      if (info.isSymbolicLink()) throw new Error('Game symlink refused');
      if (info.isDirectory()) { await visit(filename, relative + '/', depth + 1); continue; }
      if (!info.isFile() || info.nlink !== 1 || !/\.(js|mjs|cjs|ts|json|css|html|wgsl)$/.test(name)) throw new Error('Invalid game file');
      if (++files > 200 || info.size > 2 * 1024 ** 2 || (bytes += info.size) > 10 * 1024 ** 2) throw new Error('Game exceeds limits');
      const content = await fs.readFile(filename);
      if (/\.(js|mjs|cjs)$/.test(name)) {
        const result = spawnSync(process.execPath, ['--check', '--input-type=' + (name.endsWith('.cjs') ? 'commonjs' : 'module')],
          { input: content, env: {}, timeout: 5000, maxBuffer: 100000, stdio: ['pipe', 'pipe', 'pipe'] });
        if (result.status !== 0) throw new GameSyntaxError('Invalid JavaScript syntax', 'INVALID_JAVASCRIPT', relative);
      }
      if (name.endsWith('.ts')) {
        // Node's erasable-TypeScript parser checks syntax without executing user code or imports.
        const result = spawnSync(process.execPath, ['--experimental-vm-modules', path.join(__dirname, 'check-typescript.js')],
          { input: content, env: {}, timeout: 5000, maxBuffer: 100000, stdio: ['pipe', 'pipe', 'pipe'] });
        if (result.status !== 0) throw new GameSyntaxError('Invalid or unsupported TypeScript syntax', 'INVALID_TYPESCRIPT', relative);
      }
      if (name.endsWith('.json')) {
        try { JSON.parse(content.toString('utf8')); }
        catch { throw new GameSyntaxError('Invalid JSON syntax', 'INVALID_JSON', relative); }
      }
      entries.push([relative, createHash('sha256').update(content).digest('hex')]);
    }
  }
  await visit(root);
  if (!entries.some(([name]) => name === 'main.js')) throw new Error('Missing game entry point');
  return JSON.stringify(entries);
}
async function checkDraft(root, previous, signal) {
  try {
    const current = await inspectGame(root, signal);
    return current === previous ? { valid: false, code: 'NO_CHANGES' } : { valid: true };
  } catch (error) {
    // Only our own syntax codes and virtual paths may reach the model. Never
    // forward Node diagnostics, absolute filesystem paths or native errors.
    return error instanceof GameSyntaxError ? error.issue : { valid: false, code: 'INVALID_GAME' };
  }
}
function createJobs({ store, config, runner }) {
  const active = new Map();
  let stopped = false;
  let pumping = false;
  function locations(job) {
    const root = projectRoot(config, job.user_id, job.project_id);
    const work = path.join(root, 'generations', job.id);
    return { root, work, engine: path.join(root, 'engine'), live: path.join(root, 'engine/src/game'),
      draft: path.join(work, 'game'), backup: path.join(work, 'previous') };
  }
  async function recover() {
    // Called only while holding the exclusive server data-directory lock.
    store.run("UPDATE projects SET status = 'failed' WHERE status = 'provisioning'");
    for (const job of store.all("SELECT * FROM jobs WHERE status IN ('queued','running','publishing')")) {
      const p = locations(job);
      if (job.status === 'running' && job.billing_mode === 'fixed') {
        // A legacy Docker worker may outlive the old server. Do not assume it stopped.
        if (!runner.cleanup) throw new Error('Ancienne génération Auggie active : arrêter et réconcilier les workers avant migration.');
        await runner.cleanup(job.id);
      }
      if (job.status === 'publishing') {
        const [live, draft, backup] = await Promise.all([exists(p.live), exists(p.draft), exists(p.backup)]);
        if (live && !draft && backup) {
          await inspectGame(p.live);
          store.finishJob(job.id, true);
          continue;
        }
        if (!live && draft && backup) await fs.rename(p.backup, p.live);
        else if (!(live && draft && !backup)) throw new Error('Publication recovery needs operator review');
      }
      store.finishJob(job.id, false, 'Exécution interrompue. Les crédits réservés ont été libérés.');
    }
  }
  async function execute(job, controller) {
    const p = locations(job);
    let publicationStarted = false;
    const timer = setTimeout(() => controller.abort(), config.jobTimeoutMs);
    try {
      await fs.mkdir(p.work, { recursive: true, mode: 0o700 });
      const before = await inspectGame(p.live, controller.signal);
      await fs.cp(p.live, p.draft, { recursive: true, force: false, errorOnExist: true });
      await runner.run({ id: job.id, engineDir: p.engine, gameDir: p.draft, prompt: job.prompt,
        budgetCredits: job.cost, signal: controller.signal, onUsage: record => store.recordUsage(job.id, record),
        onProgress: progress => store.updateJobProgress(job.id, progress),
        validateDraft: () => checkDraft(p.draft, before, controller.signal) });
      if (controller.signal.aborted) throw new Error('Job timed out');
      store.updateJobProgress(job.id, { phase: 'validating' });
      const after = await inspectGame(p.draft, controller.signal);
      if (controller.signal.aborted || after === before) throw new Error('No valid modifications within deadline');
      store.preparePublication(job.id);
      publicationStarted = true;
      // A retained backup + durable publishing state makes either rename recoverable at startup.
      await fs.rename(p.live, p.backup);
      await fs.rename(p.draft, p.live);
      store.finishJob(job.id, true);
    } catch (error) {
      if (error.retainReservation) { stopped = true; throw error; }
      if (publicationStarted) {
        // Do not refund a successfully published game if the DB temporarily failed: recover it.
        const [live, draft, backup] = await Promise.all([exists(p.live), exists(p.draft), exists(p.backup)]);
        if (live && !draft && backup) {
          try { store.finishJob(job.id, true); } catch { stopped = true; /* Retain reservation for startup reconciliation. */ }
          return;
        }
        if (!live && backup) await fs.rename(p.backup, p.live);
      }
      store.finishJob(job.id, false, 'La génération n’a pas abouti à des modifications valides. Aucun crédit débité.');
    } finally { clearTimeout(timer); }
  }
  function pump() {
    if (stopped || pumping) return;
    pumping = true;
    try {
      while (active.size < config.maxConcurrentJobs) {
        const job = store.get("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at, rowid LIMIT 1");
        if (!job) break;
        store.run("UPDATE jobs SET status = 'running' WHERE id = ?", job.id);
        const controller = new AbortController();
        const promise = execute(job, controller).catch(() => {
          // An unrecoverable storage failure must not launch more jobs or silently lose reservations.
          stopped = true;
          console.error('Arrêt des générations : une réconciliation du stockage est nécessaire.');
        }).finally(() => { active.delete(job.id); pump(); });
        active.set(job.id, { controller, promise });
      }
    } finally { pumping = false; }
  }
  return { recover, get available() { return !stopped; }, pause() { stopped = true; },
    kick: () => setImmediate(pump), async close() {
      stopped = true;
      for (const value of active.values()) value.controller.abort();
      await Promise.all([...active.values()].map(value => value.promise));
      for (const job of store.all("SELECT id FROM jobs WHERE status = 'queued'")) {
        store.finishJob(job.id, false, 'Serveur arrêté avant exécution. Crédits libérés.');
      }
    } };
}
module.exports = { createJobs, inspectGame, checkDraft };
