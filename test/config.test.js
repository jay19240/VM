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
  assert.equal(Boolean(config.openaiApiKey), false);
  assert.equal(Boolean(config.lemonApiKey), false);
  assert.deepEqual(config.plans, []); assert.deepEqual(config.creditPacks, []);
  assert.equal(config.generationMaxCredits, 200); assert.equal(config.aiMicroUsdPerCredit, 10000);
  assert.equal(config.maxUserAssetBytes, 500 * 1024 ** 2); assert.equal(config.lemonTestMode, true);
  assert.equal(config.openaiPlanningMaxTurns, 5); assert.equal(config.openaiMaxRepairs, 1);
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
test('provider models, limits, store and live/test mode fail closed', () => {
  for (const env of [{ OPENAI_MODEL: 'unpriced-model' }, { OPENAI_REASONING_EFFORT: 'none' },
    { OPENAI_MAX_TURNS: '0' }, { OPENAI_MAX_TURNS: '1' }, { OPENAI_PLANNING_MAX_TURNS: '0' },
    { OPENAI_MAX_TURNS: '3', OPENAI_PLANNING_MAX_TURNS: '3' }, { OPENAI_MAX_REPAIRS: '-1' },
    { OPENAI_MAX_REPAIRS: '4' }, { OPENAI_MAX_REPAIRS: '0.5' },
    { OPENAI_MAX_OUTPUT_TOKENS: '15' }, { OPENAI_MAX_CONTEXT_BYTES: '999999' },
    { OPENAI_INPUT_MICRO_USD_PER_MILLION: '-1' }, { LEMON_STORE_ID: '0' }, { LEMON_TEST_MODE: 'yes' }]) {
    assert.throws(() => loadConfig(env));
  }
  const live = { NODE_ENV: 'production', APP_URL: 'https://studio.example.test',
    LEMON_API_KEY: randomBytes(24).toString('hex') };
  assert.throws(() => loadConfig(live));
  assert.equal(loadConfig({ ...live, LEMON_TEST_MODE: 'false' }).lemonTestMode, false);
});
test('agent preparation leaves turns for coding and repairs can be disabled', () => {
  const config = loadConfig({ OPENAI_MAX_TURNS: '3', OPENAI_MAX_REPAIRS: '0' });
  assert.equal(config.openaiPlanningMaxTurns, 2); assert.equal(config.openaiMaxRepairs, 0);
});
test('obsolete provider configuration is refused rather than silently changing commercial terms', () => {
  for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PLANS', 'STRIPE_CREDIT_PACKS',
    'AUGGIE_DOCKER_IMAGE', 'AUGMENT_SESSION_AUTH', 'GENERATION_CREDITS', 'MAX_PROJECT_ASSET_BYTES']) {
    assert.throws(() => loadConfig({ [key]: 'obsolete' }), /Configuration obsolète/);
  }
});
