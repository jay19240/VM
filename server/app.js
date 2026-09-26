'use strict';
const express = require('express');
const multer = require('multer');
const path = require('node:path');
const { Store, userView, projectView, jobView } = require('./store');
const { createAuth } = require('./auth');
const { createBilling } = require('./billing');
const { createProjects, UUID } = require('./files');
const { createJobs } = require('./jobs');
const { createAgentRunner } = require('./runner');
const { createPricing } = require('./ai-pricing');
const { acquireLock } = require('./lock');
const { loadConfig } = require('./config');
const { HttpError } = require('./errors');

function rateLimit(max, duration, key = req => req.ip) {
  const windows = new Map();
  return (req, res, next) => {
    const now = Date.now();
    if (windows.size > 10000) for (const [id, bucket] of windows) if (bucket.until <= now) windows.delete(id);
    const id = key(req);
    let bucket = windows.get(id);
    if (!bucket || bucket.until <= now) {
      if (windows.size > 10000) throw new HttpError(429, 'Service occupé. Réessaie plus tard.');
      bucket = { count: 0, until: now + duration }; windows.set(id, bucket);
    }
    if (++bucket.count > max) {
      res.set('Retry-After', String(Math.ceil((bucket.until - now) / 1000)));
      throw new HttpError(429, 'Trop de tentatives. Réessaie dans quelques minutes.');
    }
    next();
  };
}
async function createApplication({ config = loadConfig(), runner, lemonClient } = {}) {
  const unlock = acquireLock(config.dataDir);
  let store;
  let jobs;
  try {
    store = new Store(config.databasePath);
    const billing = createBilling({ config, store, lemonClient });
    runner ||= createAgentRunner(config);
    const pricing = { microUsdPerCredit: config.aiMicroUsdPerCredit, rates: createPricing(config).rates };
    jobs = createJobs({ store, config, runner });
    await jobs.recover();
    const projects = createProjects({ store, config, entitlements: userId => billing.getEntitlements(userId) });
    const auth = createAuth({ store, config });
    const app = express();
    let accepting = true;
    app.use((_req, _res, next) => { if (!accepting) throw new HttpError(503, 'Le serveur est en cours d’arrêt.'); next(); });
    app.disable('x-powered-by');
    app.set('trust proxy', config.trustProxy || false); // Only explicitly trusted local proxies may supply client IPs.
    app.use((_req, res, next) => {
      res.set({ 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
        'Cross-Origin-Opener-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
      if (config.secureCookies) res.set('Strict-Transport-Security', 'max-age=31536000');
      next();
    });
    app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
      await billing.webhook(req.body, req.get('x-signature'));
      res.json({ received: true });
    });
    app.use('/api', (req, _res, next) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') !== config.appUrl) {
        throw new HttpError(403, 'Origine de la requête non autorisée.');
      }
      next();
    });
    app.use(express.json({ limit: '64kb' }));
    app.use('/api', auth.load);
    function session(req) {
      const user = req.session ? userView(store.get('SELECT * FROM users WHERE id = ?', req.session.user_id)) : null;
      return { user, csrfToken: user ? req.session.csrf : null, generationMaxCredits: config.generationMaxCredits,
        microUsdPerCredit: config.aiMicroUsdPerCredit, aiModel: config.openaiModel,
        storage: user ? projects.storage(user.id) : null, billingProvider: 'lemon-squeezy',
        generationEnabled: Boolean(runner.enabled && jobs.available), billingEnabled: billing.enabled };
    }
    const jsonOnly = (req, _res, next) => {
      if (!req.is('application/json')) throw new HttpError(415, 'Un corps JSON est requis.');
      next();
    };
    app.get('/api/hello', (_req, res) => res.json({ message: 'Legacy Studio API' }));
    app.get('/api/session', (req, res) => res.json(session(req)));
    const loginLimit = rateLimit(20, 15 * 60 * 1000);
    app.post('/api/auth/register', loginLimit, jsonOnly, async (req, res) => {
      await auth.register(req, res); res.status(201).json(session(req));
    });
    app.post('/api/auth/login', loginLimit, jsonOnly, async (req, res) => {
      await auth.login(req, res); res.json(session(req));
    });
    app.use('/api', auth.requireUser);
    app.use('/api', (req, res, next) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? next() : auth.requireCsrf(req, res, next));
    app.post('/api/auth/logout', auth.logout);
    app.get('/api/projects', (req, res) => res.json({ projects: store.all('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC', req.session.user_id).map(projectView) }));
    app.post('/api/projects', rateLimit(10, 3600000, req => req.session.user_id), jsonOnly, async (req, res) => {
      res.status(201).json({ project: projectView(await projects.create(req.session.user_id, req.body?.name)) });
    });
    app.use('/api/projects/:projectId', (req, _res, next) => {
      if (!UUID.test(req.params.projectId)) throw new HttpError(404, 'Projet introuvable.');
      req.project = store.ownProject(req.session.user_id, req.params.projectId);
      next();
    });
    app.get('/api/projects/:projectId', (req, res) => res.json({ project: projectView(req.project) }));
    app.get('/api/projects/:projectId/generations', (req, res) => res.json({ jobs: store.all(
      'SELECT * FROM jobs WHERE project_id = ? ORDER BY rowid DESC LIMIT 100', req.project.id).map(jobView) }));
    app.post('/api/projects/:projectId/generations', rateLimit(15, 60000, req => req.session.user_id), jsonOnly, async (req, res) => {
      const { prompt, requestId, budgetCredits = config.generationMaxCredits } = req.body || {};
      if (!Number.isSafeInteger(budgetCredits) || budgetCredits < 1 || budgetCredits > config.generationMaxCredits) {
        throw new HttpError(400, 'Le budget doit être un nombre entier positif inférieur au plafond de génération.');
      }
      if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 16000 || !UUID.test(requestId || '')) throw new HttpError(400, 'Instruction (1 à 16 000 caractères) et identifiant de demande valides requis.');
      const existing = store.get('SELECT * FROM jobs WHERE user_id = ? AND request_id = ?', req.session.user_id, requestId);
      if ((!runner.enabled || !jobs.available) && !existing) throw new HttpError(503, 'La génération isolée est indisponible. Aucun crédit ne sera débité.');
      const job = await projects.exclusive(req.project.id, () => {
        if (!jobs.available && !existing) throw new HttpError(503, 'Le générateur est en cours d’arrêt.');
        return store.reserveJob(req.session.user_id, req.project.id, requestId, prompt.trim(), budgetCredits, pricing);
      });
      jobs.kick();
      res.status(202).json({ job: jobView(job) });
    });
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxAssetBytes, files: 1, fields: 1, fieldSize: 400, parts: 2 } });
    let uploads = 0;
    const uploadLimit = (req, res, next) => {
      if (uploads >= 4) throw new HttpError(429, 'Plusieurs fichiers sont en cours d’envoi. Réessaie dans un instant.');
      uploads++;
      res.once('close', () => uploads--);
      next();
    };
    app.get('/api/projects/:projectId/assets', (req, res) => res.json({ files: projects.listAssets(req.project.id) }));
    app.post('/api/projects/:projectId/assets', uploadLimit, upload.single('file'), async (req, res) => {
      res.status(201).json({ file: await projects.upload(req.session.user_id, req.project.id, req.file, req.body?.folder || '') });
    });
    app.get('/api/projects/:projectId/assets/:assetId/download', async (req, res, next) => {
      const file = await projects.download(req.session.user_id, req.project.id, req.params.assetId);
      res.set('Content-Security-Policy', "sandbox; default-src 'none'");
      res.type('application/octet-stream');
      res.download(file.path, file.filename, { dotfiles: 'deny' }, error => { if (error) next(error); });
    });
    app.get('/api/wallet', (req, res) => res.json(store.wallet(req.session.user_id)));
    app.get('/api/billing/plans', async (_req, res) => res.json({ plans: await billing.listPlans() }));
    app.get('/api/billing/credit-packs', async (_req, res) => res.json({ packs: await billing.listCreditPacks() }));
    app.get('/api/billing/subscription', async (req, res) => res.json({ subscription: billing.enabled ? await billing.subscription(req.session.user_id) : null }));
    const billingLimit = rateLimit(15, 60000, req => req.session.user_id);
    app.post('/api/billing/checkout', billingLimit, jsonOnly, async (req, res) => res.json(await billing.checkout(req.session.user_id, req.body?.planId, req.body?.requestId)));
    app.post('/api/billing/credit-checkout', billingLimit, jsonOnly, async (req, res) => {
      res.json(await billing.purchaseCredits(req.session.user_id, req.body?.packId, req.body?.requestId));
    });
    app.post('/api/billing/portal', billingLimit, async (req, res) => res.json(await billing.portal(req.session.user_id)));
    app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Route introuvable.')));
    app.use(express.static(path.join(config.root, 'web'), { index: 'index.html', dotfiles: 'deny', etag: true, maxAge: 0 }));
    app.use((_req, _res, next) => next(new HttpError(404, 'Page introuvable.')));
    app.use((error, _req, res, next) => {
      if (res.headersSent) return next(error);
      let status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
      let message = status < 500 || error.status === 503 ? error.message : 'Une erreur interne est survenue.';
      if (error instanceof multer.MulterError) { status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400; message = 'Fichier trop volumineux ou formulaire invalide.'; }
      if (error.type === 'entity.parse.failed') { status = 400; message = 'JSON invalide.'; }
      if (error.type === 'entity.too.large') { status = 413; message = 'Requête trop volumineuse.'; }
      res.status(status).json({ error: message, ...(error.code && error instanceof HttpError ? { code: error.code } : {}) });
    });
    let closed = false;
    return { app, store, config, jobs,
      beginShutdown() { accepting = false; jobs.pause(); },
      async close() { if (closed) return; closed = true; accepting = false; await jobs.close(); store.close(); unlock(); } };
  } catch (error) { if (jobs) await jobs.close(); store?.close(); unlock(); throw error; }
}
module.exports = { createApplication, rateLimit };
