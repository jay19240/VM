'use strict';
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { HttpError } = require('./errors');
const { createPricing, ceilDiv, safeNumber, DENOMINATOR } = require('./ai-pricing');
const timestamp = () => new Date().toISOString();
const TOKEN_FIELDS = ['inputTokens', 'cachedInputTokens', 'cacheWriteInputTokens', 'outputTokens', 'reasoningTokens'];
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid AI accounting integer');
  return value;
}
function snapshotPricing(snapshot) {
  const microUsdPerCredit = integer(snapshot?.microUsdPerCredit, 1);
  const rates = snapshot?.rates;
  const pricing = createPricing({ aiMicroUsdPerCredit: microUsdPerCredit,
    openaiInputMicroUsdPerMillion: integer(rates?.inputMicroUsdPerMillion, 1),
    openaiCachedInputMicroUsdPerMillion: integer(rates?.cachedInputMicroUsdPerMillion, 1),
    openaiOutputMicroUsdPerMillion: integer(rates?.outputMicroUsdPerMillion, 1) });
  if (Object.keys(rates).length !== Object.keys(pricing.rates).length ||
      Object.entries(pricing.rates).some(([key, value]) => rates[key] !== value)) throw new Error('Invalid AI pricing snapshot');
  return { microUsdPerCredit, rates: pricing.rates, pricing };
}
function storedPricing(job) {
  if (job.billing_mode !== 'metered') throw new Error('Job is not metered');
  return snapshotPricing({ microUsdPerCredit: job.micro_usd_per_credit, rates: JSON.parse(job.pricing_json) });
}
function canonicalUsage(record, pricing) {
  const fields = ['responseId', 'model', ...TOKEN_FIELDS, 'longContext', 'costMicroUsd', 'costNumerator', 'costDenominator', 'rates'];
  if (!record || typeof record !== 'object' || Object.keys(record).some(key => !fields.includes(key)) ||
      typeof record.responseId !== 'string' || !/^resp_[A-Za-z0-9_-]{1,195}$/.test(record.responseId) ||
      typeof record.model !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(record.model)) throw new Error('Invalid AI usage record');
  for (const key of TOKEN_FIELDS) integer(record[key]);
  const usage = pricing.usage({ input_tokens: record.inputTokens,
    input_tokens_details: { cached_tokens: record.cachedInputTokens, cache_write_tokens: record.cacheWriteInputTokens },
    output_tokens: record.outputTokens, output_tokens_details: { reasoning_tokens: record.reasoningTokens },
    total_tokens: safeNumber(BigInt(record.inputTokens) + BigInt(record.outputTokens)) });
  if (record.costNumerator !== usage.costNumerator.toString() || record.costDenominator !== DENOMINATOR.toString() ||
      (record.longContext !== undefined && record.longContext !== usage.longContext) ||
      !record.rates || Object.keys(record.rates).length !== Object.keys(pricing.rates).length ||
      Object.entries(pricing.rates).some(([key, value]) => record.rates[key] !== value)) throw new Error('Conflicting AI usage pricing');
  // Only canonical accounting fields are persisted, never provider output or private call data.
  return { responseId: record.responseId, model: record.model,
    ...Object.fromEntries(TOKEN_FIELDS.map(key => [key, usage[key]])), longContext: usage.longContext,
    costMicroUsd: integer(record.costMicroUsd), costNumerator: usage.costNumerator.toString(),
    costDenominator: DENOMINATOR.toString(), rates: pricing.rates };
}
function usageAccounting(store, job) {
  const { pricing, microUsdPerCredit } = storedPricing(job);
  const counts = Object.fromEntries(TOKEN_FIELDS.map(key => [key, 0n]));
  let numerator = 0n;
  const rows = store.all('SELECT * FROM ai_usage WHERE job_id = ? ORDER BY rowid', job.id);
  for (const row of rows) {
    const record = canonicalUsage(JSON.parse(row.record_json), pricing);
    if (row.response_id !== record.responseId || row.model !== record.model || row.cost_numerator !== record.costNumerator ||
        row.record_json !== JSON.stringify(record)) throw new Error('Conflicting persisted AI usage');
    const previous = numerator;
    numerator += BigInt(record.costNumerator);
    // The runner reports the increment of ceil(total), not ceil(each request).
    if (BigInt(record.costMicroUsd) !== ceilDiv(numerator, DENOMINATOR) - ceilDiv(previous, DENOMINATOR)) {
      throw new Error('Conflicting AI usage cost');
    }
    for (const key of TOKEN_FIELDS) counts[key] += BigInt(record[key]);
  }
  return { numerator, microUsdPerCredit, providerCostMicroUsd: safeNumber(ceilDiv(numerator, DENOMINATOR)),
    usage: { ...Object.fromEntries(TOKEN_FIELDS.map(key => [key, safeNumber(counts[key])])), requests: rows.length } };
}
function publicationCharge(store, job) {
  if (job.billing_mode === 'fixed') return job.cost;
  const accounting = usageAccounting(store, job);
  if (!accounting.usage.requests) throw new Error('Cannot publish without valid AI usage');
  const charge = ceilDiv(accounting.numerator, DENOMINATOR * BigInt(accounting.microUsdPerCredit));
  if (charge > BigInt(job.cost)) throw new Error('AI usage exceeds reserved budget');
  return safeNumber(charge);
}
const userView = row => row && ({ id: row.id, email: row.email, name: row.name,
  credits: row.credits, reservedCredits: row.reserved });
