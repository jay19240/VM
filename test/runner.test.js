'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { createOpenAIRunner } = require('../server/runner');
const { createPricing } = require('../server/ai-pricing');

function usage(overrides = {}) {
  return { input_tokens: 100, input_tokens_details: { cached_tokens: 20, cache_write_tokens: 30 },
    output_tokens: 10, output_tokens_details: { reasoning_tokens: 2 }, total_tokens: 110, ...overrides };
}
function message(id = 'msg_final') {
  return { id, type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: 'Done', annotations: [] }] };
}
function call(id = 'one', name = 'write_game_file', args = { path: 'src/game/main.js', content: 'export const level = 2;\n' }) {
  return { id: `fc_${id}`, type: 'function_call', call_id: `call_${id}`, status: 'completed', name, arguments: JSON.stringify(args) };
}
function response(id = 'resp_one', output = [message()], overrides = {}) {
  return { id, object: 'response', status: 'completed', model: 'gpt-6-astra', service_tier: 'default',
    error: null, incomplete_details: null, output, usage: usage(), ...overrides };
}
function http(data) { return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } }); }
async function fixture(t, replies = [response()], overrides = {}) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'openai-runner-test-'));
  // Only this verified mkdtemp tree is ever removed. Real engine/ is never used.
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const engineDir = path.join(temp, 'engine'); const gameDir = path.join(temp, 'draft');
  await fs.mkdir(path.join(engineDir, 'src/lib'), { recursive: true });
  await fs.mkdir(path.join(engineDir, 'src/game'), { recursive: true });
  await fs.mkdir(gameDir);
  const original = 'export const level = 1;\n';
  await fs.writeFile(path.join(engineDir, 'src/game/main.js'), original);
  await fs.writeFile(path.join(engineDir, 'src/lib/engine.js'), 'export const immutable = true;');
  await fs.writeFile(path.join(gameDir, 'main.js'), original);
  const config = { openaiApiKey: randomBytes(24).toString('hex'), ...overrides };
  const requests = []; const records = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, options, body });
    const reply = replies[requests.length - 1];
    assert.ok(reply, 'Unexpected HTTP request');
    return typeof reply === 'function' ? reply(options, body) : http(reply);
  };
  const runner = createOpenAIRunner(config, fetchImpl);
  const request = { id: randomUUID(), engineDir, gameDir, prompt: 'Create a level.', budgetCredits: 1000,
    onUsage: record => { records.push(record); } };
  return { runner, request, config, requests, records, original,
    draft: () => fs.readFile(path.join(gameDir, 'main.js'), 'utf8'),
    live: () => fs.readFile(path.join(engineDir, 'src/game/main.js'), 'utf8') };
}

test('Responses loop preserves encrypted reasoning, records usage before tools, and edits only the draft', async t => {
  const reasoning = { type: 'reasoning', id: 'rs_one', summary: [], encrypted_content: 'opaque-reasoning' };
  const h = await fixture(t, [
    response('resp_one', [reasoning, call('read', 'read_file', { path: 'src/lib/engine.js', offset: 0, limit: 1000 })]),
    response('resp_two', [call('write')]), response('resp_three'),
  ]);
  let callbacks = 0;
  const result = await h.runner.run({ ...h.request, onUsage: record => {
    callbacks++; h.records.push(record);
    // Synchronous read here proves mutation follows the callback.
    const text = require('node:fs').readFileSync(path.join(h.request.gameDir, 'main.js'), 'utf8');
    assert.equal(text, callbacks <= 2 ? h.original : 'export const level = 2;\n');
  } });
  assert.deepEqual(result, {}); assert.equal(callbacks, 3);
  assert.equal(await h.draft(), 'export const level = 2;\n'); assert.equal(await h.live(), h.original);
  assert.deepEqual(h.requests[1].body.input.find(i => i.type === 'reasoning'), reasoning);
  assert.ok(h.requests[1].body.input.some(i => i.type === 'function_call_output' && i.call_id === 'call_read'));
  for (const { url, options, body } of h.requests) {
    assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.ok(options.headers.Authorization === `Bearer ${h.config.openaiApiKey}`);
    assert.ok(!options.body.includes(h.config.openaiApiKey));
    assert.ok(!options.body.includes(h.request.engineDir)); assert.ok(!options.body.includes(h.request.gameDir));
    assert.equal(body.model, 'gpt-6-astra'); assert.equal(body.reasoning.effort, 'medium');
    assert.equal(body.store, false); assert.equal(body.background, false); assert.equal(body.stream, false);
    assert.equal(body.service_tier, 'default'); assert.equal(body.parallel_tool_calls, false);
    assert.deepEqual(body.include, ['reasoning.encrypted_content']); assert.ok(!('previous_response_id' in body));
    for (const tool of body.tools) {
      assert.equal(tool.type, 'function'); assert.equal(tool.strict, true);
      assert.equal(tool.parameters.additionalProperties, false);
      assert.deepEqual(tool.parameters.required, Object.keys(tool.parameters.properties));
    }
  }
  assert.equal(h.records[0].costMicroUsd, 1395);
  assert.equal(h.records[0].cacheWriteInputTokens, 30);
  assert.equal(h.records[0].rates.inputMicroUsdPerMillion, 10000000);
});

