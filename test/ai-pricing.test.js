'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPricing, ceilDiv, DENOMINATOR, MAX_INPUT_TOKENS } = require('../server/ai-pricing');
function counts(input, cached, written, output, reasoning = 0) {
  return { input_tokens: input, input_tokens_details: { cached_tokens: cached, cache_write_tokens: written },
    output_tokens: output, output_tokens_details: { reasoning_tokens: reasoning }, total_tokens: input + output };
}

test('exact BigInt costs include cache writes and cached subsets without double-counting reasoning', () => {
  const p = createPricing({});
  const result = p.usage(counts(100, 20, 30, 10, 8));
  assert.equal(result.costNumerator, 1395n * DENOMINATOR);
  assert.equal(result.costNumerator, p.usage(counts(100, 20, 30, 10, 0)).costNumerator);
  assert.equal(p.usage(counts(1, 0, 1, 0)).costNumerator, 50_000_000n); // 12.5 micro-USD.
  assert.equal(ceilDiv(50_000_000n, DENOMINATOR), 13n);
  assert.equal(p.budget(1), 10000n * DENOMINATOR);
});

test('rounding uses integers even when multiplication exceeds Number precision', () => {
  const input = 272000;
  const rate = 9007199254740991;
  const p = createPricing({ openaiInputMicroUsdPerMillion: rate });
  const result = p.usage(counts(input, 0, 0, 0));
  assert.equal(result.costNumerator, BigInt(input) * BigInt(rate) * 4n);
  assert.equal(ceilDiv(result.costNumerator, DENOMINATOR), (BigInt(input) * BigInt(rate) + 999999n) / 1000000n);
});

test('reservation prices every input token at the worst rate and reduces output safely', () => {
  const p = createPricing({});
  assert.equal(p.reserve(1000, 4096, p.budget(10)), 1750); // (100000 - 12500) / 50.
  assert.equal(p.reserve(1000, 100, p.budget(10)), 100);
  assert.throws(() => p.reserve(1000, 4096, p.budget(1)));
  assert.throws(() => p.reserve(MAX_INPUT_TOKENS + 1, 4096, p.budget(10000)));
  // Also works with a deliberately higher configured cached-input rate.
  const expensiveCache = createPricing({ openaiCachedInputMicroUsdPerMillion: 100000000 });
  assert.throws(() => expensiveCache.reserve(1000, 4096, expensiveCache.budget(10)));
});

test('unexpected long-context usage is recorded at its actual higher tariff', () => {
  const result = createPricing({}).usage(counts(272001, 1, 2, 10, 3));
  assert.equal(result.longContext, true);
  assert.equal(result.costNumerator, (271998n * 20n + 2n + 50n + 750n) * DENOMINATOR);
});

test('invalid prices, budget types, token counts, subsets and missing cache-write counts fail closed', () => {
  for (const value of [0, -1, 1.2, Infinity, '10000000']) assert.throws(() => createPricing({ openaiInputMicroUsdPerMillion: value }));
  const p = createPricing({});
  for (const value of [undefined, 0, -1, 1.2, '1']) assert.throws(() => p.budget(value));
  const good = counts(10, 2, 3, 4, 1);
  const cases = [null, {}, { ...good, input_tokens: '10' }, { ...good, input_tokens: -1 },
    { ...good, total_tokens: 15 }, { ...good, output_tokens_details: { reasoning_tokens: 5 } },
    { ...good, input_tokens_details: { cached_tokens: 11, cache_write_tokens: 0 } },
    { ...good, input_tokens_details: { cached_tokens: 8, cache_write_tokens: 3 } },
    { ...good, input_tokens_details: { cached_tokens: 0 } },
    { ...good, input_tokens_details: { cached_tokens: 0, cache_write_tokens: -1 } }];
  for (const value of cases) assert.throws(() => p.usage(value));
});
