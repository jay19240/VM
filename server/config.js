const path = require('node:path');
const root = path.resolve(__dirname, '..');

function loadConfig(env = process.env) {
  const port = integer(env, 'PORT', 3000, 1, 65535);

  return {
    root: root,
    engineDir: path.join(root, 'engine'),
    dataDir: path.join(root, 'data'),
    databasePath: path.join(dataDir, 'platform.sqlite'),
    port: port,
    trustProxy: env.TRUST_PROXY === 'loopback' ? 'loopback' : false,
    host: env.HOST || '127.0.0.1',
    appUrl: new URL(env.APP_URL || `http://localhost:${port}`).origin,
    secureCookies: origin.protocol === 'https:',
    generationMaxCredits: integer(env, 'GENERATION_MAX_CREDITS', 200, 1, 1000000),
    aiMicroUsdPerCredit: integer(env, 'AI_MICRO_USD_PER_CREDIT', 10000, 1, 1000000000),
    maxProjects: integer(env, 'MAX_PROJECTS_PER_USER', 2, 1, 1000),
    maxAssetBytes: integer(env, 'MAX_ASSET_BYTES', 20 * 1024 * 1024, 1, 100 * 1024 * 1024),
    maxUserAssetBytes: integer(env, 'MAX_USER_ASSET_BYTES', 500 * 1024 * 1024, 1, 100 * 1024 ** 3),
    maxConcurrentJobs: integer(env, 'MAX_CONCURRENT_JOBS', 2, 1, 16),
    jobTimeoutMs: integer(env, 'JOB_TIMEOUT_SECONDS', 600, 10, 1800) * 1000,
    openaiApiKey: env.OPENAI_API_KEY || '',
    openaiModel: env.OPENAI_MODEL || 'gpt-6-astra',
    openaiReasoningEffort: env.OPENAI_REASONING_EFFORT || 'medium',
    openaiMaxTurns: integer(env, 'OPENAI_MAX_TURNS', 12, 2, 50),
    openaiPlanningMaxTurns: integer(env, 'OPENAI_PLANNING_MAX_TURNS', Math.min(5, openaiMaxTurns - 1), 1, openaiMaxTurns - 1),
    openaiMaxRepairs: integer(env, 'OPENAI_MAX_REPAIRS', 1, 0, 3),
    openaiMaxOutputTokens: integer(env, 'OPENAI_MAX_OUTPUT_TOKENS', 4096, 16, 128000),
    openaiMaxContextBytes: integer(env, 'OPENAI_MAX_CONTEXT_BYTES', 100000, 10000, 250000),
    openaiRequestTimeoutMs: integer(env, 'OPENAI_REQUEST_TIMEOUT_SECONDS', 120, 1, 600) * 1000,
    openaiInputMicroUsdPerMillion: integer(env, 'OPENAI_INPUT_MICRO_USD_PER_MILLION', 10000000, 1, 1000000000),
    openaiCachedInputMicroUsdPerMillion: integer(env, 'OPENAI_CACHED_INPUT_MICRO_USD_PER_MILLION', 1000000, 1, 1000000000),
    openaiOutputMicroUsdPerMillion: integer(env, 'OPENAI_OUTPUT_MICRO_USD_PER_MILLION', 50000000, 1, 1000000000),
    lemonApiKey: env.LEMON_API_KEY || '',
    lemonWebhookSecret: env.LEMON_WEBHOOK_SECRET || '',
    lemonStoreId: env.LEMON_STORE_ID || '',
    lemonTestMode
  };
}

module.exports = { loadConfig };

// -------------------------------------------------------------------------------------------
// HELPFUL
// -------------------------------------------------------------------------------------------

function integer(env, name, fallback, min, max) {
  const value = env[name] === undefined || env[name] === '' ? fallback : Number(env[name]);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Configuration invalide : ${name}`);
  }

  return value;
}