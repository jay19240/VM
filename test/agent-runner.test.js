'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const { createAgentRunner } = require('../server/runner');
const { inspectGame, checkDraft } = require('../server/jobs');

const PLAN = 'Objectif : créer le niveau.\nÉtapes : adapter src/game/main.js avec Engine.\nVérification : syntaxe valide et changement effectif.';
const call = (id, name, args) => ({ id: `fc_${id}`, type: 'function_call', call_id: `call_${id}`, arguments: JSON.stringify(args), name });
const read = (id, filename) => call(id, 'read_file', { path: filename, offset: 0, limit: 16000 });
const prepare = () => [read('game', 'src/game/main.js'), read('lib', 'src/lib/engine.js'), read('example', 'examples/demo.js')];
const plan = text => [call('plan', 'submit_plan', { plan: text ?? PLAN })];
const write = (id = 'write', content = 'export const level = 2;') => [call(id, 'write_game_file', { path: 'src/game/main.js', content })];
const final = (id = 'final') => [{ id: `msg_${id}`, type: 'message', role: 'assistant', status: 'completed',
  content: [{ type: 'output_text', text: 'Modifications terminées.' }] }];
const usage = () => ({ input_tokens: 100, input_tokens_details: { cached_tokens: 20, cache_write_tokens: 30 },
  output_tokens: 10, output_tokens_details: { reasoning_tokens: 2 }, total_tokens: 110 });
function response(index, output, changes = {}) {
  return { id: `resp_${index}`, object: 'response', status: 'completed', model: 'gpt-6-astra', service_tier: 'default',
    output, usage: usage(), ...changes };
}
async function fixture(t, replies = [prepare(), plan(), write(), final()], overrides = {}) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-workflow-test-'));
  const engineDir = path.join(temp, 'engine'); const gameDir = path.join(temp, 'draft');
  for (const dir of ['src/lib', 'src/examples', 'src/game']) await fs.mkdir(path.join(engineDir, dir), { recursive: true });
  await fs.mkdir(gameDir);
  const original = 'export const level = 1;';
  await fs.writeFile(path.join(gameDir, 'main.js'), original);
  await fs.writeFile(path.join(engineDir, 'src/game/main.js'), original);
  await fs.writeFile(path.join(engineDir, 'src/lib/engine.js'), 'export class Engine {}');
  await fs.writeFile(path.join(engineDir, 'src/examples/demo.js'), 'export const demo = new Engine();');
  const before = await inspectGame(gameDir);
  t.after(() => fs.rm(temp, { recursive: true, force: true })); // Only our own mkdtemp fixture.
  const requests = []; const records = []; const phases = [];
  const config = { openaiApiKey: randomBytes(24).toString('hex'), ...overrides };
  const runner = createAgentRunner(config, async (_url, options) => {
    const body = JSON.parse(options.body); const index = requests.length; requests.push(body);
    const reply = replies[index]; assert.ok(reply, 'Unexpected extra OpenAI call');
    const value = typeof reply === 'function' ? await reply(body, index) : response(index, reply);
    return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
  });
  const request = { engineDir, gameDir, prompt: 'Créer un niveau.', budgetCredits: 1000,
    onUsage: record => { records.push(record); }, onProgress: progress => { phases.push(progress); },
    validateDraft: () => checkDraft(gameDir, before) };
  return { runner, request, requests, records, phases, config, original,
    draft: () => fs.readFile(path.join(gameDir, 'main.js'), 'utf8'),
    live: () => fs.readFile(path.join(engineDir, 'src/game/main.js'), 'utf8') };
}

test('prompt agent inspects engine/examples, submits a public plan, hands off bounded references and never writes', async t => {
  const reasoning = { type: 'reasoning', id: 'rs_prompt', encrypted_content: 'planner-private-ciphertext', summary: [] };
  const h = await fixture(t, [[reasoning, ...prepare()], plan(), write(), final()]);
  assert.deepEqual(await h.runner.run(h.request), {});
  assert.deepEqual(h.phases, [{ phase: 'planning' }, { phase: 'coding', plan: PLAN }, { phase: 'validating' }]);
  assert.equal(h.records.length, 4); assert.equal(h.records.reduce((sum, row) => sum + row.costMicroUsd, 0), 5580);
  for (const body of h.requests.slice(0, 2)) {
    assert.ok(body.tools.some(tool => tool.name === 'submit_plan'));
    assert.ok(!body.tools.some(tool => /write|delete/.test(tool.name)));
    assert.match(body.instructions, /prompt preparation agent/);
  }
  const coder = h.requests[2];
  assert.match(coder.instructions, /implementation agent/);
  assert.ok(coder.tools.some(tool => tool.name === 'write_game_file'));
  assert.ok(!coder.tools.some(tool => tool.name === 'submit_plan'));
  assert.equal(coder.input[0].content, h.request.prompt);
  const context = JSON.parse(coder.input[1].content).preparation;
  assert.equal(context.plan, PLAN);
  assert.deepEqual(context.references.map(r => r.path), ['src/game/main.js', 'src/lib/engine.js', 'examples/demo.js']);
  assert.ok(h.requests[1].input.some(item => item.encrypted_content === reasoning.encrypted_content));
  assert.ok(!JSON.stringify(coder).includes(reasoning.encrypted_content));
  for (const body of h.requests) {
    const text = JSON.stringify(body);
    assert.ok(!text.includes(h.request.gameDir)); assert.ok(!text.includes(h.request.engineDir));
    assert.ok(!text.includes(h.config.openaiApiKey));
  }
  assert.equal(await h.draft(), 'export const level = 2;'); assert.equal(await h.live(), h.original);
});