test('documented function calls with no optional status field are supported', async t => {
  const tool = call(); delete tool.status;
  const h = await fixture(t, [response('resp_one', [tool]), response('resp_two')]);
  await h.runner.run(h.request);
  assert.equal(h.records.length, 2); assert.equal(await h.draft(), 'export const level = 2;\n');
});

test('message phases survive replay alongside tool calls, including legacy phaseless messages', async t => {
  for (const phase of ['commentary', 'final_answer', undefined]) await t.test(String(phase), async t => {
    const progress = { ...message('msg_progress'), ...(phase === undefined ? {} : { phase }) };
    const h = await fixture(t, [response('resp_one', [progress, call()]), response('resp_two')]);
    assert.deepEqual(await h.runner.run(h.request), {});
    assert.equal(h.requests.length, 2); assert.equal(h.records.length, 2);
    assert.deepEqual(h.requests[1].body.input.find(i => i.id === progress.id), progress);
    assert.ok(h.requests[1].body.input.some(i => i.type === 'function_call_output' && i.call_id === 'call_one'));
    assert.equal(await h.draft(), 'export const level = 2;\n');
  });
});

test('commentary without calls continues and replays until explicit final text', async t => {
  const first = { ...message('msg_first'), phase: 'commentary' };
  const second = { ...message('msg_second'), phase: 'commentary' };
  const final = { ...message(), phase: 'final_answer' };
  const h = await fixture(t, [response('resp_one', [first]), response('resp_two', [second]), response('resp_three', [final])]);
  assert.deepEqual(await h.runner.run(h.request), {});
  assert.equal(h.requests.length, 3); assert.equal(h.records.length, 3);
  assert.deepEqual(h.requests[1].body.input.slice(1), [first]);
  assert.deepEqual(h.requests[2].body.input.slice(1), [first, second]);
  assert.equal(await h.draft(), h.original); assert.equal(await h.live(), h.original);
});

test('no-call continuations without final text exhaust the turn limit rather than succeeding', async t => {
  const cases = [
    { ...message(), phase: 'commentary' },
    { ...message(), phase: 'final_answer', content: [{ type: 'output_text', text: ' \n ' }] },
    { type: 'reasoning', id: 'rs_only', summary: [], encrypted_content: 'opaque-reasoning' },
  ];
  for (const item of cases) await t.test(item.phase || item.type, async t => {
    const h = await fixture(t, [response('resp_one', [{ ...item, id: 'item_one' }]),
      response('resp_two', [{ ...item, id: 'item_two' }])], { openaiMaxTurns: 2 });
    await assert.rejects(h.runner.run(h.request), /turn limit/);
    assert.equal(h.requests.length, 2); assert.equal(h.records.length, 2);
    assert.equal(h.requests[1].body.input[1].id, 'item_one');
    assert.equal(await h.draft(), h.original);
  });
});

test('unknown or malformed message phases are refused before any tools execute', async t => {
  for (const phase of ['analysis', '', null, 1, {}]) await t.test(JSON.stringify(phase), async t => {
    const h = await fixture(t, [response('resp_one', [call(), { ...message(), phase }])]);
    await assert.rejects(h.runner.run(h.request), /refused or invalid/);
    assert.equal(h.requests.length, 1); assert.equal(h.records.length, 1);
    assert.equal(await h.draft(), h.original); assert.equal(await h.live(), h.original);
  });
});

