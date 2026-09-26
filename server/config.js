'use strict';
const path = require('node:path');
const fs = require('node:fs');
function canonical(filename) {
  const suffix = [];
  let parent = path.resolve(filename);
  while (!fs.existsSync(parent)) { suffix.unshift(path.basename(parent)); parent = path.dirname(parent); }
  return path.join(fs.realpathSync(parent), ...suffix);
}

function integer(env, name, fallback, min, max) {
  const value = env[name] === undefined || env[name] === '' ? fallback : Number(env[name]);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Configuration invalide : ${name}`);
  return value;
}
function loadConfig(env = process.env) {
  const root = path.resolve(__dirname, '..');
  const production = env.NODE_ENV === 'production';
  const port = integer(env, 'PORT', 3000, 1, 65535);
  const origin = new URL(env.APP_URL || `http://localhost:${port}`);
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
      !['http:', 'https:'].includes(origin.protocol) || (production && origin.protocol !== 'https:')) {
    throw new Error('APP_URL doit être une origine HTTP(S), HTTPS en production.');
  }
  const dataDir = canonical(env.DATA_DIR || path.join(root, 'data'));
  const engineDir = path.join(root, 'engine');
  const within = (base, target) => target === base || target.startsWith(base + path.sep);
  if (['engine', 'web', 'server', 'test', 'node_modules'].some(name => {
    const protectedDir = canonical(path.join(root, name));
    return within(protectedDir, dataDir) || within(dataDir, protectedDir);
  }) || dataDir === canonical(root)) {
    throw new Error('DATA_DIR doit être séparé du code, du modèle engine et des fichiers web publics.');
  }
  // Refuse obsolete configuration instead of silently changing billing or leaving a live provider behind.
  for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PLANS', 'STRIPE_CREDIT_PACKS',
    'AUGGIE_DOCKER_IMAGE', 'AUGMENT_SESSION_AUTH', 'GENERATION_CREDITS', 'MAX_PROJECT_ASSET_BYTES']) {
    if (env[key]) throw new Error(`Configuration obsolète : ${key}. Consulter le guide de migration.`);
  }
  const catalog = (name, subscription) => {
    let entries;
    try { entries = JSON.parse(env[name] || '[]'); } catch { throw new Error(`${name} doit être un tableau JSON.`); }
    const validInt = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
    if (!Array.isArray(entries) || entries.length > 20 || entries.some(p => !p || !/^[a-z0-9_-]{1,40}$/.test(p.id) ||
      typeof p.name !== 'string' || !p.name.trim() || p.name.length > 80 || typeof p.variantId !== 'string' ||
      !/^[1-9]\d*$/.test(p.variantId) || !Number.isSafeInteger(Number(p.variantId)) ||
      !validInt(p.credits, 1, 1e9) || !validInt(p.amount, 1, 1e8) || p.currency !== 'eur' ||
      (subscription && (!validInt(p.maxProjects, 1, 1000) || !validInt(p.assetQuotaBytes, 1, 100 * 1024 ** 3)))) ||
      new Set(entries.map(p => p.id)).size !== entries.length) throw new Error(`${name} invalide.`);
    return entries;
  };
  const plans = catalog('LEMON_PLANS', true);
  const creditPacks = catalog('LEMON_CREDIT_PACKS', false);
  const offers = [...plans, ...creditPacks];
  if (new Set(offers.map(p => p.variantId)).size !== offers.length) throw new Error('Chaque offre doit avoir une variante Lemon Squeezy distincte.');
  if (env.LEMON_TEST_MODE && !['true', 'false'].includes(env.LEMON_TEST_MODE)) throw new Error('LEMON_TEST_MODE doit être true ou false.');
  const lemonTestMode = env.LEMON_TEST_MODE !== 'false';
  if (production && lemonTestMode && env.LEMON_API_KEY) throw new Error('LEMON_TEST_MODE=false est requis en production.');
  if (env.LEMON_STORE_ID && (!/^[1-9]\d*$/.test(env.LEMON_STORE_ID) || !Number.isSafeInteger(Number(env.LEMON_STORE_ID)))) throw new Error('LEMON_STORE_ID invalide.');
  const openaiModel = env.OPENAI_MODEL || 'gpt-6-astra';
  const openaiReasoningEffort = env.OPENAI_REASONING_EFFORT || 'medium';
  if (!/^gpt-6-astra(?:-\d{4}-\d{2}-\d{2})?$/.test(openaiModel)) throw new Error('OPENAI_MODEL doit être GPT-6 Astra : la tarification est spécifique à ce modèle.');
  if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(openaiReasoningEffort)) throw new Error('OPENAI_REASONING_EFFORT invalide.');
  const openaiMaxTurns = integer(env, 'OPENAI_MAX_TURNS', 12, 2, 50);
  const openaiPlanningMaxTurns = integer(env, 'OPENAI_PLANNING_MAX_TURNS', Math.min(5, openaiMaxTurns - 1), 1, openaiMaxTurns - 1);
  if (env.TRUST_PROXY && env.TRUST_PROXY !== 'loopback') throw new Error('TRUST_PROXY accepte uniquement loopback ou une valeur vide.');
  return {
    root, engineDir, dataDir, databasePath: path.join(dataDir, 'platform.sqlite'), port,
    trustProxy: env.TRUST_PROXY === 'loopback' ? 'loopback' : false,
    host: env.HOST || '127.0.0.1', appUrl: origin.origin, secureCookies: origin.protocol === 'https:',
    generationMaxCredits: integer(env, 'GENERATION_MAX_CREDITS', 200, 1, 1000000),
    aiMicroUsdPerCredit: integer(env, 'AI_MICRO_USD_PER_CREDIT', 10000, 1, 1000000000),
    maxProjects: integer(env, 'MAX_PROJECTS_PER_USER', 2, 1, 1000),
    maxAssetBytes: integer(env, 'MAX_ASSET_BYTES', 20 * 1024 * 1024, 1, 100 * 1024 * 1024),
    maxUserAssetBytes: integer(env, 'MAX_USER_ASSET_BYTES', 500 * 1024 * 1024, 1, 100 * 1024 ** 3),
    maxConcurrentJobs: integer(env, 'MAX_CONCURRENT_JOBS', 2, 1, 16),
    jobTimeoutMs: integer(env, 'JOB_TIMEOUT_SECONDS', 600, 10, 1800) * 1000,
    openaiApiKey: env.OPENAI_API_KEY || '', openaiModel, openaiReasoningEffort,
    openaiMaxTurns, openaiPlanningMaxTurns,
    openaiMaxRepairs: integer(env, 'OPENAI_MAX_REPAIRS', 1, 0, 3),
    openaiMaxOutputTokens: integer(env, 'OPENAI_MAX_OUTPUT_TOKENS', 4096, 16, 128000),
    openaiMaxContextBytes: integer(env, 'OPENAI_MAX_CONTEXT_BYTES', 100000, 10000, 250000),
    openaiRequestTimeoutMs: integer(env, 'OPENAI_REQUEST_TIMEOUT_SECONDS', 120, 1, 600) * 1000,
    openaiInputMicroUsdPerMillion: integer(env, 'OPENAI_INPUT_MICRO_USD_PER_MILLION', 10000000, 1, 1000000000),
    openaiCachedInputMicroUsdPerMillion: integer(env, 'OPENAI_CACHED_INPUT_MICRO_USD_PER_MILLION', 1000000, 1, 1000000000),
    openaiOutputMicroUsdPerMillion: integer(env, 'OPENAI_OUTPUT_MICRO_USD_PER_MILLION', 50000000, 1, 1000000000),
    lemonApiKey: env.LEMON_API_KEY || '', lemonWebhookSecret: env.LEMON_WEBHOOK_SECRET || '',
    lemonStoreId: env.LEMON_STORE_ID || '', lemonTestMode, plans, creditPacks,
  };
}
module.exports = { loadConfig };