const projectView = row => row && ({ id: row.id, name: row.name, status: row.status,
  createdAt: row.created_at, updatedAt: row.updated_at });
const jobView = row => row && ({ id: row.id, projectId: row.project_id,
  status: row.status === 'publishing' ? 'running' : row.status, prompt: row.prompt,
  phase: row.status === 'publishing' ? 'publishing' : row.agent_phase ?? null, plan: row.agent_plan ?? null,
  cost: row.actual_cost ?? row.cost, reservedCost: row.cost, chargedCredits: row.actual_cost ?? null,
  providerCostMicroUsd: row.provider_cost_micro_usd ?? 0, usage: JSON.parse(row.usage_json ?? 'null'),
  error: row.error, createdAt: row.created_at, completedAt: row.completed_at });

class Store {
  constructor(filename) {
    this.db = new DatabaseSync(filename);
    this.depth = 0;
    this.db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
        credits INTEGER NOT NULL DEFAULT 0 CHECK(credits >= 0 AND credits <= 9000000000000),
        reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0 AND reserved <= credits), created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('provisioning','ready','failed')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS project_owners ON projects(user_id);
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), project_id TEXT NOT NULL REFERENCES projects(id),
        request_id TEXT NOT NULL, prompt TEXT NOT NULL, cost INTEGER NOT NULL CHECK(cost > 0),
        status TEXT NOT NULL CHECK(status IN ('queued','running','publishing','succeeded','failed')),
        error TEXT, created_at TEXT NOT NULL, completed_at TEXT, UNIQUE(user_id,request_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_project_job ON jobs(project_id) WHERE status IN ('queued','running','publishing');
      CREATE TABLE IF NOT EXISTS ledger (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), amount INTEGER NOT NULL,
        reserved_delta INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL, reference TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ledger_owners ON ledger(user_id,created_at);
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), filename TEXT NOT NULL,
        folder TEXT NOT NULL, size INTEGER NOT NULL CHECK(size >= 0), created_at TEXT NOT NULL,
        UNIQUE(project_id,folder,filename)
      );`);
    this.transaction(() => {
      const columns = new Set(this.all('PRAGMA table_info(jobs)').map(column => column.name));
      const additions = {
        billing_mode: "TEXT NOT NULL DEFAULT 'fixed' CHECK(billing_mode IN ('fixed','metered'))",
        micro_usd_per_credit: 'INTEGER', pricing_json: 'TEXT', actual_cost: 'INTEGER',
        provider_cost_micro_usd: 'INTEGER NOT NULL DEFAULT 0', usage_json: 'TEXT DEFAULT NULL',
        agent_phase: "TEXT DEFAULT NULL CHECK(agent_phase IN ('planning','coding','validating'))",
        agent_plan: 'TEXT DEFAULT NULL',
      };
      for (const [name, definition] of Object.entries(additions)) {
        if (!columns.has(name)) this.db.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${definition}`);
      }
      this.db.exec(`CREATE TABLE IF NOT EXISTS ai_usage (
        response_id TEXT PRIMARY KEY NOT NULL, job_id TEXT NOT NULL REFERENCES jobs(id), model TEXT NOT NULL,
        record_json TEXT NOT NULL, cost_numerator TEXT NOT NULL, created_at TEXT NOT NULL
      ); CREATE INDEX IF NOT EXISTS ai_usage_jobs ON ai_usage(job_id);`);
    });
  }
  get(sql, ...args) { return this.db.prepare(sql).get(...args); }
  all(sql, ...args) { return this.db.prepare(sql).all(...args); }
  run(sql, ...args) { return this.db.prepare(sql).run(...args); }
  transaction(fn) {
    const level = this.depth;
    const name = `tx_${level}`;
    this.db.exec(level ? `SAVEPOINT ${name}` : 'BEGIN IMMEDIATE');
    this.depth++;
    try {
      const result = fn();
      if (result?.then) throw new Error('Transactions must be synchronous');
      this.db.exec(level ? `RELEASE ${name}` : 'COMMIT');
      return result;
    } catch (error) {
      this.db.exec(level ? `ROLLBACK TO ${name}; RELEASE ${name}` : 'ROLLBACK');
      throw error;
    } finally { this.depth--; }
  }
  entry(userId, amount, reservedDelta, kind, reference, description) {
    this.run('INSERT INTO ledger VALUES (?,?,?,?,?,?,?,?)', randomUUID(), userId, amount, reservedDelta,
      kind, reference, description, timestamp());
  }
  credit(userId, amount, { kind, reference, description }) {
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1e9) throw new Error('Invalid credit amount');
    return this.transaction(() => {
      const existing = this.get('SELECT * FROM ledger WHERE reference = ?', reference);
      if (existing) {
        if (existing.user_id !== userId || existing.amount !== amount || existing.kind !== kind) throw new Error('Conflicting ledger reference');
        return false;
      }
      if (this.run('UPDATE users SET credits = credits + ? WHERE id = ?', amount, userId).changes !== 1) throw new Error('Unknown account');
      this.entry(userId, amount, 0, kind, reference, description);
      return true;
    });
  }
  ownProject(userId, id) {
    const row = this.get('SELECT * FROM projects WHERE id = ? AND user_id = ?', id, userId);
    if (!row) throw new HttpError(404, 'Projet introuvable.');
    return row;
  }
  reserveJob(userId, projectId, requestId, prompt, cost, pricing) {
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
  updateJobProgress(jobId, progress) {
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
  recordUsage(jobId, record) {
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
  preparePublication(jobId) {
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
  finishJob(id, success, error = null) {
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
  wallet(userId) {
    const user = this.get('SELECT credits,reserved FROM users WHERE id = ?', userId);
    return { balance: user.credits, reserved: user.reserved, available: user.credits - user.reserved,
      entries: this.all(`SELECT id,kind,amount,reserved_delta AS reservedDelta,description,created_at AS createdAt
        FROM ledger WHERE user_id = ? ORDER BY rowid DESC LIMIT 100`, userId) };
  }
  close() { this.db.close(); }
}
module.exports = { Store, userView, projectView, jobView, timestamp };