test('commentary-only continuation is bounded by context and reserves prior output tokens', async t => {
  const commentary = { ...message('msg_progress'), phase: 'commentary' };
  const large = { ...commentary, content: [{ type: 'output_text', text: 'x'.repeat(10000) }] };
  const limited = await fixture(t, [response('resp_one', [large])], { openaiMaxContextBytes: 6000 });
  await assert.rejects(limited.runner.run(limited.request), /context/);
  assert.equal(limited.requests.length, 1); assert.equal(limited.records.length, 1);

  const h = await fixture(t, [response('resp_one', [commentary]), response('resp_two')]);
  await h.runner.run({ ...h.request, budgetCredits: 20 });
  assert.equal(h.requests.length, 2);
  const body = h.requests[1].body;
  const bound = Buffer.byteLength(JSON.stringify({ ...body, max_output_tokens: 4096 })) +
    4096 + 128 * (body.input.length + body.tools.length) + h.records[0].outputTokens;
  const pricing = createPricing(h.config);
  const remaining = pricing.budget(20) - BigInt(h.records[0].costNumerator);
  assert.equal(body.max_output_tokens, pricing.reserve(bound, 4096, remaining));
  assert.ok(body.max_output_tokens < pricing.reserve(bound - h.records[0].outputTokens, 4096, remaining));
});

test('fractional micro-USD rounds cumulatively rather than overcharging each turn', async t => {
  const tiny = usage({ input_tokens: 1, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 1 },
    output_tokens: 0, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 1 });
  const h = await fixture(t, [response('resp_one', [call()], { usage: tiny }), response('resp_two', [message()], { usage: tiny })]);
  await h.runner.run(h.request);
  assert.deepEqual(h.records.map(r => r.costMicroUsd), [13, 12]);
});

test('failed, incomplete, refusal, empty and unsupported responses record usage but never write', async t => {
  const cases = [
    { status: 'failed', error: { message: 'private provider diagnostics' } },
    { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } },
    { status: 'queued' }, { output: [] },
    { output: [{ ...message(), content: [{ type: 'refusal', refusal: 'private text' }] }] },
    { output: [{ type: 'web_search_call', id: 'ws_one', status: 'completed' }] },
    { service_tier: 'priority' }, { model: 'another-model' },
  ];
  for (const overrides of cases) await t.test(JSON.stringify(Object.keys(overrides)), async t => {
    const h = await fixture(t, [response('resp_one', [call()], overrides)]);
    await assert.rejects(h.runner.run(h.request), e => !/private/.test(e.message));
    assert.equal(h.records.length, 1); assert.equal(await h.draft(), h.original);
  });
});

test('missing and malformed usage always fail before tools or success', async t => {
  const invalid = [null, {}, usage({ input_tokens: -1 }), usage({ input_tokens: 1.5 }),
    usage({ total_tokens: 111 }), usage({ output_tokens_details: { reasoning_tokens: 11 } }),
    usage({ input_tokens_details: { cached_tokens: 101, cache_write_tokens: 0 } }),
    usage({ input_tokens_details: { cached_tokens: 90, cache_write_tokens: 20 } }),
    usage({ input_tokens_details: { cached_tokens: 0 } }), usage({ output_tokens: Number.MAX_SAFE_INTEGER + 1 })];
  for (let i = 0; i < invalid.length; i++) await t.test(`usage ${i}`, async t => {
    const h = await fixture(t, [response('resp_one', [call()], { usage: invalid[i] })]);
    await assert.rejects(h.runner.run(h.request), /usage/);
    assert.equal(h.records.length, 0); assert.equal(await h.draft(), h.original);
  });
});

test('replayed response IDs are not charged twice or executed twice', async t => {
  const h = await fixture(t, [response('resp_one', [call('read', 'list_files', { scope: 'src/game' })]), response('resp_one', [call()])]);
  await assert.rejects(h.runner.run(h.request), /repeated/);
  assert.equal(h.records.length, 1); assert.equal(await h.draft(), h.original);
});