test('prompt agent cannot call a write, delete, shell or unknown tool even in a mixed response', async t => {
  for (const item of [write()[0], call('delete', 'delete_game_file', { path: 'src/game/main.js' }),
    call('shell', 'shell', { command: 'anything' })]) {
    const h = await fixture(t, [[...prepare(), item]]);
    await assert.rejects(h.runner.run(h.request), /arguments/);
    assert.equal(h.records.length, 1); assert.equal(await h.draft(), h.original);
    assert.deepEqual(h.phases, [{ phase: 'planning' }]);
  }
});

test('a plan requires observed game/library/example context, not just file names or a prose completion', async t => {
  const cases = [[plan()], [final()], [[call('list', 'list_files', { scope: 'src/lib' })], plan()],
    [[read('game', 'src/game/main.js'), read('lib', 'src/lib/engine.js')], plan()]];
  for (const replies of cases) {
    const h = await fixture(t, replies);
    await assert.rejects(h.runner.run(h.request));
    assert.equal(h.requests.length, replies.length); assert.equal(await h.draft(), h.original);
    assert.ok(!h.phases.some(p => p.phase === 'coding'));
  }
});

test('empty reference scopes can be established by listing; literal search excerpts also provide context', async t => {
  const h = await fixture(t, [[read('game', 'src/game/main.js'),
    call('search', 'search_files', { scope: 'src/lib', query: 'Engine' }), call('empty', 'list_files', { scope: 'examples' })], plan(), write(), final()]);
  // Remove only a known throwaway fixture file, never the repository engine.
  await fs.unlink(path.join(h.request.engineDir, 'src/examples/demo.js'));
  await h.runner.run(h.request);
  const refs = JSON.parse(h.requests[2].input[1].content).preparation.references;
  assert.equal(refs[1].results[0].path, 'src/lib/engine.js');
});

test('malformed, oversized or mixed-batch plans fail before handoff with usage preserved', async t => {
  for (const text of ['', ' ', '\u0000', '\u0085', '\ud800', 'é'.repeat(4097)]) {
    const h = await fixture(t, [prepare(), plan(text)]);
    await assert.rejects(h.runner.run(h.request));
    assert.equal(h.records.length, 2); assert.equal(await h.draft(), h.original);
  }
  const h = await fixture(t, [prepare(), [...plan(), read('again', 'src/game/main.js')]]);
  await assert.rejects(h.runner.run(h.request), /alone/);
  assert.equal(h.records.length, 2); assert.equal(h.phases.length, 1);
});

test('plan progress is persisted synchronously before a writable agent is created', async t => {
  const h = await fixture(t);
  await assert.rejects(h.runner.run({ ...h.request, onProgress: value => {
    if (value.phase === 'coding') throw new Error('private database diagnostic');
  } }), error => /progress/.test(error.message) && !error.message.includes('private'));
  assert.equal(h.requests.length, 2); assert.equal(h.records.length, 2); assert.equal(await h.draft(), h.original);
  for (const callback of [async () => {}, () => Promise.resolve()]) {
    const p = await fixture(t);
    await assert.rejects(p.runner.run({ ...p.request, onProgress: callback }));
    assert.equal(p.requests.length, 0);
  }
});

test('budget is shared across agents and exact micro-USD rounding never restarts at handoff', async t => {
  const outputs = [prepare(), plan(), write(), final()];
  const tiny = outputs.map(output => (_body, index) => response(index, output, { usage: {
    input_tokens: 1, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 1 }, output_tokens: 0,
    output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 1 } }));
  const h = await fixture(t, tiny);
  await h.runner.run(h.request);
  assert.deepEqual(h.records.map(record => record.costMicroUsd), [13, 12, 13, 12]);

  const exhausted = await fixture(t, [prepare(), (body, index) => {
    assert.ok(body.max_output_tokens < 4096, 'Fixture must consume the budget-limited output allocation');
    const input = Buffer.byteLength(JSON.stringify({ ...body, max_output_tokens: 4096 })) +
      4096 + 128 * (body.input.length + body.tools.length) + 10;
    return response(index, plan(), { usage: { input_tokens: input,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: input }, output_tokens: body.max_output_tokens,
      output_tokens_details: { reasoning_tokens: 0 }, total_tokens: input + body.max_output_tokens } });
  }]);
  await assert.rejects(exhausted.runner.run({ ...exhausted.request, budgetCredits: 30 }));
  assert.equal(exhausted.requests.length, 2); assert.equal(exhausted.records.length, 2);
  assert.equal(exhausted.phases.at(-1).phase, 'coding'); assert.equal(await exhausted.draft(), exhausted.original);
});

