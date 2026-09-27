'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseEnv } = require('node:util');
const { randomBytes } = require('node:crypto');
const { loadConfig } = require('../server/config');
const plan = { id: 'studio', name: 'Studio', variantId: '101', credits: 100, amount: 1490,
  currency: 'eur', maxProjects: 2, assetQuotaBytes: 500 * 1024 ** 2 };
const pack = { id: 'boost', name: 'Boost', variantId: '102', credits: 50, amount: 500, currency: 'eur' };

test('documented blank-secret environment starts safely with disabled providers and metered defaults', () => {
  const config = loadConfig(parseEnv(fs.readFileSync('.env.example', 'utf8')));
  assert.equal(Boolean(config.anthropicApiKey), false); assert.equal(Boolean(config.openaiApiKey), false);
  assert.equal(Boolean(config.lemonApiKey), false);
  assert.deepEqual(config.plans, []); assert.deepEqual(config.creditPacks, []);
  assert.equal(config.generationMaxCredits, 200); assert.equal(config.aiMicroUsdPerCredit, 10000);
  assert.equal(config.maxUserAssetBytes, 500 * 1024 ** 2); assert.equal(config.lemonTestMode, true);
  assert.equal(config.aiderModel, 'anthropic/claude-sonnet-4-6');
  assert.equal(config.aiderImage, 'paulgauthier/aider:v0.86.2');
  for (const field of ['openaiModel', 'openaiReasoningEffort', 'openaiMaxTurns', 'openaiPlanningMaxTurns',
    'openaiMaxRepairs', 'openaiMaxOutputTokens', 'openaiMaxContextBytes', 'openaiInputMicroUsdPerMillion',
    'openaiCachedInputMicroUsdPerMillion', 'openaiOutputMicroUsdPerMillion']) assert.equal(Object.hasOwn(config, field), false);
});
test('catalogues validate immutable price, entitlement and distinct variant configuration', () => {
  const env = { LEMON_PLANS: JSON.stringify([plan]), LEMON_CREDIT_PACKS: JSON.stringify([pack]) };
  assert.deepEqual(loadConfig(env).plans, [plan]); assert.deepEqual(loadConfig(env).creditPacks, [pack]);
  for (const changed of [{ amount: 0 }, { credits: 0.5 }, { currency: 'usd' }, { variantId: 101 },
    { variantId: 'price_old' }, { maxProjects: 0 }, { assetQuotaBytes: -1 }]) {
    assert.throws(() => loadConfig({ ...env, LEMON_PLANS: JSON.stringify([{ ...plan, ...changed }]) }));
  }
  assert.throws(() => loadConfig({ ...env, LEMON_CREDIT_PACKS: JSON.stringify([{ ...pack, variantId: plan.variantId }]) }));
  assert.throws(() => loadConfig({ LEMON_PLANS: JSON.stringify([plan, plan]) }));
  for (const value of ['{}', 'null', '[null]', 'invalid']) assert.throws(() => loadConfig({ LEMON_PLANS: value }));
});
test('generation limits, store and live/test mode fail closed', () => {
  for (const env of [{ GENERATION_MAX_CREDITS: '0' }, { GENERATION_MAX_CREDITS: '1.5' },
    { GENERATION_MAX_CREDITS: '1000001' }, { AI_MICRO_USD_PER_CREDIT: '0' },
    { AI_MICRO_USD_PER_CREDIT: '1.5' }, { AI_MICRO_USD_PER_CREDIT: '1000000001' },
    { MAX_CONCURRENT_JOBS: '0' }, { JOB_TIMEOUT_SECONDS: '9' }, { JOB_TIMEOUT_SECONDS: '1801' },
    { LEMON_STORE_ID: '0' }, { LEMON_TEST_MODE: 'yes' }]) {
    assert.throws(() => loadConfig(env));
  }
  const live = { NODE_ENV: 'production', APP_URL: 'https://studio.example.test',
    LEMON_API_KEY: randomBytes(24).toString('hex') };
  assert.throws(() => loadConfig(live));
  assert.equal(loadConfig({ ...live, LEMON_TEST_MODE: 'false' }).lemonTestMode, false);
});
test('Aider defaults and provider-prefixed model overrides do not require configured credentials', () => {
  const defaults = loadConfig({});
  assert.equal(defaults.aiderModel, 'anthropic/claude-sonnet-4-6');
  assert.equal(defaults.aiderImage, 'paulgauthier/aider:v0.86.2');
  assert.equal(Boolean(defaults.anthropicApiKey), false); assert.equal(Boolean(defaults.openaiApiKey), false);
  for (const aiderModel of ['anthropic/claude-sonnet-4-6', 'anthropic/custom-model_1.2', 'openai/gpt-4.1', 'openai/custom-model']) {
    assert.equal(loadConfig({ AIDER_MODEL: aiderModel }).aiderModel, aiderModel);
  }
  const image = 'registry.example.test/tools/aider:v0.86.2';
  assert.equal(loadConfig({ AIDER_DOCKER_IMAGE: image }).aiderImage, image);
  const env = { ANTHROPIC_API_KEY: randomBytes(24).toString('hex'), OPENAI_API_KEY: randomBytes(24).toString('hex') };
  const configured = loadConfig(env);
  assert.ok(configured.anthropicApiKey === env.ANTHROPIC_API_KEY);
  assert.ok(configured.openaiApiKey === env.OPENAI_API_KEY);
});
test('Aider model provider prefixes and Docker image arguments fail closed', () => {
  for (const model of ['claude-sonnet-4-6', 'google/gemini', 'azure/gpt-4.1', 'Anthropic/claude',
    'anthropic/', 'openai/', 'openai/model/extra', 'anthropic/model name', 'openai/model;command',
    'openai/model\n', `anthropic/${'x'.repeat(101)}`]) {
    assert.throws(() => loadConfig({ AIDER_MODEL: model }), /AIDER_MODEL/);
  }
  for (const image of ['--privileged', 'aider image', 'aider;command', 'aider$(command)', 'x'.repeat(202)]) {
    assert.throws(() => loadConfig({ AIDER_DOCKER_IMAGE: image }), /AIDER_DOCKER_IMAGE/);
  }
});
test('obsolete provider configuration is refused rather than silently changing commercial terms', () => {
  for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PLANS', 'STRIPE_CREDIT_PACKS',
    'AUGGIE_DOCKER_IMAGE', 'AUGMENT_SESSION_AUTH', 'GENERATION_CREDITS', 'MAX_PROJECT_ASSET_BYTES',
    'OPENAI_MODEL', 'OPENAI_REASONING_EFFORT', 'OPENAI_MAX_TURNS', 'OPENAI_PLANNING_MAX_TURNS',
    'OPENAI_MAX_REPAIRS', 'OPENAI_MAX_OUTPUT_TOKENS', 'OPENAI_MAX_CONTEXT_BYTES',
    'OPENAI_INPUT_MICRO_USD_PER_MILLION', 'OPENAI_CACHED_INPUT_MICRO_USD_PER_MILLION',
    'OPENAI_OUTPUT_MICRO_USD_PER_MILLION']) {
    assert.throws(() => loadConfig({ [key]: 'obsolete' }), /Configuration obsolète/);
  }
});