test('replayed tool IDs within a batch or a later response cannot execute', async t => {
  for (const sameBatch of [true, false]) await t.test(String(sameBatch), async t => {
    const read = call('same', 'list_files', { scope: 'src/game' });
    const duplicate = { ...call('other'), call_id: read.call_id };
    const replies = sameBatch ? [response('resp_one', [read, duplicate])] : [response('resp_one', [read]), response('resp_two', [duplicate])];
    const h = await fixture(t, replies);
    await assert.rejects(h.runner.run(h.request), /repeated/);
    assert.equal(h.records.length, replies.length); assert.equal(await h.draft(), h.original);
  });
});

test('unknown tools, extra args, malformed JSON and traversal are rejected with usage recorded', async t => {
  const bad = [call('bad', 'shell', { command: 'anything' }), call('bad', 'write_game_file', { path: 'src/game/main.js', content: 'x', extra: true }),
    { ...call(), arguments: '{' }, call('bad', 'write_game_file', { path: 'src/game/../lib/engine.js', content: 'x' }),
    call('bad', 'write_game_file', { path: 'src/lib/engine.js', content: 'x' })];
  for (let i = 0; i < bad.length; i++) await t.test(`tool ${i}`, async t => {
    const h = await fixture(t, [response('resp_one', [call('valid'), bad[i]])]);
    await assert.rejects(h.runner.run(h.request), /arguments/);
    assert.equal(h.records.length, 1); assert.equal(await h.draft(), h.original); assert.equal(await h.live(), h.original);
  });
});

test('usage callback must exist, be synchronous, and persist before any edit', async t => {
  for (const onUsage of [undefined, async () => {}, () => Promise.resolve(), () => { throw new Error('private database detail'); }]) {
    const h = await fixture(t, [response('resp_one', [call()])]);
    await assert.rejects(h.runner.run({ ...h.request, onUsage }), e => !e.message.includes('private'));
    assert.equal(await h.draft(), h.original);
  }
});

test('budget gate prevents HTTP when unaffordable and reduces the output cap when affordable', async t => {
  const h = await fixture(t);
  await assert.rejects(h.runner.run({ ...h.request, budgetCredits: 1 })); assert.equal(h.requests.length, 0);
  await h.runner.run({ ...h.request, budgetCredits: 20 });
  assert.ok(h.requests[0].body.max_output_tokens >= 16 && h.requests[0].body.max_output_tokens < 4096);
  for (const credits of [undefined, 0, -1, 1.5, Infinity]) await assert.rejects(h.runner.run({ ...h.request, budgetCredits: credits }));
  assert.equal(h.requests.length, 1);
});

test('every subsequent HTTP request is gated against actual accumulated usage', async t => {
  const h = await fixture(t, [(_options, body) => {
    const input = Buffer.byteLength(JSON.stringify(body)) + 4096 + 128 * (body.input.length + body.tools.length);
    return http(response('resp_one', [call('list', 'list_files', { scope: 'src/game' })], { usage: usage({
      input_tokens: input, input_tokens_details: { cached_tokens: 0, cache_write_tokens: input },
      output_tokens: body.max_output_tokens, total_tokens: input + body.max_output_tokens,
    }) }));
  }]);
  await assert.rejects(h.runner.run({ ...h.request, budgetCredits: 20 }));
  assert.equal(h.requests.length, 1); assert.equal(h.records.length, 1);
  assert.equal(await h.draft(), h.original);
});

test('reported overbudget usage is recorded and prevents edits/publication', async t => {
  const h = await fixture(t, [response('resp_one', [call()], { usage: usage({ output_tokens: 10000, total_tokens: 10100 }) })]);
  await assert.rejects(h.runner.run({ ...h.request, budgetCredits: 20 }), /budget/);
  assert.equal(h.records.length, 1); assert.equal(h.records[0].outputTokens, 10000);
  assert.equal(await h.draft(), h.original); assert.equal(await h.live(), h.original);
});

test('reported tokens exceeding the request cap fail even with a large total budget', async t => {
  for (const bad of [usage({ output_tokens: 5000, total_tokens: 5100 }), usage({ input_tokens: 272001, total_tokens: 272011 })]) {
    const h = await fixture(t, [response('resp_one', [call()], { usage: bad })]);
    await assert.rejects(h.runner.run(h.request), /reserved/); assert.equal(h.records.length, 1);
    assert.equal(await h.draft(), h.original);
  }
});

