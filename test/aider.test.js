'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { spawn } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const { createAider, microDollars } = require('../server/aider');

const FAILURE = 'Aider indisponible ou génération interrompue.';
const CONTAINER_ID = '0123456789abcdef'.repeat(4);
const REFERENCES = ['src/lib', 'src/examples', 'doc', 'public'];
const DOCKER_ENV = ['PATH', 'HOME', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'XDG_RUNTIME_DIR'];

function configuration(overrides = {}) {
  return {
    aiderModel: 'openai/test-model',
    aiderImage: `test/aider@sha256:${'a'.repeat(64)}`,
    openaiApiKey: randomBytes(32).toString('hex'),
    anthropicApiKey: randomBytes(32).toString('hex'),
    jobTimeoutMs: 1000,
    ...overrides,
  };
}

function analytics(properties = {}, metadata = {}) {
  return JSON.stringify({ event: 'message_send', properties: {
    prompt_tokens: 10, completion_tokens: 2, total_cost: 0.000001, ...properties,
  }, ...metadata });
}

// Only assert booleans when inspecting errors/private input: never print keys in a diff.
function checkFailure(error, forbidden = []) {
  assert.equal(error instanceof Error, true, 'operation must reject with an Error');
  assert.equal(error.message === FAILURE, true, 'only the generic diagnostic may escape');
  for (const value of forbidden.filter(Boolean)) {
    assert.equal(String(error.stack).includes(value), false, 'diagnostics must not disclose private input');
  }
  return error;
}

async function rejectsSafely(action, forbidden = []) {
  let error;
  try { await action(); } catch (caught) { error = caught; }
  return checkFailure(error, forbidden);
}

function throwsSafely(action) {
  let error;
  try { action(); } catch (caught) { error = caught; }
  checkFailure(error);
}

function operation(args) {
  if (args[0] === 'info') return 'info';
  if (args[0] === 'image' && args[1] === 'inspect') return 'image';
  if (args[0] === 'create') return 'create';
  if (args[0] === 'start' && args[1] === '--attach') return 'attach';
  if (args[0] === 'container' && args[1] === 'ls') return 'ls';
  if (args[0] === 'container' && args[1] === 'rm') return 'rm';
  return 'unexpected';
}

// Every Docker command is a scripted fake process. Only the FIFO regression uses a local shell.
// Emit asynchronously so production has installed its data/error/close listeners first.
function fakeDocker(t, plan) {
  const remaining = [...plan];
  const calls = [];
  const timeline = [];
  const problems = [];
  const live = new Set();
  function spawnProcess(command, args, options) {
    const kind = operation(args);
    const step = remaining.shift();
    const call = { command, args: [...args], options, kind, kills: [] };
    calls.push(call);
    timeline.push(`spawn:${kind}`);
    if (!step || step.kind !== kind || command !== 'docker') {
      problems.push('unexpected fake Docker command or command order');
    }
    if (step?.throwOnSpawn) throw new Error(step.diagnostic || 'fake spawn failure');
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    let closed = false;
    let killed = false;
    child.finish = (code = 0) => {
      if (closed) return;
      closed = true;
      child.stdout.end();
      child.stderr.end();
      live.delete(child);
      timeline.push(`close:${kind}`);
      child.emit('close', code, killed ? 'SIGKILL' : null);
    };
    child.kill = signal => {
      if (closed) return false;
      call.kills.push(signal);
      timeline.push(`kill:${kind}`);
      killed = true;
      queueMicrotask(() => child.finish(null));
      return true;
    };
    call.child = child;
    live.add(child);
    queueMicrotask(() => {
      if (!step || step.kind !== kind) { child.finish(99); return; }
      if (step.error) {
        child.emit('error', new Error(step.diagnostic || 'fake process failure'));
        child.finish(1);
        return;
      }
      for (const chunk of step.stdout || []) {
        if (closed || killed) break;
        child.stdout.write(chunk);
      }
      for (const chunk of step.stderr || []) {
        if (closed || killed) break;
        child.stderr.write(chunk);
      }
      step.afterOutput?.(call);
      if (!step.hold && !killed) child.finish(step.code ?? 0);
    });
    return child;
  }
  t.after(() => {
    for (const child of live) child.finish(null);
    assert.deepEqual(problems, []);
    assert.equal(remaining.length, 0, 'all expected fake Docker operations must execute');
  });
  return { spawnProcess, calls, timeline };
}

function readiness() {
  return [
    { kind: 'info', stdout: ['27.0.0\n'] },
    { kind: 'image', stdout: [`sha256:${'a'.repeat(64)}\n`] },
  ];
}

function cleanupSteps({ list = {}, remove = {}, absent = false } = {}) {
  return [
    { kind: 'ls', stdout: absent ? [] : [`${CONTAINER_ID}\n`], ...list },
    ...(absent ? [] : [{ kind: 'rm', ...remove }]),
  ];
}