test('planning and global turn ceilings bound the whole chain including repairs', async t => {
  const planning = await fixture(t, [prepare()], { openaiPlanningMaxTurns: 1 });
  await assert.rejects(planning.runner.run(planning.request), /planning turn limit/);
  assert.equal(planning.requests.length, 1);
  const total = await fixture(t, [prepare(), plan(), write()], { openaiMaxTurns: 3 });
  await assert.rejects(total.runner.run(total.request), /turn limit/);
  assert.equal(total.requests.length, 3); assert.equal(await total.live(), total.original);
  assert.throws(() => createAgentRunner({ openaiMaxTurns: 1 }));
  assert.throws(() => createAgentRunner({ openaiPlanningMaxTurns: 12 }));
});

test('host syntax failure drives one bounded correction before success without leaking native diagnostics', async t => {
  const h = await fixture(t, [prepare(), plan(), write('bad', 'export const level = ;'), final('bad'), write('repair'), final('repaired')]);
  await h.runner.run(h.request);
  assert.deepEqual(h.phases.map(p => p.phase), ['planning', 'coding', 'validating', 'coding', 'validating']);
  assert.equal(h.records.length, 6);
  const feedback = JSON.parse(h.requests[4].input.at(-1).content).hostValidation;
  assert.deepEqual(feedback, { valid: false, code: 'INVALID_JAVASCRIPT', path: 'src/game/main.js' });
  assert.equal(await h.draft(), 'export const level = 2;'); assert.equal(await h.live(), h.original);
});

test('failed repairs, disabled repairs and no-change drafts cannot become successful generations', async t => {
  for (const count of [0, 1]) {
    const replies = [prepare(), plan(), write('bad', 'export const x = ;'), final('bad')];
    if (count) replies.push(write('bad2', 'export const y = ;'), final('bad2'));
    const h = await fixture(t, replies, { openaiMaxRepairs: count });
    await assert.rejects(h.runner.run(h.request), /validation failed/);
    assert.equal(h.requests.length, replies.length); assert.equal(await h.live(), h.original);
  }
  const unchanged = await fixture(t, [prepare(), plan(), final()], { openaiMaxRepairs: 0 });
  await assert.rejects(unchanged.runner.run(unchanged.request), /validation failed/);
  assert.equal(await unchanged.draft(), unchanged.original);
});

test('the validation callback is mandatory and its feedback must be sanitized structured host data', async t => {
  const missing = await fixture(t);
  await assert.rejects(missing.runner.run({ ...missing.request, validateDraft: undefined }), /contract/);
  assert.equal(missing.requests.length, 0);
  for (const value of [null, { valid: true, private: 'diagnostic' }, { valid: false, code: 'arbitrary native message' },
    { valid: false, code: 'INVALID_JSON', path: '/private/config' },
    { valid: false, code: 'INVALID_JSON', path: 'src/game/../lib/engine.js' }]) {
    const h = await fixture(t);
    await assert.rejects(h.runner.run({ ...h.request, validateDraft: async () => value }));
    assert.equal(h.requests.length, 4); assert.equal(await h.live(), h.original);
  }
});

test('replay protections and cancellation remain active at the agent boundary', async t => {
  const replay = await fixture(t, [prepare(), plan(), (_body, _index) => response(0, write())]);
  await assert.rejects(replay.runner.run(replay.request), /repeated/);
  assert.equal(replay.records.length, 2); assert.equal(await replay.draft(), replay.original);
  const controller = new AbortController(); const h = await fixture(t);
  await assert.rejects(h.runner.run({ ...h.request, signal: controller.signal,
    onProgress: value => { if (value.phase === 'coding') controller.abort(); } }));
  assert.equal(h.requests.length, 2); assert.equal(await h.draft(), h.original);
});

test('host validator returns only safe syntax paths, detects no-change drafts and does not execute code', async t => {
  const h = await fixture(t); const before = await inspectGame(h.request.gameDir);
  assert.deepEqual(await checkDraft(h.request.gameDir, before), { valid: false, code: 'NO_CHANGES' });
  for (const [name, code] of [['extra.json', 'INVALID_JSON'], ['extra.ts', 'INVALID_TYPESCRIPT']]) {
    await fs.writeFile(path.join(h.request.gameDir, name), name.endsWith('json') ? '{' : 'const broken: = ;');
    assert.deepEqual(await checkDraft(h.request.gameDir, before), { valid: false, code, path: `src/game/${name}` });
    await fs.unlink(path.join(h.request.gameDir, name));
  }
  await fs.writeFile(path.join(h.request.gameDir, 'main.js'), 'throw new Error("would fail if executed");');
  assert.deepEqual(await checkDraft(h.request.gameDir, before), { valid: true });
  await fs.writeFile(path.join(h.request.gameDir, '.hidden.js'), 'private');
  assert.deepEqual(await checkDraft(h.request.gameDir, before), { valid: false, code: 'INVALID_GAME' });
});