test('context and turn limits fail closed and do not return provider summaries', async t => {
  const tiny = await fixture(t, [], { openaiMaxContextBytes: 100 });
  await assert.rejects(tiny.runner.run(tiny.request), /context/); assert.equal(tiny.requests.length, 0);
  const turns = await fixture(t, [response('resp_one', [call('list', 'list_files', { scope: 'src/game' })])], { openaiMaxTurns: 1 });
  await assert.rejects(turns.runner.run(turns.request), /turn limit/); assert.equal(turns.records.length, 1);
  const summary = await fixture(t, [response('resp_one', [{ ...message(), content: [{ type: 'output_text', text: 'private provider text' }] }])]);
  assert.deepEqual(await summary.runner.run(summary.request), {});
});

test('encrypted reasoning and tool results cannot grow context past the next request limit', async t => {
  const reasoning = { id: 'rs_large', type: 'reasoning', summary: [], encrypted_content: 'x'.repeat(10000) };
  const h = await fixture(t, [response('resp_one', [reasoning, call('list', 'list_files', { scope: 'src/game' })])], { openaiMaxContextBytes: 6000 });
  await assert.rejects(h.runner.run(h.request), /context/);
  assert.equal(h.requests.length, 1); assert.equal(h.records.length, 1);
});

test('encoded credentials in function arguments cannot be written to staged files', async t => {
  const replies = [];
  const h = await fixture(t, replies);
  const escaped = [...h.config.openaiApiKey].map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
  const tool = { ...call(), arguments: `{"path":"src/game/main.js","content":"${escaped}"}` };
  replies.push(response('resp_one', [tool]));
  await assert.rejects(h.runner.run(h.request));
  assert.equal(h.records.length, 1); assert.equal(await h.draft(), h.original);
});

test('pre-abort, in-flight abort, transport timeout and body timeout stop safely', async t => {
  const stopped = new AbortController(); stopped.abort(); const before = await fixture(t);
  await assert.rejects(before.runner.run({ ...before.request, signal: stopped.signal }), /interrupted/);
  assert.equal(before.requests.length, 0);
  for (const mode of ['abort', 'transport-timeout', 'body-timeout']) await t.test(mode, async t => {
    const controller = new AbortController(); let transportSignal; let cancelled = false;
    const h = await fixture(t, [options => {
      transportSignal = options.signal;
      if (mode === 'abort') queueMicrotask(() => controller.abort());
      if (mode === 'body-timeout') return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
      return new Promise(() => {}); // Even an uncooperative injected transport is bounded.
    }], { openaiRequestTimeoutMs: 20 });
    await assert.rejects(h.runner.run({ ...h.request, signal: controller.signal }), /interrupted|timed out/);
    assert.equal(transportSignal.aborted, true); assert.equal(h.records.length, 0);
    if (mode === 'body-timeout') assert.equal(cancelled, true);
    assert.equal(await h.draft(), h.original);
  });
});

test('HTTP errors, redirects, invalid JSON and oversized responses are sanitized and bounded', async t => {
  const cases = [
    () => new Response('private provider error', { status: 429 }),
    () => new Response('private redirect', { status: 302, headers: { location: 'https://invalid.example' } }),
    () => { throw new Error('private transport detail'); },
    () => new Response('not json: private'),
    () => new Response('{}', { headers: { 'content-length': String(2 * 1024 ** 2 + 1) } }),
    () => new Response('x'.repeat(2 * 1024 ** 2 + 1)),
  ];
  for (let i = 0; i < cases.length; i++) await t.test(`transport ${i}`, async t => {
    const h = await fixture(t, [cases[i]]);
    await assert.rejects(h.runner.run(h.request), e => !e.message.includes('private'));
    assert.equal(h.records.length, 0); assert.equal(await h.draft(), h.original);
  });
});

test('disabled runner, forbidden live draft and credentials in prompts never make a request', async t => {
  const disabled = createOpenAIRunner({}, () => assert.fail('must not fetch'));
  assert.equal(disabled.enabled, false); await assert.rejects(disabled.run({}));
  const h = await fixture(t);
  await assert.rejects(h.runner.run({ ...h.request, gameDir: path.join(h.request.engineDir, 'src/game') }));
  await assert.rejects(h.runner.run({ ...h.request, prompt: h.config.openaiApiKey }));
  assert.equal(h.requests.length, 0); assert.equal(await h.live(), h.original);
  assert.equal(require('../server/runner').createDockerRunner, undefined);
});