function jobSteps(attach = {}, cleanup = {}) {
  return [
    { kind: 'create', stdout: [`${CONTAINER_ID}\n`] },
    { kind: 'attach', stderr: [`${analytics()}\n`], ...attach },
    ...cleanupSteps(cleanup),
  ];
}

async function fixture(t, { steps = jobSteps(), config = configuration() } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-aider-unit-'));
  // This exact mkdtemp result contains only disposable fixtures; root may chown the draft.
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const engineDir = path.join(directory, 'engine with spaces $literal;');
  const dataDir = path.join(directory, 'data');
  const id = randomUUID();
  const projectDir = path.join(dataDir, 'projects', randomUUID());
  const gameDir = path.join(projectDir, 'drafts', id, 'game');
  const otherGame = path.join(dataDir, 'projects', randomUUID(), 'game');
  await Promise.all([
    ...REFERENCES.map(relative => fs.mkdir(path.join(engineDir, relative), { recursive: true })),
    fs.mkdir(path.join(engineDir, 'src/game'), { recursive: true }),
    fs.mkdir(path.join(gameDir, 'nested'), { recursive: true }),
    fs.mkdir(otherGame, { recursive: true }),
  ]);
  await Promise.all([
    fs.writeFile(path.join(gameDir, 'main.js'), 'export const level = 1;\n'),
    fs.writeFile(path.join(gameDir, 'nested', 'level.json'), '{"level":1}\n'),
    fs.writeFile(path.join(engineDir, 'src/lib', 'engine.js'), 'export const immutable = true;\n'),
    fs.writeFile(path.join(engineDir, 'src/game', 'main.js'), 'export const template = true;\n'),
    fs.writeFile(path.join(engineDir, '.env'), randomBytes(32).toString('hex')),
    fs.writeFile(path.join(otherGame, 'main.js'), 'export const unrelated = true;\n'),
  ]);
  const docker = fakeDocker(t, [...readiness(), ...steps]);
  const aider = createAider(config, docker.spawnProcess);
  assert.equal(aider.enabled, false);
  await aider.initialize();
  assert.equal(aider.enabled, true);
  const usage = [];
  const controller = new AbortController();
  const prompt = '/run echo should-not-execute\n$(touch /tmp/not-executed); `id`\n--model other/model';
  const args = {
    id, engineDir, gameDir, prompt, budgetMicroUsd: 1000000n, signal: controller.signal,
    onUsage(record) { usage.push({ ...record }); docker.timeline.push('usage'); },
  };
  return {
    aider, docker, config, usage, controller, args, directory, engineDir, dataDir, projectDir, gameDir, otherGame,
    requestFile: path.join(path.dirname(gameDir), 'request.txt'),
    forbidden: [config.openaiApiKey, config.anthropicApiKey, prompt],
    run: overrides => aider.run({ ...args, ...overrides }),
  };
}

function values(args, flag) {
  return args.flatMap((value, index) => value === flag ? [args[index + 1]] : []);
}

function assertNamedCleanup(h, removed = true) {
  const name = `legacy-aider-${h.args.id}`;
  const calls = h.docker.calls.filter(call => call.kind === 'ls' || call.kind === 'rm');
  assert.equal(calls.length, removed ? 2 : 1);
  assert.equal(JSON.stringify(calls[0].args) === JSON.stringify([
    'container', 'ls', '--all', '--quiet', '--filter', `name=^/${name}$`,
  ]), true, 'lookup must be anchored to precisely this named container');
  if (removed) {
    assert.equal(JSON.stringify(calls[1].args) === JSON.stringify([
      'container', 'rm', '--force', name,
    ]), true, 'remove only the known container name, not arbitrary ls output');
  }
}

