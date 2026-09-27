const express = require('express');
const path = require('node:path');
const { createProjects } = require('./files');
const { createAider } = require('./aider');
const { acquireLock } = require('./lock');
const { loadConfig } = require('./config');

async function createApplication({ config = loadConfig(), runner = createAider(config) } = {}) {
  const releaseLock = acquireLock(config.dataDir);
  let projects;
  let closing;

  function close() {
    if (!closing) {
      closing = (async () => {
        if (projects) await projects.close();
        // Keep the lock if cleanup fails: another server must not touch these files.
        releaseLock();
      })();
    }
    return closing;
  }

  try {
    await runner.initialize();
    projects = createProjects({ config, runner });
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', false);

    app.use((_req, res, next) => {
      res.set({
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Cross-Origin-Opener-Policy': 'same-origin'
      });
      next();
    });

    app.use('/api', (req, res, next) => {
      res.set('Cache-Control', 'no-store');
      const host = req.get('host') || '';
      const local = /^(?:localhost|127\.0\.0\.1)(?::([1-9]\d{0,4}))?$/.exec(host);
      const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      const origin = req.get('origin');
      // Validate raw Host, never forwarded headers. No proxy/tunnel support.
      if (!local || Number(local[1]) > 65535 || req.get('sec-fetch-site') === 'cross-site' ||
          (mutation && origin !== undefined && origin !== `http://${host}`)) {
        return res.status(403).json({ error: 'Requête locale de même origine requise.' });
      }
      if (closing) return res.status(503).json({ error: 'Le serveur est en cours d’arrêt.' });
      if (mutation && !req.is('application/json')) {
        return res.status(415).json({ error: 'Un objet JSON est requis.' });
      }
      next();
    });
    app.use('/api', express.json({ limit: '64kb', inflate: false }));
    app.use('/api', (req, res, next) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
          (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) {
        return res.status(400).json({ error: 'Un objet JSON est requis.' });
      }
      next();
    });

    app.get('/api/config', (_req, res) => {
      res.json({ model: config.aiderModel, generationEnabled: Boolean(runner.enabled && projects.available) });
    });
    app.get('/api/projects', async (_req, res) => {
      res.json({ projects: await projects.list() });
    });
    app.post('/api/projects', async (req, res) => {
      res.status(201).json({ project: await projects.create(req.body.name) });
    });
    app.get('/api/projects/:id/code', async (req, res) => {
      res.json({ code: await projects.readCode(req.params.id) });
    });
    app.post('/api/projects/:id/generate', async (req, res) => {
      const project = await projects.generate(req.params.id, req.body.prompt);
      res.json({ project, code: await projects.readCode(req.params.id) });
    });
    app.use('/api', (_req, res) => res.status(404).json({ error: 'Route introuvable.' }));

    // Only the trusted UI is public. Generated code is JSON, never served or executed.
    app.use(express.static(path.join(config.root, 'web'), { dotfiles: 'deny', maxAge: 0 }));
    app.use((_req, res) => res.status(404).json({ error: 'Page introuvable.' }));
    app.use((error, _req, res, next) => {
      if (res.headersSent) return next(new Error('Erreur HTTP.'));
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
      // Never return paths, provider diagnostics, parser input, or credentials from error.message.
      const messages = {
        400: 'Requête invalide.', 403: 'Requête interdite.', 404: 'Projet ou ressource introuvable.',
        409: 'Une génération est déjà en cours ou le projet est indisponible.',
        413: 'Requête trop volumineuse.', 415: 'Un objet JSON non compressé est requis.',
        503: 'La génération est indisponible.'
      };
      res.status(status).json({ error: messages[status] || (status < 500 ? 'Requête refusée.' : 'Une erreur interne est survenue.') });
    });
    return { app, config, close };
  } catch (error) {
    await close();
    throw error;
  }
}

module.exports = { createApplication };