'use strict';

// All arithmetic stays in integer quarter-millionths of a micro-dollar. The
// extra factor of four represents Astra's documented 1.25x cache-write rate.
// https://developers.openai.com/api/docs/models/gpt-6-astra
// https://developers.openai.com/api/docs/guides/prompt-caching
const DENOMINATOR = 4000000n;
const MAX_INPUT_TOKENS = 272000;
function integer(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const result = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(result) || result < min || result > max) throw new Error('Invalid AI pricing configuration');
  return result;
}
function ceilDiv(n, d) { return (n + d - 1n) / d; }
function safeNumber(n) {
  if (n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('AI accounting exceeds limits');
  return Number(n);
}
function createPricing(config) {
  const rates = Object.freeze({
    inputMicroUsdPerMillion: integer(config.openaiInputMicroUsdPerMillion, 10000000, 1),
    cachedInputMicroUsdPerMillion: integer(config.openaiCachedInputMicroUsdPerMillion, 1000000, 1),
    outputMicroUsdPerMillion: integer(config.openaiOutputMicroUsdPerMillion, 50000000, 1),
    cacheWriteMultiplierNumerator: 5, cacheWriteMultiplierDenominator: 4,
  });
  const microUsdPerCredit = integer(config.aiMicroUsdPerCredit, 10000, 1);
  const inputRate = BigInt(rates.inputMicroUsdPerMillion) * 4n;
  const cachedRate = BigInt(rates.cachedInputMicroUsdPerMillion) * 4n;
  const writeRate = BigInt(rates.inputMicroUsdPerMillion) * 5n;
  const outputRate = BigInt(rates.outputMicroUsdPerMillion) * 4n;
  const worstInputRate = [inputRate, cachedRate, writeRate].reduce((a, b) => a > b ? a : b);
  return {
    rates,
    budget(credits) { return BigInt(integer(credits, undefined, 1)) * BigInt(microUsdPerCredit) * DENOMINATOR; },
    reserve(inputBound, maxOutput, remaining) {
      integer(inputBound, undefined, 1, MAX_INPUT_TOKENS);
      integer(maxOutput, undefined, 16, 128000);
      const available = remaining - BigInt(inputBound) * worstInputRate;
      const allowed = available > 0n ? available / outputRate : 0n;
      if (allowed < 16n) throw new Error('AI budget cannot cover another request');
      return Number(allowed < BigInt(maxOutput) ? allowed : BigInt(maxOutput));
    },
    usage(usage) {
      // Missing counts are not zero. Cache writes are billed on this model.
      const count = value => {
        if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid AI usage');
        return value;
      };
      const inputTokens = count(usage?.input_tokens);
      const cachedInputTokens = count(usage?.input_tokens_details?.cached_tokens);
      const cacheWriteInputTokens = count(usage?.input_tokens_details?.cache_write_tokens);
      const outputTokens = count(usage?.output_tokens);
      const totalTokens = count(usage?.total_tokens);
      const reasoningTokens = count(usage?.output_tokens_details?.reasoning_tokens);
      const ordinary = BigInt(inputTokens) - BigInt(cachedInputTokens) - BigInt(cacheWriteInputTokens);
      if (ordinary < 0n || reasoningTokens > outputTokens ||
          BigInt(totalTokens) !== BigInt(inputTokens) + BigInt(outputTokens)) throw new Error('Invalid AI usage');
      // Requests are gated below this threshold. If a provider nevertheless
      // reports a long-context response, record its documented higher cost and
      // let the runner fail it before any tools/publication.
      const longContext = inputTokens > MAX_INPUT_TOKENS;
      const inputMultiplier = longContext ? 2n : 1n;
      const outputPrice = longContext ? outputRate * 3n / 2n : outputRate;
      return { inputTokens, cachedInputTokens, cacheWriteInputTokens, outputTokens, reasoningTokens, longContext,
        costNumerator: (ordinary * inputRate + BigInt(cachedInputTokens) * cachedRate +
          BigInt(cacheWriteInputTokens) * writeRate) * inputMultiplier + BigInt(outputTokens) * outputPrice };
    },
  };
}
module.exports = { createPricing, ceilDiv, safeNumber, DENOMINATOR, MAX_INPUT_TOKENS };
