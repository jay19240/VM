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

  function reserveJob(userId, projectId, requestId, prompt, cost, pricing) {
    integer(cost, 1, 9000000000000);
    return this.transaction(() => {
      const project = this.ownProject(userId, projectId);
      const existing = this.get('SELECT * FROM jobs WHERE user_id = ? AND request_id = ?', userId, requestId);
      if (existing) {
        if (existing.project_id !== projectId || existing.prompt !== prompt || existing.cost !== cost) throw new HttpError(409, 'Cette demande a déjà été utilisée pour une autre génération.');
        return existing;
      }
      // Retries retain their original billing mode and snapshot, even after config changes.
      const snapshot = pricing === undefined ? null : snapshotPricing(pricing);
      if (project.status !== 'ready') throw new HttpError(409, 'Le projet n’est pas prêt.');
      if (this.get("SELECT id FROM jobs WHERE project_id = ? AND status IN ('queued','running','publishing')", projectId)) {
        throw new HttpError(409, 'Une génération est déjà en cours pour ce projet.');
      }
      if (this.run('UPDATE users SET reserved = reserved + ? WHERE id = ? AND credits - reserved >= ?', cost, userId, cost).changes !== 1) {
        throw new HttpError(402, 'Crédits disponibles insuffisants.', 'INSUFFICIENT_CREDITS');
      }
      const id = randomUUID();
      this.run(`INSERT INTO jobs(id,user_id,project_id,request_id,prompt,cost,status,created_at,
        billing_mode,micro_usd_per_credit,pricing_json) VALUES (?,?,?,?,?,?,'queued',?,?,?,?)`,
      id, userId, projectId, requestId, prompt, cost, timestamp(), snapshot ? 'metered' : 'fixed',
      snapshot?.microUsdPerCredit ?? null, snapshot ? JSON.stringify(snapshot.rates) : null);
      this.entry(userId, 0, cost, 'reservation', `job:${id}:reserve`, `${cost} crédit(s) réservé(s) pour une génération`);
      return this.get('SELECT * FROM jobs WHERE id = ?', id);
    });
  }
  
  function updateJobProgress(jobId, progress) {
    if (!progress || typeof progress !== 'object' ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(progress))) throw new Error('Invalid agent progress');
    const fields = Object.getOwnPropertyDescriptors(progress);
    if (Reflect.ownKeys(fields).some(key => !['phase', 'plan'].includes(key) || !Object.hasOwn(fields[key], 'value')) ||
        !Object.hasOwn(fields, 'phase')) throw new Error('Invalid agent progress fields');
    const phase = fields.phase.value;
    const hasPlan = Object.hasOwn(fields, 'plan');
    const plan = hasPlan ? fields.plan.value : undefined;
    if (!['planning', 'coding', 'validating'].includes(phase)) throw new Error('Invalid agent phase');
    // Only a public preparation summary belongs here, never private reasoning or provider logs.
    if (hasPlan && (phase !== 'coding' || typeof plan !== 'string' || !plan.trim() ||
        !plan.isWellFormed() || Buffer.byteLength(plan, 'utf8') > 8192 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(plan))) throw new Error('Invalid agent plan');
    // Synchronous durable callback, including the running-state and immutable-plan checks.
    return this.transaction(() => {
      const job = this.get('SELECT * FROM jobs WHERE id = ?', jobId);
      if (!job) throw new Error('Unknown job');
      if (job.status !== 'running') throw new Error('Cannot update progress for a job that is not running');
      if (hasPlan && job.agent_plan !== null && job.agent_plan !== plan) throw new Error('Conflicting agent plan');
      const nextPlan = hasPlan ? plan : job.agent_plan;
      if (job.agent_phase === phase && job.agent_plan === nextPlan) return false;
      this.run('UPDATE jobs SET agent_phase = ?, agent_plan = ? WHERE id = ?', phase, nextPlan, jobId);
      return true;
    });
  }

  function preparePublication(jobId) {
    return this.transaction(() => {
      const job = this.get('SELECT * FROM jobs WHERE id = ?', jobId);
      if (!job) throw new Error('Unknown job');
      if (job.status === 'succeeded') return job;
      if (!['running', 'publishing'].includes(job.status)) throw new Error('Cannot publish a job that is not running');
      publicationCharge(this, job); // Validate before any filesystem publication, without debiting.
      if (job.status === 'running') this.run("UPDATE jobs SET status = 'publishing' WHERE id = ?", jobId);
      return this.get('SELECT * FROM jobs WHERE id = ?', jobId);
    });
  }
  
  function finishJob(id, success, error = null) {
    return this.transaction(() => {
      const job = this.get('SELECT * FROM jobs WHERE id = ?', id);
      if (!job || ['succeeded', 'failed'].includes(job.status)) return;
      if (success && job.status !== 'publishing') throw new Error('Cannot charge unpublished job');
      const charge = success ? publicationCharge(this, job) : 0;
      this.run('UPDATE users SET reserved = reserved - ?, credits = credits - ? WHERE id = ?', job.cost, charge, job.user_id);
      this.entry(job.user_id, -charge, -job.cost, success ? 'generation' : 'release', `job:${id}:finish`,
        success ? 'Génération appliquée au projet' : 'Réservation annulée — génération non facturée');
      this.run('UPDATE jobs SET status = ?, error = ?, completed_at = ?, actual_cost = ? WHERE id = ?',
        success ? 'succeeded' : 'failed', error, timestamp(), charge, id);
      if (success) this.run('UPDATE projects SET updated_at = ? WHERE id = ?', timestamp(), job.project_id);
    });
  }

  function recordUsage(jobId, record) {
    // Synchronous durable callback; callers may also await its boolean result.
    return this.transaction(() => {
      const job = this.get('SELECT * FROM jobs WHERE id = ?', jobId);
      if (!job) throw new Error('Unknown job');
      const canonical = canonicalUsage(record, storedPricing(job).pricing);
      const json = JSON.stringify(canonical);
      const existing = this.get('SELECT * FROM ai_usage WHERE response_id = ?', canonical.responseId);
      if (existing) {
        if (existing.job_id !== jobId || existing.record_json !== json) throw new Error('Conflicting AI response identifier');
        return false;
      }
      if (job.status !== 'running') throw new Error('Cannot record usage for a job that is not running');
      this.run(`INSERT INTO ai_usage(response_id,job_id,model,record_json,cost_numerator,created_at)
        VALUES (?,?,?,?,?,?)`, canonical.responseId, jobId, canonical.model, json, canonical.costNumerator, timestamp());
      const accounting = usageAccounting(this, job);
      this.run('UPDATE jobs SET provider_cost_micro_usd = ?, usage_json = ? WHERE id = ?',
        accounting.providerCostMicroUsd, JSON.stringify(accounting.usage), jobId);
      return true;
    });
  }

  function getByProjectID(projectId) {
    return store.all('SELECT * FROM jobs WHERE project_id = ? ORDER BY rowid DESC LIMIT 100', projectId);
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
  return { recover, get available() { return !stopped; }, pause() { stopped = true; }, getByProjectID,
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