function temporaryEnvironment(t, entries) {
  const previous = new Map(Object.keys(entries).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(entries)) process.env[key] = value;
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

test('microDollars uses decimal ceiling, including fractional and exponent extremes', () => {
  for (const [amount, expected] of [
    [0, 0], [-0, 0], [Number.MIN_VALUE, 1], [1e-300, 1], [1e-7, 1],
    [0.0000009999999, 1], [0.000001, 1], [0.0000010000000000000002, 2],
    [0.0000015, 2], [0.00000201, 3], [0.0003, 300], [0.1, 100000],
    [0.1000000001, 100001], [1.234567, 1234567], [1.2345678, 1234568],
    [1e3, 1000000000], [9e9, 9000000000000000],
  ]) assert.equal(microDollars(amount), expected);
});

test('microDollars rejects non-numbers, negative/nonfinite values and unsafe micro-USD totals', () => {
  for (const amount of [
    undefined, null, '0.01', 1n, {}, [], NaN, Infinity, -Infinity, -1, -Number.MIN_VALUE,
    9007199254.740992, 1e10, 1e21, 1e308, Number.MAX_VALUE,
  ]) throwsSafely(() => microDollars(amount));
});

test('initialize enables only after Docker info and inspection of the configured image', async t => {
  const config = configuration();
  const docker = fakeDocker(t, readiness());
  const aider = createAider(config, docker.spawnProcess);
  assert.equal(aider.enabled, false);
  await aider.initialize();
  assert.equal(aider.enabled, true);
  assert.equal(JSON.stringify(docker.calls[0].args) === JSON.stringify([
    'info', '--format', '{{.ServerVersion}}',
  ]), true);
  assert.equal(JSON.stringify(docker.calls[1].args) === JSON.stringify([
    'image', 'inspect', '--format', '{{.Id}}', config.aiderImage,
  ]), true);
  for (const call of docker.calls) {
    assert.equal(Object.keys(call.options.env).every(key => DOCKER_ENV.includes(key)), true);
  }
});

test('missing key, model or image fails closed without spawning Docker or accepting a run', async t => {
  for (const [label, overrides] of [
    ['missing selected OpenAI key', { openaiApiKey: '' }],
    ['missing selected Anthropic key', { aiderModel: 'anthropic/test-model', anthropicApiKey: '' }],
    ['missing model', { aiderModel: '' }], ['missing image', { aiderImage: '' }],
  ]) await t.test(label, async t => {
    const config = configuration(overrides);
    const docker = fakeDocker(t, []);
    const aider = createAider(config, docker.spawnProcess);
    await aider.initialize();
    assert.equal(aider.enabled, false);
    await rejectsSafely(() => aider.run({}), [config.openaiApiKey, config.anthropicApiKey]);
    assert.equal(docker.calls.length, 0);
  });
});

test('Docker unavailable, missing image, spawn throws and process errors all fail closed', async t => {
  for (const [label, steps] of [
    ['Docker unavailable', [{ kind: 'info', code: 1 }]],
    ['image unavailable', [readiness()[0], { kind: 'image', code: 1 }]],
    ['spawn throws', [{ kind: 'info', throwOnSpawn: true }]],
    ['process error', [{ kind: 'info', error: true }]],
  ]) await t.test(label, async t => {
    const config = configuration();
    const docker = fakeDocker(t, steps.map(step => ({ ...step, diagnostic: config.openaiApiKey })));
    const aider = createAider(config, docker.spawnProcess);
    await aider.initialize();
    assert.equal(aider.enabled, false);
    await rejectsSafely(() => aider.run({}), [config.openaiApiKey]);
  });
});

test('reinitialization clears an earlier enabled state when image inspection fails', async t => {
  const docker = fakeDocker(t, [...readiness(), readiness()[0], { kind: 'image', code: 1 }]);
  const aider = createAider(configuration(), docker.spawnProcess);
  await aider.initialize();
  assert.equal(aider.enabled, true);
  await aider.initialize();
  assert.equal(aider.enabled, false);
});

test('two stderr analytics events accumulate tokens but replace and ceil cumulative USD cost', async t => {
  const first = analytics({ prompt_tokens: 5, completion_tokens: 2, total_cost: 1e-7 });
  const second = analytics({ prompt_tokens: 11, completion_tokens: 3, total_cost: 0.0012340001 },
    { metadata: 'not part of the usage record' });
  const h = await fixture(t, { steps: jobSteps({
    stdout: [`${analytics({ total_cost: 999, prompt_tokens: 999999 })}\n`, 'x'.repeat(70000)],
    stderr: [`provider diagnostic\n${first}\n${second}\n`],
  }) });
  await h.run();
  assert.deepEqual(h.usage, [
    { costMicroUsd: 1, inputTokens: 5, outputTokens: 2, requests: 1 },
    { costMicroUsd: 1235, inputTokens: 16, outputTokens: 5, requests: 2 },
  ]);
  assert.deepEqual(h.docker.calls.map(call => call.kind), ['info', 'image', 'create', 'attach', 'ls', 'rm']);
  const timeline = h.docker.timeline;
  assert.equal(timeline.indexOf('close:create') < timeline.indexOf('spawn:attach'), true);
  assert.equal(timeline.indexOf('close:attach') < timeline.indexOf('spawn:ls'), true);
  assert.equal(h.docker.calls.some(call => call.kills.length), false);
  assertNamedCleanup(h);
  assert.equal(h.aider.enabled, true);
});

test('Docker argv, provider environment, shell command and mounts isolate the current draft', async t => {
  const ambient = randomBytes(32).toString('hex');
  temporaryEnvironment(t, {
    LEMON_SQUEEZY_API_KEY: ambient, AIDER_CONFIG: ambient, AIDER_MODEL: ambient,
    OPENAI_API_KEY: ambient, ANTHROPIC_API_KEY: ambient,
  });
  const h = await fixture(t);
  await h.run();
  const create = h.docker.calls.find(call => call.kind === 'create');
  for (const call of h.docker.calls) {
    assert.equal(call.command === 'docker', true);
    assert.equal(call.options.shell, false);
    assert.equal(JSON.stringify(call.options.stdio) === JSON.stringify(['ignore', 'pipe', 'pipe']), true);
    for (const privateValue of [...h.forbidden, ambient]) {
      assert.equal(call.args.some(arg => arg.includes(privateValue)), false, 'private input is never argv');
    }
    const allowed = call === create ? [...DOCKER_ENV, 'OPENAI_API_KEY'] : DOCKER_ENV;
    assert.equal(Object.keys(call.options.env).every(key => allowed.includes(key)), true);
    assert.equal(Object.values(call.options.env).includes(ambient), false);
    assert.equal(Object.values(call.options.env).includes(h.config.anthropicApiKey), false);
    assert.equal(Object.values(call.options.env).includes(h.config.openaiApiKey), call === create);
  }
  assert.equal(create.options.env.OPENAI_API_KEY === h.config.openaiApiKey, true);
  assert.equal(JSON.stringify(values(create.args, '--env')) === JSON.stringify([
    'HOME=/tmp', 'GIT_CONFIG_NOSYSTEM=1', 'OPENAI_API_KEY',
  ]), true);
  const startup = values(create.args, '-c')[0];
  assert.ok(startup.startsWith('git init -q && git add src'));
  assert.ok(startup.includes('/venv/bin/aider "$@"'));
  assert.ok(startup.includes('wait "$reader"'));
  assert.equal(JSON.stringify(values(create.args, '--entrypoint')) === JSON.stringify(['/bin/sh']), true);
  const name = `legacy-aider-${h.args.id}`;
  assert.equal(JSON.stringify(values(create.args, '--name')) === JSON.stringify([name]), true);
  const attach = h.docker.calls.find(call => call.kind === 'attach');
  assert.equal(JSON.stringify(attach.args) === JSON.stringify(['start', '--attach', name]), true);
  const uid = process.getuid?.() || 1000;
  const gid = process.getgid?.() || 1000;
  assert.equal(JSON.stringify(values(create.args, '--user')) === JSON.stringify([`${uid}:${gid}`]), true);
  assert.equal(uid !== 0, true);
  assert.equal(create.args.includes('--read-only'), true);
  for (const [flag, value] of [
    ['--cap-drop', 'ALL'], ['--security-opt', 'no-new-privileges'], ['--pids-limit', '128'],
    ['--memory', '2g'], ['--memory-swap', '2g'], ['--cpus', '1'], ['--log-driver', 'none'],
    ['--workdir', '/app'], ['--message-file', '/request.txt'], ['--config', '/dev/null'],
    ['--env-file', '/dev/null'], ['--analytics-log', '/tmp/aider-usage'],
    ['--model', h.config.aiderModel], ['--weak-model', h.config.aiderModel],
  ]) assert.equal(JSON.stringify(values(create.args, flag)) === JSON.stringify([value]), true);
  for (const flag of [
    '--no-auto-lint', '--no-auto-test', '--no-suggest-shell-commands', '--no-detect-urls',
    '--disable-playwright', '--no-check-update', '--no-analytics',
  ]) assert.equal(create.args.includes(flag), true);
  const game = await fs.realpath(h.gameDir);
  const engine = await fs.realpath(h.engineDir);
  const mounts = values(create.args, '--mount');
  const expected = [
    `type=bind,src=${game},dst=/app/src/game`,
    `type=bind,src=${h.requestFile},dst=/request.txt,readonly`,
    ...REFERENCES.map(relative => `type=bind,src=${path.join(engine, relative)},dst=/app/${relative},readonly`),
  ];
  assert.equal(JSON.stringify(mounts) === JSON.stringify(expected), true,
    'only the writable draft, read-only request and specific read-only references may be mounted');
  assert.equal(mounts.filter(mount => !mount.endsWith(',readonly')).length, 1);
  for (const directory of [engine, h.dataDir, h.projectDir, path.dirname(h.gameDir), h.otherGame]) {
    assert.equal(mounts.some(mount => mount.includes(`src=${directory},`)), false);
  }
  const request = await fs.readFile(h.requestFile, 'utf8');
  assert.equal(request.startsWith('Modifie uniquement les fichiers de src/game.'), true);
  assert.equal(request.trimStart().startsWith('/'), false, 'a prompt beginning /run must not become a slash command');
  assert.equal(request.endsWith(`Demande utilisateur :\n${h.args.prompt}`), true);
  for (const privateValue of [h.config.openaiApiKey, h.config.anthropicApiKey, ambient]) {
    assert.equal(request.includes(privateValue), false);
  }
  assert.equal((await fs.stat(h.requestFile)).mode & 0o777, 0o444);
  if (process.getuid?.() === 0) {
    for (const filename of [h.gameDir, path.join(h.gameDir, 'main.js'), path.join(h.gameDir, 'nested'),
      path.join(h.gameDir, 'nested', 'level.json')]) {
      const stat = await fs.stat(filename);
      assert.equal(stat.uid, 1000);
      assert.equal(stat.gid, gid);
    }
  }
  assertNamedCleanup(h);
});

test('Anthropic models receive only their selected provider key and only at create time', async t => {
  const h = await fixture(t, { config: configuration({ aiderModel: 'anthropic/test-model' }) });
  await h.run();
  for (const call of h.docker.calls) {
    assert.equal(Object.values(call.options.env).includes(h.config.openaiApiKey), false);
    assert.equal(Object.values(call.options.env).includes(h.config.anthropicApiKey), call.kind === 'create');
    assert.equal(call.args.some(arg => arg.includes(h.config.anthropicApiKey)), false);
  }
  const create = h.docker.calls.find(call => call.kind === 'create');
  assert.equal(create.options.env.ANTHROPIC_API_KEY === h.config.anthropicApiKey, true);
  assert.equal(values(create.args, '--env').includes('ANTHROPIC_API_KEY'), true);
  assert.equal(values(create.args, '--env').includes('OPENAI_API_KEY'), false);
});

test('stderr handles fragmented lines, split UTF-8, multiple lines and an unterminated final event', async t => {
  const first = Buffer.from(`${analytics({}, { diagnostic: 'fragmented € metadata' })}\n`);
  const split = first.indexOf(Buffer.from('€')) + 1;
  const second = analytics({ prompt_tokens: 3, completion_tokens: 4, total_cost: 0.000002 });
  const h = await fixture(t, { steps: jobSteps({ stderr: [
    'progress\r\n{"event":"ignored","properties":null}\n',
    first.subarray(0, 5), first.subarray(5, split), first.subarray(split, split + 1), first.subarray(split + 1),
    second.slice(0, 7), second.slice(7),
  ] }) });
  await h.run();
  assert.deepEqual(h.usage, [
    { costMicroUsd: 1, inputTokens: 10, outputTokens: 2, requests: 1 },
    { costMicroUsd: 2, inputTokens: 13, outputTokens: 6, requests: 2 },
  ]);
  assertNamedCleanup(h);
});

test('stdout cannot spoof metering, even with a valid analytics JSON event', async t => {
  const h = await fixture(t, { steps: jobSteps({ stdout: [`${analytics()}\n`], stderr: ['ordinary stderr\n'] }) });
  await rejectsSafely(() => h.run(), h.forbidden);
  assert.deepEqual(h.usage, []);
  assertNamedCleanup(h);
});

test('malformed, nonfinite, nonpositive, decreasing or missing usage fails closed and cleans up', async t => {
  const valid = analytics();
  const cases = [
    ['malformed JSON', '{not JSON}\n', 0],
    ['malformed final line', '{not JSON}', 0],
    ['nonfinite cost', '{"event":"message_send","properties":{"prompt_tokens":1,"completion_tokens":1,"total_cost":1e309}}\n', 0],
    ['zero cost', `${analytics({ total_cost: 0 })}\n`, 0],
    ['negative cost', `${analytics({ total_cost: -0.1 })}\n`, 0],
    ['string cost', `${analytics({ total_cost: '0.01' })}\n`, 0],
    ['null cost', `${analytics({ total_cost: null })}\n`, 0],
    ['missing cost', `${analytics({ total_cost: undefined })}\n`, 0],
    ['unsafe cost', `${analytics({ total_cost: 1e10 })}\n`, 0],
    ['missing properties', '{"event":"message_send"}\n', 0],
    ['null properties', '{"event":"message_send","properties":null}\n', 0],
    ['missing prompt tokens', `${analytics({ prompt_tokens: undefined })}\n`, 0],
    ['missing completion tokens', `${analytics({ completion_tokens: undefined })}\n`, 0],
    ['negative prompt tokens', `${analytics({ prompt_tokens: -1 })}\n`, 0],
    ['negative completion tokens', `${analytics({ completion_tokens: -1 })}\n`, 0],
    ['fractional prompt tokens', `${analytics({ prompt_tokens: 1.5 })}\n`, 0],
    ['fractional completion tokens', `${analytics({ completion_tokens: 1.5 })}\n`, 0],
    ['string tokens', `${analytics({ prompt_tokens: '1' })}\n`, 0],
    ['unsafe prompt tokens', `${analytics({ prompt_tokens: Number.MAX_SAFE_INTEGER + 1 })}\n`, 0],
    ['unsafe completion tokens', `${analytics({ completion_tokens: Number.MAX_SAFE_INTEGER + 1 })}\n`, 0],
    ['decreasing cumulative cost', `${valid}\n${analytics({ total_cost: 1e-7 })}\n`, 1],
    ['provider exception', `${valid}\n{"event":"message_send_exception"}\n`, 1],
    ['no events', '', 0],
    ['only unrelated events', '{"event":"other","properties":{}}\n', 0],
    ['oversized stderr line', 'x'.repeat(65537), 0],
  ];
  for (const [label, stderr, accepted] of cases) await t.test(label, async t => {
    const h = await fixture(t, { steps: jobSteps({ stderr: [stderr] }) });
    await rejectsSafely(() => h.run(), h.forbidden);
    assert.equal(h.usage.length, accepted);
    assertNamedCleanup(h);
    assert.equal(h.aider.enabled, true, 'a successfully cleaned failure does not disable future runs');
  });
});

test('parser failures containing private provider text expose only the generic diagnostic', async t => {
  const config = configuration();
  const h = await fixture(t, { config, steps: jobSteps({ stderr: [`{"${config.openaiApiKey}\n`] }) });
  await rejectsSafely(() => h.run(), h.forbidden);
  assertNamedCleanup(h);
});

test('zero tokens and unchanged positive cumulative cost remain valid usage', async t => {
  const line = analytics({ prompt_tokens: 0, completion_tokens: 0, total_cost: 1e-6 });
  const h = await fixture(t, { steps: jobSteps({ stderr: [`${line}\n${line}\n`] }) });
  await h.run({ budgetMicroUsd: 1n });
  assert.deepEqual(h.usage, [
    { costMicroUsd: 1, inputTokens: 0, outputTokens: 0, requests: 1 },
    { costMicroUsd: 1, inputTokens: 0, outputTokens: 0, requests: 2 },
  ]);
  assert.equal(h.docker.calls.some(call => call.kills.length), false);
});

test('over-budget usage is recorded before killing attach and cleaning up the exact container', async t => {
  const h = await fixture(t, { steps: jobSteps({ stderr: [
    `${analytics({ total_cost: 1e-6 })}\n${analytics({ total_cost: 1.0001e-6 })}\n`,
  ], hold: true }) });
  await rejectsSafely(() => h.run({ budgetMicroUsd: 1n }), h.forbidden);
  assert.deepEqual(h.usage, [
    { costMicroUsd: 1, inputTokens: 10, outputTokens: 2, requests: 1 },
    { costMicroUsd: 2, inputTokens: 20, outputTokens: 4, requests: 2 },
  ]);
  const timeline = h.docker.timeline;
  assert.equal(timeline.lastIndexOf('usage') < timeline.indexOf('kill:attach'), true);
  assert.equal(timeline.indexOf('kill:attach') < timeline.indexOf('spawn:ls'), true);
  assert.deepEqual(h.docker.calls.find(call => call.kind === 'attach').kills, ['SIGKILL']);
  assertNamedCleanup(h);
});

test('nonzero attach exit, spawn failure and process error reject without leaking diagnostics', async t => {
  for (const [label, attach, recorded] of [
    ['nonzero exit after usage', { code: 42 }, 1],
    ['spawn failure', { throwOnSpawn: true }, 0],
    ['process error', { error: true }, 0],
  ]) await t.test(label, async t => {
    const config = configuration();
    const h = await fixture(t, { config, steps: jobSteps({ ...attach, diagnostic: config.openaiApiKey }) });
    await rejectsSafely(() => h.run(), h.forbidden);
    assert.equal(h.usage.length, recorded);
    assertNamedCleanup(h);
  });
});

test('failed create still looks up and removes its exact named container without attaching', async t => {
  const h = await fixture(t, { steps: [{ kind: 'create', code: 1 }, ...cleanupSteps()] });
  await rejectsSafely(() => h.run(), h.forbidden);
  assert.equal(h.docker.calls.some(call => call.kind === 'attach'), false);
  assertNamedCleanup(h);
});

test('cancellation before run performs no filesystem writes or container operations', async t => {
  const h = await fixture(t, { steps: [] });
  h.controller.abort();
  await rejectsSafely(() => h.run(), h.forbidden);
  assert.equal(h.docker.calls.length, 2);
  let exists = true;
  try { await fs.stat(h.requestFile); } catch (error) { if (error.code === 'ENOENT') exists = false; else throw error; }
  assert.equal(exists, false);
});

test('cancellation while create is in flight cleans up after create closes and never attaches', async t => {
  const controller = new AbortController();
  const h = await fixture(t, { steps: [
    { kind: 'create', stdout: [`${CONTAINER_ID}\n`], afterOutput: () => controller.abort() },
    ...cleanupSteps(),
  ] });
  await rejectsSafely(() => h.run({ signal: controller.signal }), h.forbidden);
  assert.equal(h.docker.calls.some(call => call.kind === 'attach'), false);
  assert.equal(h.docker.timeline.indexOf('close:create') < h.docker.timeline.indexOf('spawn:ls'), true);
  assertNamedCleanup(h);
});

test('cancellation of attached generation kills the client and still removes the named container', async t => {
  const controller = new AbortController();
  const h = await fixture(t, { steps: jobSteps({ afterOutput: () => controller.abort(), hold: true }) });
  await rejectsSafely(() => h.run({ signal: controller.signal }), h.forbidden);
  assert.equal(h.usage.length, 1);
  assert.deepEqual(h.docker.calls.find(call => call.kind === 'attach').kills, ['SIGKILL']);
  assertNamedCleanup(h);
});

test('attach timeout kills the client and cleans up, even after recording usage', async t => {
  const h = await fixture(t, { config: configuration({ jobTimeoutMs: 10 }), steps: jobSteps({ hold: true }) });
  await rejectsSafely(() => h.run(), h.forbidden);
  assert.equal(h.usage.length, 1);
  assert.deepEqual(h.docker.calls.find(call => call.kind === 'attach').kills, ['SIGKILL']);
  assertNamedCleanup(h);
});

test('usage callbacks must be synchronous and callback failures stop generation', async t => {
  for (const label of ['throws', 'resolved promise', 'rejected promise']) await t.test(label, async t => {
    const h = await fixture(t);
    let calls = 0;
    await rejectsSafely(() => h.run({ onUsage() {
      calls++;
      if (label === 'throws') throw new Error(h.config.openaiApiKey);
      if (label === 'rejected promise') return Promise.reject(new Error(h.config.openaiApiKey));
      return Promise.resolve();
    } }), h.forbidden);
    assert.equal(calls, 1);
    assert.deepEqual(h.docker.calls.find(call => call.kind === 'attach').kills, ['SIGKILL']);
    assertNamedCleanup(h);
  });
});

test('rm failure retains the reservation, disables the runner and prevents another run', async t => {
  const h = await fixture(t, { steps: jobSteps({}, { remove: { code: 1 } }) });
  const error = await rejectsSafely(() => h.run(), h.forbidden);
  assert.equal(error.retainReservation, true);
  assert.equal(h.aider.enabled, false);
  assertNamedCleanup(h);
  const calls = h.docker.calls.length;
  await rejectsSafely(() => h.run(), h.forbidden);
  assert.equal(h.docker.calls.length, calls);
});

test('cleanup lookup failure or ambiguous output retains the reservation without arbitrary removal', async t => {
  for (const [label, list] of [
    ['lookup exit failure', { code: 1 }],
    ['multiple container IDs', { stdout: [`${CONTAINER_ID}\n${'b'.repeat(64)}\n`] }],
    ['untrusted output', { stdout: ['unrelated-container; echo no\n'] }],
  ]) await t.test(label, async t => {
    const h = await fixture(t, { steps: [
      { kind: 'create' }, { kind: 'attach', stderr: [`${analytics()}\n`] }, { kind: 'ls', ...list },
    ] });
    const error = await rejectsSafely(() => h.run(), h.forbidden);
    assert.equal(error.retainReservation, true);
    assert.equal(h.aider.enabled, false);
    assertNamedCleanup(h, false);
  });
});

test('an already absent container needs no rm and does not retain the reservation', async t => {
  const h = await fixture(t, { steps: jobSteps({ code: 1 }, { absent: true }) });
  const error = await rejectsSafely(() => h.run(), h.forbidden);
  assert.equal(error.retainReservation === true, false);
  assert.equal(h.aider.enabled, true);
  assertNamedCleanup(h, false);
});

test('standalone cleanup works while disabled and refuses invalid IDs without spawning', async t => {
  const docker = fakeDocker(t, cleanupSteps());
  const aider = createAider(configuration({ openaiApiKey: '' }), docker.spawnProcess);
  const id = randomUUID();
  await aider.cleanup(id);
  assert.equal(aider.enabled, false);
  assertNamedCleanup({ args: { id }, docker });
  const count = docker.calls.length;
  for (const invalid of ['not-a-uuid', `${id}; echo no`, `../${id}`]) {
    await rejectsSafely(() => aider.cleanup(invalid));
  }
  assert.equal(docker.calls.length, count);
});

test('invalid run arguments fail before creating any container', async t => {
  const h = await fixture(t, { steps: [] });
  for (const overrides of [
    { id: 'not-a-uuid' }, { prompt: '' }, { prompt: ' \n\t ' }, { prompt: null },
    { prompt: 'x'.repeat(16001) }, { budgetMicroUsd: 1 }, { budgetMicroUsd: '1' },
    { budgetMicroUsd: 0n }, { budgetMicroUsd: -1n }, { onUsage: undefined },
  ]) await rejectsSafely(() => h.run(overrides), h.forbidden);
  assert.equal(h.docker.calls.length, 2);
});

test('optional missing reference directories are omitted rather than broadening mounts', async t => {
  const h = await fixture(t);
  // Only remove these empty directories created by this fixture, never repository directories.
  await fs.rmdir(path.join(h.engineDir, 'doc'));
  await fs.rmdir(path.join(h.engineDir, 'src/examples'));
  await h.run();
  const mounts = values(h.docker.calls.find(call => call.kind === 'create').args, '--mount');
  assert.equal(mounts.length, 4);
  assert.equal(mounts.some(mount => mount.includes('dst=/app/doc,')), false);
  assert.equal(mounts.some(mount => mount.includes('dst=/app/src/examples,')), false);
});

test('draft symlinks and reference symlinks cannot expose another project', async t => {
  for (const target of ['draft', 'reference']) await t.test(target, async t => {
    const h = await fixture(t, { steps: [] });
    if (target === 'draft') {
      await fs.symlink(h.otherGame, path.join(h.gameDir, 'escape'), 'dir');
    } else {
      const reference = path.join(h.engineDir, 'doc');
      await fs.rmdir(reference);
      await fs.symlink(h.otherGame, reference, 'dir');
    }
    await rejectsSafely(() => h.run(), h.forbidden);
    assert.equal(h.docker.calls.length, 2);
  });
});

test('a draft inside the engine is rejected before any container can mount it', async t => {
  const h = await fixture(t, { steps: [] });
  await rejectsSafely(() => h.run({ gameDir: path.join(h.engineDir, 'src/game') }), h.forbidden);
  assert.equal(h.docker.calls.length, 2);
});

// Regression tests require fail-closed behavior; do not weaken them if implementation fails.
test('no trailing buffered usage is reported after a metering failure kills attach', async t => {
  const h = await fixture(t, { steps: jobSteps({ stderr: [
    `${analytics()}\n${analytics({ total_cost: 0 })}\n${analytics({ total_cost: 0.000003 })}`,
  ] }) });
  await rejectsSafely(() => h.run(), h.forbidden);
  assertNamedCleanup(h);
  assert.deepEqual(h.usage, [{ costMicroUsd: 1, inputTokens: 10, outputTokens: 2, requests: 1 }]);
});

test('startup drains analytics from a non-root process and preserves its exit status', { timeout: 10000 }, async t => {
  const h = await fixture(t);
  await h.run();
  const startup = values(h.docker.calls.find(call => call.kind === 'create').args, '-c')[0];
  for (const exitCode of [0, 7]) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-aider-fifo-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    await fs.mkdir(path.join(directory, 'src'));
    await fs.writeFile(path.join(directory, 'src/main.js'), 'export const fixture = true;');
    const executable = path.join(directory, 'fake-aider');
    await fs.writeFile(executable, `#!${process.execPath}\n` +
      `const fs = require('node:fs');\n` +
      `const target = process.argv[process.argv.indexOf('--analytics-log') + 1];\n` +
      `fs.appendFileSync(target, JSON.stringify({ event: 'first' }) + '\\n');\n` +
      `setTimeout(() => { fs.appendFileSync(target, JSON.stringify({ event: 'last' }) + '\\n'); process.exit(${exitCode}); }, 10);\n`,
    { mode: 0o755 });
    const uid = process.getuid?.() || 1000;
    const gid = process.getgid?.() || 1000;
    if (process.getuid?.() === 0) {
      for (const filename of [directory, path.join(directory, 'src'), path.join(directory, 'src/main.js'), executable]) {
        await fs.chown(filename, uid, gid);
      }
    }
    const fifo = path.join(directory, 'usage');
    const script = startup.replaceAll('/tmp/aider-usage', fifo).replace('/venv/bin/aider', executable);
    const result = await new Promise((resolve, reject) => {
      const child = spawn('/bin/sh', ['-c', script, 'aider', '--analytics-log', fifo], {
        cwd: directory, uid, gid, env: { PATH: process.env.PATH, HOME: directory, GIT_CONFIG_NOSYSTEM: '1' },
        stdio: ['ignore', 'ignore', 'pipe'], timeout: 5000,
      });
      let output = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', chunk => { output += chunk; });
      child.on('error', reject);
      child.on('close', (code, signal) => resolve({ code, signal, output }));
    });
    assert.equal(result.signal, null);
    assert.equal(result.code, exitCode);
    assert.deepEqual(result.output.trim().split('\n').filter(line => line.startsWith('{')).map(JSON.parse),
      [{ event: 'first' }, { event: 'last' }]);
  }
});

test('cumulative token totals may not overflow safe integers across otherwise valid events', async t => {
  for (const field of ['prompt_tokens', 'completion_tokens']) await t.test(field, async t => {
    const h = await fixture(t, { steps: jobSteps({ stderr: [
      `${analytics({ [field]: Number.MAX_SAFE_INTEGER })}\n${analytics({ [field]: 1, total_cost: 0.000002 })}\n`,
    ] }) });
    await rejectsSafely(() => h.run(), h.forbidden);
    assert.equal(h.usage.length, 1, 'unsafe cumulative usage must not reach onUsage');
    assertNamedCleanup(h);
  });
});
