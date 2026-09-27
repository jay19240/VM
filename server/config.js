const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function loadConfig(env = process.env) {
  for (const name of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PLANS', 'STRIPE_CREDIT_PACKS',
    'AUGGIE_DOCKER_IMAGE', 'AUGMENT_SESSION_AUTH', 'GENERATION_CREDITS', 'MAX_PROJECT_ASSET_BYTES',
    'OPENAI_MODEL', 'OPENAI_REASONING_EFFORT', 'OPENAI_MAX_TURNS', 'OPENAI_PLANNING_MAX_TURNS',
    'OPENAI_MAX_REPAIRS', 'OPENAI_MAX_OUTPUT_TOKENS', 'OPENAI_MAX_CONTEXT_BYTES', 'OPENAI_REQUEST_TIMEOUT_SECONDS',
    'OPENAI_INPUT_MICRO_USD_PER_MILLION', 'OPENAI_CACHED_INPUT_MICRO_USD_PER_MILLION', 'OPENAI_OUTPUT_MICRO_USD_PER_MILLION']) {
    if (env[name]) throw new Error(`Configuration obsolète : ${name}`);
  }
  const port = integer(env, 'PORT', 3000, 1, 65535);
  let origin;
  try { origin = new URL(env.APP_URL || `http://localhost:${port}`); }
  catch { throw new Error('Configuration invalide : APP_URL'); }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash ||
      (env.NODE_ENV === 'production' && origin.protocol !== 'https:')) {
    throw new Error('Configuration invalide : APP_URL');
  }
  const dataDir = path.resolve(env.DATA_DIR || path.join(root, 'data'));
  const actualDataDir = canonicalPath(dataDir);
  for (const directory of ['engine', 'web']) {
    const protectedDir = path.join(root, directory);
    if (contains(protectedDir, dataDir) || contains(canonicalPath(protectedDir), actualDataDir)) {
      throw new Error('Configuration invalide : DATA_DIR');
    }
  }
  const plans = catalogue(env, 'LEMON_PLANS', true);
  const creditPacks = catalogue(env, 'LEMON_CREDIT_PACKS', false);
  const offers = [...plans, ...creditPacks];
  if (new Set(offers.map(offer => offer.variantId)).size !== offers.length) {
    throw new Error('Configuration invalide : variantes Lemon dupliquées');
  }
  if (env.LEMON_STORE_ID && !numericId(env.LEMON_STORE_ID)) {
    throw new Error('Configuration invalide : LEMON_STORE_ID');
  }
  const mode = env.LEMON_TEST_MODE || '';
  if ((mode && !['true', 'false'].includes(mode)) ||
      (!mode && env.NODE_ENV === 'production' && env.LEMON_API_KEY)) {
    throw new Error('Configuration invalide : LEMON_TEST_MODE');
  }
  const lemonTestMode = mode !== 'false';
  const aiderModel = env.AIDER_MODEL || 'anthropic/claude-sonnet-4-6';
  if (!/^(anthropic|openai)\/[A-Za-z0-9_.-]{1,100}$/.test(aiderModel)) {
    throw new Error('Configuration invalide : AIDER_MODEL');
  }
  const aiderImage = env.AIDER_DOCKER_IMAGE || 'paulgauthier/aider:v0.86.2';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_./:@-]{1,200}$/.test(aiderImage)) {
    throw new Error('Configuration invalide : AIDER_DOCKER_IMAGE');
  }

  return {
    root: root,
    engineDir: path.join(root, 'engine'),
    dataDir: dataDir,
    databasePath: path.join(dataDir, 'platform.sqlite'),
    port: port,
    trustProxy: env.TRUST_PROXY === 'loopback' ? 'loopback' : false,
    host: env.HOST || '127.0.0.1',
    appUrl: origin.origin,
    secureCookies: origin.protocol === 'https:',
    generationMaxCredits: integer(env, 'GENERATION_MAX_CREDITS', 200, 1, 1000000),
    aiMicroUsdPerCredit: integer(env, 'AI_MICRO_USD_PER_CREDIT', 10000, 1, 1000000000),
    maxProjects: integer(env, 'MAX_PROJECTS_PER_USER', 2, 1, 1000),
    maxAssetBytes: integer(env, 'MAX_ASSET_BYTES', 20 * 1024 * 1024, 1, 100 * 1024 * 1024),
    maxUserAssetBytes: integer(env, 'MAX_USER_ASSET_BYTES', 500 * 1024 * 1024, 1, 100 * 1024 ** 3),
    maxConcurrentJobs: integer(env, 'MAX_CONCURRENT_JOBS', 2, 1, 16),
    jobTimeoutMs: integer(env, 'JOB_TIMEOUT_SECONDS', 600, 10, 1800) * 1000,
    aiderModel,
    aiderImage,
    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
    openaiApiKey: env.OPENAI_API_KEY || '',
    lemonApiKey: env.LEMON_API_KEY || '',
    lemonWebhookSecret: env.LEMON_WEBHOOK_SECRET || '',
    lemonStoreId: env.LEMON_STORE_ID || '',
    lemonTestMode,
    plans,
    creditPacks
  };
}

module.exports = { loadConfig };

// -------------------------------------------------------------------------------------------
// HELPFUL
// -------------------------------------------------------------------------------------------

function contains(directory, filename) {
  const relative = path.relative(directory, filename);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function canonicalPath(filename) {
  try { return fs.realpathSync(filename); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Configuration invalide : DATA_DIR');
    // Do not resolve through dangling symlinks as if they were ordinary missing directories.
    try {
      if (fs.lstatSync(filename).isSymbolicLink()) throw new Error('Configuration invalide : DATA_DIR');
    } catch (statError) { if (statError.code !== 'ENOENT') throw statError; }
    const parent = path.dirname(filename);
    if (parent === filename) throw new Error('Configuration invalide : DATA_DIR');
    return path.join(canonicalPath(parent), path.basename(filename));
  }
}

function numericId(value) {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
}

function catalogue(env, name, subscription) {
  let entries;
  try { entries = JSON.parse(env[name] || '[]'); }
  catch { throw new Error(`Configuration invalide : ${name}`); }
  const positive = (value, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value > 0 && value <= max;
  const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  if (!Array.isArray(entries) || entries.some(offer => !offer ||
      !text(offer.id, 100) || !text(offer.name, 100) || !numericId(offer.variantId) ||
      !positive(offer.credits, 1e9) || !positive(offer.amount) || offer.currency !== 'eur' ||
      (subscription && (!positive(offer.maxProjects, 1000) || !positive(offer.assetQuotaBytes, 100 * 1024 ** 3)))) ||
      new Set(entries.map(offer => offer.id)).size !== entries.length) {
    throw new Error(`Configuration invalide : ${name}`);
  }
  return entries;
}

function integer(env, name, fallback, min, max) {
  const value = env[name] === undefined || env[name] === '' ? fallback : Number(env[name]);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Configuration invalide : ${name}`);
  }

  return value;
}