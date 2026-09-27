const express = require('express');
const multer = require('multer');
const path = require('node:path');
// -----------------------------------------------------------------------------------
const { Store, userView, projectView, jobView } = require('./store');
const { CREATE_AUTH } = require('./auth');
const { createBilling } = require('./billing');
const { createProjects, UUID } = require('./files');
const { createJobs } = require('./jobs');
const { createEvents } = require('./events');
const { createAider } = require('./aider');
const { acquireLock } = require('./lock');
const { loadConfig } = require('./config');
const { HttpError } = require('./errors');
const { CREATE_MIDDLEWARE_RATE_LIMIT, MIDDLEWARE_REQUIRE_USER, MIDDLEWARE_JSON_ONLY } = require('./middlewares');
// -----------------------------------------------------------------------------------

async function createApplication({ config = loadConfig(), runner = createAider(config), lemonClient } = {}) {
  const releaseLock = acquireLock(config.dataDir);
  let store;
  try {
  store = new Store(config.databasePath);
  const authLimit = CREATE_MIDDLEWARE_RATE_LIMIT(20, 15 * 60 * 1000);
  const projectsLimit = CREATE_MIDDLEWARE_RATE_LIMIT(10, 3600000, req => req.session.user_id);
  const generationLimit = CREATE_MIDDLEWARE_RATE_LIMIT(15, 3600000, req => req.session.user_id);
  const billingLimit = CREATE_MIDDLEWARE_RATE_LIMIT(15, 60000, req => req.session.user_id);
  const billing = createBilling({ config, store, lemonClient });
  const pricing = { provider: 'aider', microUsdPerCredit: config.aiMicroUsdPerCredit };
  const jobs = createJobs({ store, config, runner });
  await runner.initialize?.();
  await jobs.recover();
  const projects = createProjects({ store, config, entitlements: userId => billing.getEntitlements(userId) });
  const auth = CREATE_AUTH({ store, config, projects, runner, jobs, billing });
  const events = createEvents({ store });
  let accepting = true;

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxAssetBytes, files: 1, fields: 1, fieldSize: 400, parts: 2 } });
  let uploads = 0;
  const uploadLimit = (req, res, next) => {
    if (uploads >= 4) throw new HttpError(429, 'Plusieurs fichiers sont en cours d’envoi. Réessaie dans un instant.');
    uploads++;
    res.once('close', () => uploads--);
    next();
  };



  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy || false);

  app.use((_req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
      'Cross-Origin-Opener-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    });
    if (config.secureCookies) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });

  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!accepting) throw new HttpError(503, 'Le serveur est en cours d’arrêt.');
    next();
  });
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

  // -------------------------------------------------------------------------------------------
  // AUTHENTICATION
  // -------------------------------------------------------------------------------------------

  app.use('/api', auth.loadSession);

  app.post('/api/auth/register', authLimit, MIDDLEWARE_JSON_ONLY, async (req, res) => {
    await auth.register(req, res);
    res.status(201).json(auth.getSessionInfos(req));
  });

  app.post('/api/auth/login', authLimit, MIDDLEWARE_JSON_ONLY, async (req, res) => {
    await auth.login(req, res);
    res.json(auth.getSessionInfos(req));
  });

  app.get('/api/session', (req, res) => res.json(auth.getSessionInfos(req)));

  // -------------------------------------------------------------------------------------------
  // API ROUTES BELOW THESE LINES REQUIRED AUTHENTICATION
  // -------------------------------------------------------------------------------------------

  app.use('/api', MIDDLEWARE_REQUIRE_USER);
  app.use('/api', (req, res, next) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? next() : auth.requireCsrf(req, res, next));
  app.post('/api/auth/logout', auth.logout);

  // -------------------------------------------------------------------------------------------
  // API FOR PROJECTS ROUTES
  // -------------------------------------------------------------------------------------------

  app.get('/api/projects', (req, res) => {
    const ownProjects = projects.getByUserID(req.session.user_id);
    res.json({ projects: ownProjects.map(projectView) });
  });

  app.post('/api/projects', projectsLimit, MIDDLEWARE_JSON_ONLY, async (req, res) => {
    const project = await projects.create(req.session.user_id, req.body?.name);
    res.status(201).json({ project: projectView(project) });
  });

  app.use('/api/projects/:projectId', (req, _res, next) => {
    if (!UUID.test(req.params.projectId)) {
      throw new HttpError(404, 'Projet introuvable.');
    }

    req.project = store.assertOwnProject(req.session.user_id, req.params.projectId);
    next();
  });

  app.get('/api/projects/:projectId', (req, res) => {
    res.json({ project: projectView(req.project) });
  });

  app.get('/api/projects/:projectId/generations', (req, res) => {
    res.json({ jobs: jobs.getByProjectID(req.project.id).map(jobView) });
  });

  app.post('/api/projects/:projectId/generations', generationLimit, MIDDLEWARE_JSON_ONLY, async (req, res) => {
    const { prompt, requestId, budgetCredits = config.generationMaxCredits } = req.body || {};

    if (!Number.isSafeInteger(budgetCredits) || budgetCredits < 1 || budgetCredits > config.generationMaxCredits) {
      throw new HttpError(400, 'Le budget doit être un nombre entier positif inférieur au plafond de génération.');
    }

    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 16000 || !UUID.test(requestId || '')) {
      throw new HttpError(400, 'Instruction (1 à 16 000 caractères) et identifiant de demande valides requis.');
    }

    const existing = store.get('SELECT * FROM jobs WHERE user_id = ? AND request_id = ?', req.session.user_id, requestId);
    if ((!runner.enabled || !jobs.available) && !existing) {
      throw new HttpError(503, 'La génération isolée est indisponible. Aucun crédit ne sera débité.');
    }

    const job = await projects.exclusive(req.project.id, () => {
      if (!jobs.available && !existing) {
        throw new HttpError(503, 'Le générateur est en cours d’arrêt.');
      }

      return store.reserveJob(req.session.user_id, req.project.id, requestId, prompt.trim(), budgetCredits, pricing);
    });

    jobs.kick();
    res.status(202).json({ job: jobView(job) });
  });

  app.get('/api/projects/:projectId/assets', (req, res) => {
    res.json({ files: projects.listAssets(req.project.id) });
  });

  app.post('/api/projects/:projectId/assets', uploadLimit, upload.single('file'), async (req, res) => {
    const file = await projects.upload(req.session.user_id, req.project.id, req.file, req.body?.folder || '');
    res.status(201).json({ file: file });
  });

  app.get('/api/projects/:projectId/assets/:assetId/download', async (req, res, next) => {
    const file = await projects.download(req.session.user_id, req.project.id, req.params.assetId);
    res.set('Content-Security-Policy', "sandbox; default-src 'none'");
    res.type('application/octet-stream');
    res.download(file.path, file.filename, { dotfiles: 'deny' }, error => { if (error) next(error); });
  });

  // -------------------------------------------------------------------------------------------
  // API FOR EVENTS ROUTES
  // -------------------------------------------------------------------------------------------

  app.get('/api/events', (req, res) => {
    const projectId = req.query.projectId ?? null;
    if (Object.keys(req.query).some(key => key !== 'projectId') ||
        (projectId !== null && (typeof projectId !== 'string' || !UUID.test(projectId)))) {
      throw new HttpError(400, 'Projet de suivi invalide.');
    }
    if ((req.get('origin') && req.get('origin') !== config.appUrl) ||
        (req.get('sec-fetch-site') && !['same-origin', 'none'].includes(req.get('sec-fetch-site')))) {
      throw new HttpError(403, 'Origine de la requête non autorisée.');
    }
    const userId = req.session.user_id;
    if (projectId !== null) store.assertOwnProject(userId, projectId);

    events.open(req, res, () => {
      if (projectId !== null) store.assertOwnProject(userId, projectId);
      const jobRows = projectId === null ? [] : store.all('SELECT * FROM jobs WHERE project_id = ? AND user_id = ? ORDER BY rowid DESC LIMIT 100', projectId, userId);
      const projectRows = store.all('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC', userId);

      return {
        user: userView(store.get('SELECT * FROM users WHERE id = ?', userId)),
        storage: projects.storage(userId),
        generationEnabled: Boolean(runner.enabled && jobs.available),
        projects: projectRows.map(projectView),
        projectId,
        jobs: jobRows.map(jobView),
        wallet: store.wallet(userId),
      };
    });
  });

  // -------------------------------------------------------------------------------------------
  // API FOR WALLET & BILLING ROUTES
  // -------------------------------------------------------------------------------------------

  app.get('/api/wallet', (req, res) => {
    res.json(store.wallet(req.session.user_id));
  });

  app.get('/api/billing/plans', async (_req, res) => {
    res.json({ plans: await billing.listPlans() });
  });

  app.get('/api/billing/credit-packs', async (_req, res) => {
    res.json({ packs: await billing.listCreditPacks() });
  });

  app.get('/api/billing/subscription', async (req, res) => {
    res.json({ subscription: billing.enabled ? await billing.subscription(req.session.user_id) : null });
  });

  app.post('/api/billing/checkout', billingLimit, MIDDLEWARE_JSON_ONLY, async (req, res) => {
    res.json(await billing.checkout(req.session.user_id, req.body?.planId, req.body?.requestId));
  });

  app.post('/api/billing/credit-checkout', billingLimit, MIDDLEWARE_JSON_ONLY, async (req, res) => {
    res.json(await billing.purchaseCredits(req.session.user_id, req.body?.packId, req.body?.requestId));
  });

  app.post('/api/billing/portal', billingLimit, async (req, res) => {
    res.json(await billing.portal(req.session.user_id));
  });

  // -------------------------------------------------------------------------------------------
  // END OF API ROUTES - HANDLE 404 FOR ANY OTHER ROUTES STARTING BY /API
  // -------------------------------------------------------------------------------------------

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Route introuvable.')));

  // -------------------------------------------------------------------------------------------
  // STATIC FILES
  // -------------------------------------------------------------------------------------------

  app.use(express.static(path.join(config.root, 'web'), { index: 'index.html', dotfiles: 'deny', etag: true, maxAge: 0 }));
  app.use((_req, _res, next) => next(new HttpError(404, 'Page introuvable.')));

  // -------------------------------------------------------------------------------------------
  // HANDLE ERRORS - ALL EXCEPTIONS IS CATCHED BY THIS MIDDLEWARE
  // -------------------------------------------------------------------------------------------

  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    let status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
    let message = status < 500 || error.status === 503 ? error.message : 'Une erreur interne est survenue.';
    if (error instanceof multer.MulterError) { status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400; message = 'Fichier trop volumineux ou formulaire invalide.'; }
    if (error.type === 'entity.parse.failed') { status = 400; message = 'JSON invalide.'; }
    if (error.type === 'entity.too.large') { status = 413; message = 'Requête trop volumineuse.'; }
    res.status(status).json({ error: message, ...(error.code && error instanceof HttpError ? { code: error.code } : {}) });
  });

  // -------------------------------------------------------------------------------------------
  // METHODS
  // -------------------------------------------------------------------------------------------

  let closed = false;
  let stopping = false;

  function beginShutdown() {
    if (stopping) {
      return;
    }

    stopping = true;
    accepting = false;
    jobs.pause();
    events.close();
  }

  async function close() {
    if (closed) {
      return;
    }

    closed = true;
    accepting = false;
    events.close();
    await jobs.close();
    store.close();
    releaseLock();
  }

  return {
    app,
    store,
    config,
    jobs,
    beginShutdown,
    close
  };
  } catch (error) {
    store?.close();
    releaseLock();
    throw error;
  }
}

module.exports = { createApplication };