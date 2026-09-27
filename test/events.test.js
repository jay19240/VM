'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Store, timestamp } = require('../server/store');
const { createEvents } = require('../server/events');
const { createApplication } = require('../server/app');
const { loadConfig } = require('../server/config');

const turn = () => new Promise(resolve => setImmediate(resolve));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function bounded(promise, label, ms = 2500) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), ms);
    })]);
  } finally { clearTimeout(timer); }
}
async function waitFor(predicate, label) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, `Timed out: ${label}`);
    await delay(5);
  }
}
function addUser(store) {
  const user = { id: randomUUID(), email: `${randomUUID()}@example.test`, name: 'Event reader',
    passwordHash: randomBytes(32).toString('hex') };
  store.run('INSERT INTO users(id,email,name,password_hash,created_at) VALUES (?,?,?,?,?)',
    user.id, user.email, user.name, user.passwordHash, timestamp());
  return user;
}
function addSession(store, userId, expiresAt = Date.now() + 60000) {
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const csrf = randomBytes(32).toString('hex');
  store.run('INSERT INTO sessions VALUES (?,?,?,?)', tokenHash, userId, csrf, expiresAt);
  return { userId, token, tokenHash, csrf, cookie: `legacy_session=${token}` };
}
function addProject(store, userId, name = 'Event project') {
  const id = randomUUID();
  store.run('INSERT INTO projects VALUES (?,?,?,?,?,?)', id, userId, name, 'ready', timestamp(), timestamp());
  return id;
}
function credit(store, userId, amount) {
  return store.credit(userId, amount, { kind: 'test', reference: randomUUID(), description: 'Test credit' });
}
function memoryStore(t) {
  const store = new Store(':memory:');
  t.after(() => store.close());
  return store;
}

test('Store observers coalesce writes and nested commits into one payload-free postcommit notification', async t => {
  const store = memoryStore(t); const user = addUser(store);
  const seen = [];
  store.subscribe((...args) => seen.push({ args, depth: store.depth, wallet: store.wallet(user.id),
    name: store.get('SELECT name FROM users WHERE id = ?', user.id).name }));
  const result = store.transaction(() => {
    credit(store, user.id, 2);
    store.transaction(() => credit(store, user.id, 3));
    assert.equal(seen.length, 0);
    return 'committed';
  });
  credit(store, user.id, 4); // Another commit in this turn shares the pending invalidation.
  assert.equal(result, 'committed'); assert.equal(seen.length, 0);
  await turn();
  assert.equal(seen.length, 1); assert.deepEqual(seen[0].args, []); assert.equal(seen[0].depth, 0);
  assert.equal(seen[0].wallet.balance, 9); assert.equal(seen[0].wallet.entries.length, 3);
  credit(store, user.id, 1); await turn();
  assert.equal(seen.length, 2); assert.equal(seen[1].wallet.balance, 10);
  store.transaction(() => store.get('SELECT credits FROM users WHERE id = ?', user.id));
  store.run('UPDATE users SET name = ? WHERE id = ?', 'Nobody', randomUUID());
  await turn(); assert.equal(seen.length, 2, 'Reads and zero-row writes do not invalidate');
  store.run('UPDATE users SET name = ? WHERE id = ?', 'Intermediate name', user.id);
  store.run('UPDATE users SET name = ? WHERE id = ?', 'Final name', user.id);
  assert.equal(seen.length, 2); await turn();
  assert.equal(seen.length, 3); assert.equal(seen[2].name, 'Final name');
});

test('Store outer rollback hides all writes, including a released nested savepoint', async t => {
  const store = memoryStore(t); const user = addUser(store); let calls = 0;
  store.subscribe(() => calls++);
  assert.throws(() => store.transaction(() => {
    credit(store, user.id, 10);
    store.transaction(() => credit(store, user.id, 20));
    throw new Error('rollback');
  }), /rollback/);
  await turn(); assert.equal(calls, 0);
  assert.equal(store.wallet(user.id).balance, 0); assert.equal(store.wallet(user.id).entries.length, 0);
  credit(store, user.id, 1); await turn(); assert.equal(calls, 1);
});

test('Store nested rollback is silent and preserves successful outer changes', async t => {
  const store = memoryStore(t); const user = addUser(store); const balances = [];
  store.subscribe(() => balances.push(store.wallet(user.id).balance));
  const rollbackNested = () => assert.throws(() => store.transaction(() => {
    credit(store, user.id, 100); throw new Error('savepoint rollback');
  }), /savepoint rollback/);
  store.transaction(rollbackNested);
  await turn(); assert.deepEqual(balances, []); assert.equal(store.wallet(user.id).balance, 0);
  store.transaction(() => {
    credit(store, user.id, 7);
    rollbackNested();
    assert.deepEqual(balances, []);
  });
  await turn(); assert.deepEqual(balances, [7]); assert.equal(store.wallet(user.id).entries.length, 1);
});

test('Store observer exceptions cannot undo accounting or prevent other observers and future commits', async t => {
  const store = memoryStore(t); const user = addUser(store); let brokenCalls = 0; const balances = [];
  store.subscribe(() => { brokenCalls++; throw new Error('Observer failed'); });
  store.subscribe(() => balances.push(store.wallet(user.id).balance));
  const details = { kind: 'test', reference: randomUUID(), description: 'Committed credit' };
  assert.equal(store.credit(user.id, 8, details), true);
  await turn(); assert.deepEqual(balances, [8]); assert.equal(brokenCalls, 1);
  assert.equal(store.credit(user.id, 8, details), false);
  await turn(); assert.equal(brokenCalls, 1, 'Idempotent accounting is not a change');
  credit(store, user.id, 2); await turn();
  assert.deepEqual(balances, [8, 10]); assert.equal(brokenCalls, 2);
  assert.equal(store.wallet(user.id).entries.reduce((sum, entry) => sum + entry.amount, 0), 10);
});

test('Store unsubscribe and close remove observers and cancel pending callbacks', async () => {
  const store = new Store(':memory:'); let closed = false;
  try {
    const user = addUser(store); let calls = 0;
    for (const invalid of [null, {}, 1]) assert.throws(() => store.subscribe(invalid), TypeError);
    const unsubscribe = store.subscribe(() => calls++);
    credit(store, user.id, 1); unsubscribe(); unsubscribe();
    await turn(); assert.equal(calls, 0);
    store.subscribe(() => calls++);
    credit(store, user.id, 1); await turn(); assert.equal(calls, 1);
    credit(store, user.id, 1); store.close(); closed = true;
    await turn(); assert.equal(calls, 1);
    assert.equal(store.listeners.size, 0); assert.equal(store.notification, null);
    assert.doesNotThrow(unsubscribe);
  } finally { if (!closed) store.close(); }
});

// Only the response surface consumed by createEvents is implemented here.
class FakeResponse extends EventEmitter {
  constructor(writeResults = []) {
    super(); this.writeResults = [...writeResults]; this.chunks = []; this.headers = {};
    this.destroyed = false; this.writableEnded = false; this.endCalls = 0; this.destroyCalls = 0;
  }
  status(value) { this.statusCode = value; return this; }
  set(name, value) {
    for (const [key, entry] of Object.entries(typeof name === 'object' ? name : { [name]: value })) {
      this.headers[key.toLowerCase()] = entry;
    }
    return this;
  }
  setTimeout(value) { this.timeout = value; }
  flushHeaders() { this.flushed = true; }
  write(frame) { this.chunks.push(frame); return this.writeResults.length ? this.writeResults.shift() : true; }
  end(frame) {
    if (frame !== undefined) this.chunks.push(frame);
    this.endCalls++; this.writableEnded = true; this.emit('close');
  }
  destroy() { this.destroyCalls++; this.destroyed = true; this.emit('close'); }
}
function parseFrame(raw) {
  const result = {};
  for (const line of raw.split('\n')) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    result[line.slice(0, colon)] = line.slice(colon + 1).replace(/^ /, '');
  }
  if (Object.hasOwn(result, 'data')) result.data = JSON.parse(result.data);
  return result;
}
const frames = res => res.chunks.join('').split('\n\n').filter(Boolean).map(parseFrame);
const snapshots = res => frames(res).filter(frame => frame.event === 'snapshot');
function eventHarness(t, options = {}) {
  const listeners = new Set();
  const h = { valid: true, value: { revision: 1 }, reads: 0, unsubscribes: 0,
    session: { user_id: randomUUID(), token_hash: randomBytes(32).toString('hex') } };
  const store = {
    get() { if (h.sessionError) throw h.sessionError; return h.valid ? { valid: 1 } : undefined; },
    subscribe(listener) { listeners.add(listener); return () => { h.unsubscribes++; listeners.delete(listener); }; },
  };
  h.events = createEvents({ store, heartbeatMs: 60000, lifetimeMs: 60000, slowClientMs: 60000, ...options });
  h.notify = () => { for (const listener of listeners) listener(); };
  h.snapshot = () => { h.reads++; if (h.readError) throw h.readError; return h.value; };
  h.open = (res = new FakeResponse(), request = {}) => {
    h.events.open({ method: 'GET', session: h.session, ...request }, res, h.snapshot);
    return res;
  };
  h.listenerCount = () => listeners.size;
  t.after(() => h.events.close());
  return h;
}
function assertDetached(res) {
  for (const event of ['close', 'error', 'drain']) assert.equal(res.listenerCount(event), 0);
}

test('SSE initial response has private streaming headers, retry framing and an opaque snapshot ID', t => {
  const h = eventHarness(t); h.value = { message: 'First\nSecond', revision: 1 };
  const res = h.open(); const output = frames(res);
  assert.equal(res.statusCode, 200); assert.equal(res.timeout, 0); assert.equal(res.flushed, true);
  assert.match(res.headers['content-type'], /^text\/event-stream; charset=utf-8$/);
  assert.equal(res.headers['cache-control'], 'private, no-cache, no-store, no-transform');
  assert.equal(res.headers['x-accel-buffering'], 'no'); assert.equal(res.headers.connection, 'keep-alive');
  assert.deepEqual(output[0], { retry: '3000' }); assert.equal(output.length, 2);
  assert.equal(output[1].event, 'snapshot'); assert.deepEqual(output[1].data, h.value);
  assert.match(output[1].id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:1$/);
  assert.ok(!output[1].id.includes(h.session.user_id));
  assert.ok(!res.chunks.join('').includes(h.session.token_hash), 'Session credentials never enter SSE');
  assert.ok(res.chunks.every(chunk => chunk.endsWith('\n\n')));
  assert.equal(h.events.size, 1);
});

test('SSE global invalidations suppress unchanged snapshots and advance IDs only on changes', t => {
  const h = eventHarness(t); const res = h.open(); const first = snapshots(res)[0];
  h.value = { revision: 1 }; h.notify(); h.notify();
  assert.equal(snapshots(res).length, 1);
  h.value = { revision: 2 }; h.notify(); h.notify();
  const next = snapshots(res)[1];
  assert.equal(snapshots(res).length, 2); assert.deepEqual(next.data, { revision: 2 });
  assert.equal(next.id, first.id.replace(/:1$/, ':2'));
});

test('SSE heartbeat pings without duplicating an unchanged snapshot', async t => {
  const h = eventHarness(t, { heartbeatMs: 15 }); const res = h.open();
  await waitFor(() => frames(res).some(frame => frame.event === 'ping'), 'heartbeat ping');
  assert.equal(snapshots(res).length, 1); assert.ok(h.reads >= 2);
  for (const ping of frames(res).filter(frame => frame.event === 'ping')) assert.deepEqual(ping, { event: 'ping', data: {} });
});

test('SSE backpressure retains only the latest dirty snapshot until drain', async t => {
  const h = eventHarness(t, { slowClientMs: 30 }); const res = h.open(new FakeResponse([true, false]));
  assert.equal(h.reads, 1); assert.equal(res.chunks.length, 2);
  for (let revision = 2; revision <= 30; revision++) { h.value = { revision }; h.notify(); }
  assert.equal(h.reads, 1, 'Blocked clients do not build or queue snapshots');
  assert.equal(res.chunks.length, 2);
  res.emit('drain');
  assert.equal(h.reads, 2); assert.deepEqual(snapshots(res).map(frame => frame.data.revision), [1, 30]);
  res.emit('drain'); h.notify(); assert.equal(snapshots(res).length, 2);
  await delay(45);
  assert.equal(res.destroyed, false, 'Drain cancels the slow-consumer deadline'); assert.equal(h.events.size, 1);
});

test('SSE a blocked retry frame defers the initial snapshot and reads the latest state on drain', t => {
  const h = eventHarness(t); const res = h.open(new FakeResponse([false]));
  assert.deepEqual(frames(res), [{ retry: '3000' }]);
  h.value = { revision: 3 }; h.notify();
  res.emit('drain');
  assert.deepEqual(snapshots(res).map(frame => frame.data), [{ revision: 3 }]);
  assert.match(snapshots(res)[0].id, /:1$/);
});

test('SSE a slow consumer is destroyed and does not receive queued data or heartbeats', async t => {
  const h = eventHarness(t, { heartbeatMs: 10, slowClientMs: 35 });
  const res = h.open(new FakeResponse([true, false]));
  h.value = { revision: 2 }; h.notify();
  await waitFor(() => res.destroyed, 'slow consumer deadline');
  assert.equal(h.events.size, 0); assert.equal(res.chunks.length, 2); assert.equal(h.reads, 1);
  assert.equal(res.endCalls, 0); assertDetached(res);
});

test('SSE heartbeat detects session expiry without any store notification', async t => {
  const h = eventHarness(t, { heartbeatMs: 15 }); const res = h.open();
  h.valid = false;
  await waitFor(() => res.writableEnded, 'session expiry');
  assert.deepEqual(frames(res).at(-1), { event: 'session-expired', data: {} });
  assert.equal(snapshots(res).length, 1); assert.equal(h.events.size, 0); assertDetached(res);
});

test('SSE lifetime rotation ends cleanly and reconnect ignores a stale Last-Event-ID', async t => {
  const h = eventHarness(t, { lifetimeMs: 30 }); const res = h.open(); const previous = snapshots(res)[0].id;
  await waitFor(() => res.writableEnded, 'connection rotation');
  assert.equal(res.destroyed, false); assert.equal(h.events.size, 0); assertDetached(res);
  h.value = { revision: 9 };
  const fresh = h.open(new FakeResponse(), { headers: { 'last-event-id': previous } });
  assert.deepEqual(snapshots(fresh)[0].data, { revision: 9 });
  assert.notEqual(snapshots(fresh)[0].id, previous); assert.match(snapshots(fresh)[0].id, /:1$/);
});

for (const event of ['close', 'error']) {
  test(`SSE response ${event} cleans up listeners, timers and connection capacity`, async t => {
    const h = eventHarness(t, { heartbeatMs: 10, lifetimeMs: 25, maxConnections: 1 }); const res = h.open();
    res.emit(event, ...(event === 'error' ? [new Error('Response failed')] : []));
    assert.equal(h.events.size, 0); assertDetached(res);
    const writes = res.chunks.length; const reads = h.reads;
    h.notify(); res.emit('drain'); await delay(40);
    assert.equal(res.chunks.length, writes); assert.equal(h.reads, reads); assert.equal(res.endCalls, 0);
    const replacement = h.open(); assert.equal(h.events.size, 1); replacement.emit('close');
  });
}

test('SSE shutdown ends writable streams, destroys blocked streams and unsubscribes exactly once', async t => {
  const h = eventHarness(t, { heartbeatMs: 10, lifetimeMs: 25, slowClientMs: 30 });
  const writable = h.open(); const blocked = h.open(new FakeResponse([true, false]));
  h.events.close(); h.events.close();
  assert.deepEqual(frames(writable).at(-1), { event: 'server-shutdown', data: {} });
  assert.equal(writable.endCalls, 1); assert.equal(blocked.destroyCalls, 1);
  assert.equal(h.events.size, 0); assert.equal(h.unsubscribes, 1); assert.equal(h.listenerCount(), 0);
  assertDetached(writable); assertDetached(blocked);
  const writes = writable.chunks.length + blocked.chunks.length;
  h.notify(); await delay(45);
  assert.equal(writable.chunks.length + blocked.chunks.length, writes);
  assert.equal(blocked.destroyCalls, 1);
  const refused = new FakeResponse();
  assert.throws(() => h.open(refused), { status: 503 }); assert.equal(refused.chunks.length, 0);
});

test('SSE per-user and global caps reject before opening and capacity is reusable', t => {
  const h = eventHarness(t, { maxPerUser: 1, maxConnections: 2 }); const first = h.open();
  const sameUser = new FakeResponse();
  assert.throws(() => h.open(sameUser), { status: 429 });
  assert.equal(sameUser.headers['retry-after'], '30'); assert.equal(sameUser.flushed, undefined);
  const other = h.open(new FakeResponse(), { session: { ...h.session, user_id: randomUUID() } });
  const overGlobal = new FakeResponse();
  assert.throws(() => h.open(overGlobal, { session: { ...h.session, user_id: randomUUID() } }), { status: 429 });
  assert.equal(overGlobal.headers['retry-after'], '30'); assert.equal(overGlobal.chunks.length, 0);
  first.emit('close'); const replacement = h.open(); assert.equal(h.events.size, 2);
  other.emit('close'); replacement.emit('close'); assert.equal(h.events.size, 0);
});

test('SSE requires GET and a currently valid session before reading or opening', t => {
  const h = eventHarness(t); const wrongMethod = new FakeResponse();
  assert.throws(() => h.open(wrongMethod, { method: 'POST' }), { status: 405 });
  h.valid = false; const expired = new FakeResponse();
  assert.throws(() => h.open(expired), { status: 401 });
  assert.equal(h.reads, 0); assert.equal(h.events.size, 0);
  assert.equal(wrongMethod.chunks.length + expired.chunks.length, 0);
});

test('SSE rejects oversized initial UTF-8 snapshots before sending headers', t => {
  const h = eventHarness(t, { maxFrameBytes: 64 }); h.value = { text: 'é'.repeat(30) };
  assert.ok(JSON.stringify(h.value).length < 64); assert.ok(Buffer.byteLength(JSON.stringify(h.value)) > 64);
  const res = new FakeResponse(); assert.throws(() => h.open(res), { status: 503 });
  assert.equal(res.flushed, undefined); assert.equal(res.chunks.length, 0); assert.equal(h.events.size, 0);
  assertDetached(res);
  h.value = { revision: 1 }; h.open(); assert.equal(h.events.size, 1);
});

test('SSE destroys a stream when an updated snapshot exceeds the frame cap', t => {
  const h = eventHarness(t, { maxFrameBytes: 64 }); const res = h.open();
  h.value = { text: 'é'.repeat(30) }; h.notify();
  assert.equal(res.destroyed, true); assert.equal(snapshots(res).length, 1);
  assert.equal(h.events.size, 0); assertDetached(res);
});

for (const failure of ['read', 'serialization']) {
  test(`SSE initial ${failure} failure writes no private exception or partial stream`, t => {
    const h = eventHarness(t); const diagnostic = randomBytes(24).toString('hex');
    if (failure === 'read') h.readError = new Error(diagnostic);
    else h.value = { toJSON() { throw new Error(diagnostic); } };
    const res = new FakeResponse();
    // The application error middleware handles errors before the stream is opened.
    assert.throws(() => h.open(res));
    assert.equal(res.flushed, undefined); assert.equal(res.chunks.length, 0);
    assert.equal(h.events.size, 0); assertDetached(res);
  });
}
for (const failure of ['read', 'serialization', 'session read']) {
  test(`SSE live ${failure} failure disconnects without serializing private diagnostics`, t => {
    const h = eventHarness(t); const res = h.open(); const diagnostic = randomBytes(24).toString('hex');
    if (failure === 'read') h.readError = new Error(diagnostic);
    else if (failure === 'session read') h.sessionError = new Error(diagnostic);
    else h.value = { toJSON() { throw new Error(diagnostic); } };
    assert.doesNotThrow(h.notify);
    assert.equal(res.destroyed, true); assert.equal(h.events.size, 0); assertDetached(res);
    assert.equal(snapshots(res).length, 1);
    assert.ok(!res.chunks.join('').includes(diagnostic), 'Private diagnostics stay off the wire');
  });
}

// A continuous reader avoids competing reader.read() calls and retains only test-sized frames.
function collectStream(response, controller) {
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  const stream = { frames: [], ended: false, failed: false, cursor: 0 };
  let buffer = '';
  stream.done = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        assert.ok(buffer.length < 1024 * 1024, 'Unexpectedly large SSE test buffer');
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          if (raw) stream.frames.push(parseFrame(raw));
        }
      }
    } catch { stream.failed = true; }
    finally { stream.ended = true; reader.releaseLock(); }
  })();
  stream.snapshots = () => stream.frames.filter(frame => frame.event === 'snapshot');
  stream.nextSnapshot = async () => {
    const index = stream.cursor++;
    await waitFor(() => stream.snapshots().length > index || stream.ended, 'HTTP snapshot');
    assert.ok(stream.snapshots().length > index, 'Stream ended before its next snapshot');
    return stream.snapshots()[index];
  };
  stream.expectEnd = async event => {
    await bounded(stream.done, 'HTTP stream end');
    assert.equal(stream.failed, false, 'Server must end SSE cleanly');
    assert.deepEqual(stream.frames.at(-1), { event, data: {} });
  };
  stream.stop = async () => { controller.abort(); await bounded(stream.done, 'aborted HTTP stream'); };
  return stream;
}
async function httpFixture(t) {
  const tempRoot = await fs.realpath(os.tmpdir());
  const temp = await fs.mkdtemp(path.join(tempRoot, 'legacy-events-test-'));
  const original = await fs.lstat(temp);
  let platform; let server;
  const controllers = new Set(); const streams = new Set();
  t.after(async () => {
    try {
      platform?.beginShutdown();
      for (const controller of controllers) controller.abort();
      try { await Promise.all([...streams].map(stream => bounded(stream.done, 'stream teardown'))); }
      finally {
        if (server) {
          const closing = server.listening
            ? new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
            : Promise.resolve();
          server.closeAllConnections(); // Also clean up a server.close() that timed out in a test.
          await bounded(closing, 'server teardown');
        }
      }
    } finally {
      try { await platform?.close(); }
      finally {
        // Remove only the same non-symlink directory returned by this fixture's mkdtemp.
        const current = await fs.lstat(temp);
        assert.equal(path.dirname(temp), tempRoot);
        assert.match(path.basename(temp), /^legacy-events-test-[A-Za-z0-9]+$/);
        assert.ok(current.isDirectory() && !current.isSymbolicLink());
        assert.equal(current.dev, original.dev); assert.equal(current.ino, original.ino);
        await fs.rm(temp, { recursive: true, force: true });
      }
    }
  });
  const template = path.join(temp, 'template');
  await fs.mkdir(path.join(template, 'src/game'), { recursive: true });
  await fs.mkdir(path.join(template, 'public'), { recursive: true });
  await fs.writeFile(path.join(template, 'src/game/main.js'), 'export const level = 1;\n');
  const config = { ...loadConfig({ DATA_DIR: path.join(temp, 'data'), APP_URL: 'http://localhost:3000' }),
    engineDir: template, jobTimeoutMs: 1000 };
  platform = await createApplication({ config, runner: { enabled: false } });
  server = platform.app.listen(0, '127.0.0.1');
  await bounded(new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); }), 'listen');
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    ...platform, server,
    account() { const user = addUser(platform.store); return { ...user, ...addSession(platform.store, user.id) }; },
    request(route, { session, method = 'GET', headers = {}, body } = {}) {
      return fetch(base + route, { method, signal: AbortSignal.timeout(2500),
        headers: { Origin: config.appUrl, ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    },
    async open(session, projectId = null, headers = {}) {
      const controller = new AbortController(); controllers.add(controller);
      try {
        const response = await bounded(fetch(base + '/api/events' + (projectId === null ? '' : `?projectId=${projectId}`),
          { headers: { Cookie: session.cookie, ...headers }, signal: controller.signal }), 'open HTTP stream');
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /^text\/event-stream/);
        const stream = collectStream(response, controller); streams.add(stream); return stream;
      } catch (error) { controller.abort(); throw error; }
    },
  };
}
function assertKeys(object, keys) { assert.deepEqual(Object.keys(object).sort(), [...keys].sort()); }
async function assertQuiet(stream, count) {
  await turn(); await delay(40);
  assert.equal(stream.snapshots().length, count, 'Unchanged owner-filtered snapshots must be suppressed');
  assert.equal(stream.ended, false);
}

test('HTTP events requires a valid cookie and rejects foreign Origin and Sec-Fetch-Site', { timeout: 10000 }, async t => {
  const h = await httpFixture(t); const user = h.account();
  const unauthorized = [undefined, { cookie: `legacy_session=${randomBytes(32).toString('hex')}` },
    addSession(h.store, user.id, Date.now() - 1)];
  for (const session of unauthorized) {
    const response = await h.request('/api/events', { session });
    assert.equal(response.status, 401); assert.match(response.headers.get('content-type'), /application\/json/);
    await response.json();
  }
  for (const headers of [{ Origin: 'https://foreign.example.test' }, { Origin: 'null' },
    { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }]) {
    const response = await h.request('/api/events', { session: user, headers });
    assert.equal(response.status, 403); await response.json();
  }
  for (const site of ['same-origin', 'none']) {
    const stream = await h.open(user, null, { Origin: h.config.appUrl, 'Sec-Fetch-Site': site });
    assert.equal((await stream.nextSnapshot()).data.user.id, user.id); await stream.stop();
  }
});

test('HTTP events validates project selectors and conceals foreign or missing projects', { timeout: 10000 }, async t => {
  const h = await httpFixture(t); const alice = h.account(); const bob = h.account();
  const foreign = addProject(h.store, bob.id);
  for (const id of [foreign, randomUUID()]) {
    const response = await h.request(`/api/events?projectId=${id}`, { session: alice });
    assert.equal(response.status, 404); await response.json();
  }
  for (const query of ['projectId=invalid', 'projectId=', 'unexpected=1', `projectId=${foreign}&projectId=${foreign}`]) {
    const response = await h.request(`/api/events?${query}`, { session: alice });
    assert.equal(response.status, 400); await response.json();
  }
});

test('HTTP snapshots expose only the public protocol, latest 100 jobs and no credentials or private columns', { timeout: 10000 }, async t => {
  const h = await httpFixture(t); const user = h.account(); const projectId = addProject(h.store, user.id);
  credit(h.store, user.id, 12);
  const privateRequest = randomBytes(24).toString('hex'); const privatePricing = randomBytes(24).toString('hex');
  const ids = [];
  h.store.transaction(() => {
    for (let index = 0; index < 105; index++) {
      const id = randomUUID(); ids.push(id);
      h.store.run(`INSERT INTO jobs(id,user_id,project_id,request_id,prompt,cost,status,created_at,completed_at,pricing_json)
        VALUES (?,?,?,?,?,1,'succeeded',?,?,?)`, id, user.id, projectId, `${privateRequest}-${index}`,
      `Public prompt ${index}`, timestamp(), timestamp(), JSON.stringify({ privatePricing }));
    }
  });
  await turn();
  const stream = await h.open(user, projectId); const { data } = await stream.nextSnapshot();
  assertKeys(data, ['user', 'storage', 'generationEnabled', 'projects', 'projectId', 'jobs', 'wallet']);
  assertKeys(data.user, ['id', 'email', 'name', 'credits', 'reservedCredits']);
  assert.deepEqual(data.storage, { usedBytes: 0, limitBytes: h.config.maxUserAssetBytes, maxProjects: h.config.maxProjects });
  assert.equal(data.generationEnabled, false); assert.equal(data.projectId, projectId);
  assert.equal(data.projects.length, 1); assertKeys(data.projects[0], ['id', 'name', 'status', 'createdAt', 'updatedAt']);
  assert.equal(data.jobs.length, 100); assert.deepEqual(data.jobs.map(job => job.id), ids.slice(-100).reverse());
  for (const job of data.jobs) assertKeys(job, ['id', 'projectId', 'status', 'prompt', 'phase', 'plan', 'cost',
    'reservedCost', 'chargedCredits', 'providerCostMicroUsd', 'costSource', 'usage', 'error', 'createdAt', 'completedAt']);
  assertKeys(data.wallet, ['balance', 'reserved', 'available', 'entries']);
  assertKeys(data.wallet.entries[0], ['id', 'kind', 'amount', 'reservedDelta', 'description', 'createdAt']);
  const wire = JSON.stringify(stream.frames);
  for (const privateValue of [user.token, user.tokenHash, user.csrf, user.passwordHash, privateRequest, privatePricing]) {
    assert.ok(!wire.includes(privateValue), 'A private credential or database field leaked into the snapshot');
  }
  const dashboard = await h.open(user); const dashboardView = (await dashboard.nextSnapshot()).data;
  assert.equal(dashboardView.projectId, null); assert.deepEqual(dashboardView.jobs, []);
  assert.deepEqual(dashboardView.projects, data.projects); assert.deepEqual(dashboardView.wallet, data.wallet);
});

test('HTTP global invalidations remain isolated by user and selected project', { timeout: 10000 }, async t => {
  const h = await httpFixture(t); const alice = h.account(); const bob = h.account();
  const one = addProject(h.store, alice.id, 'Alice one'); const two = addProject(h.store, alice.id, 'Alice two');
  const other = addProject(h.store, bob.id, 'Bob only'); credit(h.store, alice.id, 20); credit(h.store, bob.id, 10);
  const jobOne = h.store.reserveJob(alice.id, one, randomUUID(), 'First public task', 2);
  const jobTwo = h.store.reserveJob(alice.id, two, randomUUID(), 'Second public task', 2);
  const jobOther = h.store.reserveJob(bob.id, other, randomUUID(), 'Other public task', 2);
  h.store.run('INSERT INTO assets VALUES (?,?,?,?,?,?)', randomUUID(), one, 'one.png', '', 3, timestamp());
  h.store.run('INSERT INTO assets VALUES (?,?,?,?,?,?)', randomUUID(), other, 'other.png', '', 7, timestamp());
  await turn();
  const [a, b, c] = await Promise.all([h.open(alice, one), h.open(alice, two), h.open(bob, other)]);
  const [first, second, third] = await Promise.all([a.nextSnapshot(), b.nextSnapshot(), c.nextSnapshot()]);
  assert.deepEqual(first.data.jobs.map(job => job.id), [jobOne.id]);
  assert.deepEqual(second.data.jobs.map(job => job.id), [jobTwo.id]);
  assert.deepEqual(third.data.jobs.map(job => job.id), [jobOther.id]);
  assert.deepEqual(first.data.projects.map(project => project.id).sort(), [one, two].sort());
  assert.deepEqual(third.data.projects.map(project => project.id), [other]);
  assert.equal(first.data.user.id, alice.id); assert.equal(third.data.user.id, bob.id);
  assert.equal(first.data.storage.usedBytes, 3); assert.equal(second.data.storage.usedBytes, 3);
  assert.equal(third.data.storage.usedBytes, 7);
  h.store.transaction(() => {
    h.store.run("UPDATE jobs SET status = 'running' WHERE id = ?", jobOne.id);
    h.store.updateJobProgress(jobOne.id, { phase: 'planning' });
  });
  assert.equal((await a.nextSnapshot()).data.jobs[0].phase, 'planning');
  await Promise.all([assertQuiet(b, 1), assertQuiet(c, 1)]);
  credit(h.store, bob.id, 5);
  assert.equal((await c.nextSnapshot()).data.wallet.balance, 15);
  await Promise.all([assertQuiet(a, 2), assertQuiet(b, 1)]);
  credit(h.store, alice.id, 3);
  const [updatedOne, updatedTwo] = await Promise.all([a.nextSnapshot(), b.nextSnapshot()]);
  assert.equal(updatedOne.data.wallet.balance, 23); assert.equal(updatedTwo.data.wallet.balance, 23);
  assert.equal(updatedTwo.data.jobs[0].phase, null); await assertQuiet(c, 2);
  h.store.run('INSERT INTO assets VALUES (?,?,?,?,?,?)', randomUUID(), two, 'two.png', '', 4, timestamp());
  const storageUpdates = await Promise.all([a.nextSnapshot(), b.nextSnapshot()]);
  for (const update of storageUpdates) assert.equal(update.data.storage.usedBytes, 7);
  await assertQuiet(c, 2);
  assert.ok(!JSON.stringify(a.frames).includes(bob.email)); assert.ok(!JSON.stringify(c.frames).includes(alice.email));
});

test('HTTP commits update credits and job phases atomically, rollback is invisible and reconnect is fresh', { timeout: 10000 }, async t => {
  const h = await httpFixture(t); const user = h.account(); const projectId = addProject(h.store, user.id);
  credit(h.store, user.id, 12); await turn();
  const stream = await h.open(user, projectId); const initial = await stream.nextSnapshot();
  assert.equal(initial.data.user.credits, 12); assert.deepEqual(initial.data.jobs, []);
  const job = h.store.reserveJob(user.id, projectId, randomUUID(), 'Public task', 3);
  let view = (await stream.nextSnapshot()).data;
  assert.equal(view.jobs[0].status, 'queued'); assert.equal(view.user.reservedCredits, 3);
  assert.equal(view.wallet.reserved, 3); assert.equal(view.wallet.available, 9);
  h.store.transaction(() => {
    h.store.run("UPDATE jobs SET status = 'running' WHERE id = ?", job.id);
    h.store.updateJobProgress(job.id, { phase: 'planning' });
  });
  view = (await stream.nextSnapshot()).data;
  assert.equal(view.jobs[0].status, 'running'); assert.equal(view.jobs[0].phase, 'planning');
  const plan = 'Update the level, then validate syntax.';
  h.store.updateJobProgress(job.id, { phase: 'coding', plan });
  view = (await stream.nextSnapshot()).data; assert.equal(view.jobs[0].phase, 'coding'); assert.equal(view.jobs[0].plan, plan);
  h.store.updateJobProgress(job.id, { phase: 'validating' });
  view = (await stream.nextSnapshot()).data; assert.equal(view.jobs[0].phase, 'validating'); assert.equal(view.jobs[0].plan, plan);
  h.store.preparePublication(job.id);
  view = (await stream.nextSnapshot()).data; assert.equal(view.jobs[0].status, 'running'); assert.equal(view.jobs[0].phase, 'publishing');
  h.store.finishJob(job.id, true);
  view = (await stream.nextSnapshot()).data;
  assert.equal(view.jobs[0].status, 'succeeded'); assert.equal(view.jobs[0].chargedCredits, 3);
  assert.equal(view.user.credits, 9); assert.equal(view.user.reservedCredits, 0);
  assert.equal(view.wallet.balance, 9); assert.equal(view.wallet.reserved, 0); assert.equal(view.wallet.available, 9);
  assert.equal(view.wallet.entries[0].kind, 'generation'); assert.equal(view.wallet.entries[0].amount, -3);
  const count = stream.snapshots().length;
  assert.throws(() => h.store.transaction(() => {
    credit(h.store, user.id, 100);
    h.store.run('UPDATE projects SET name = ? WHERE id = ?', 'Rolled back title', projectId);
    throw new Error('rollback');
  }), /rollback/);
  await assertQuiet(stream, count); assert.equal(h.store.wallet(user.id).balance, 9);
  assert.equal(h.store.ownProject(user.id, projectId).name, 'Event project');
  await stream.stop(); credit(h.store, user.id, 4); await turn();
  const reconnect = await h.open(user, projectId, { 'Last-Event-ID': initial.id });
  const fresh = await reconnect.nextSnapshot();
  assert.equal(fresh.data.wallet.balance, 13); assert.equal(fresh.data.jobs[0].status, 'succeeded');
  assert.notEqual(fresh.id, initial.id); assert.match(fresh.id, /:1$/); await assertQuiet(reconnect, 1);
});

for (const action of ['logout', 'revocation']) {
  test(`HTTP ${action} closes live session streams but leaves a different session usable`, { timeout: 10000 }, async t => {
    const h = await httpFixture(t); const user = h.account(); const sibling = addSession(h.store, user.id);
    await turn();
    const [one, two, survivor] = await Promise.all([h.open(user), h.open(user), h.open(sibling)]);
    await Promise.all([one.nextSnapshot(), two.nextSnapshot(), survivor.nextSnapshot()]);
    if (action === 'logout') {
      const response = await h.request('/api/auth/logout', { session: user, method: 'POST' }); assert.equal(response.status, 204);
    } else h.store.run('DELETE FROM sessions WHERE token_hash = ?', user.tokenHash);
    await Promise.all([one.expectEnd('session-expired'), two.expectEnd('session-expired')]);
    const refused = await h.request('/api/events', { session: user }); assert.equal(refused.status, 401); await refused.json();
    await assertQuiet(survivor, 1);
    credit(h.store, user.id, 2); assert.equal((await survivor.nextSnapshot()).data.wallet.balance, 2);
  });
}

test('HTTP initial snapshot failures return sanitized JSON rather than leaking private diagnostics', { timeout: 10000 }, async t => {
  const h = await httpFixture(t); const user = h.account(); const diagnostic = randomBytes(24).toString('hex');
  const original = h.store.wallet;
  try {
    h.store.wallet = () => { throw new Error(diagnostic); };
    const response = await h.request('/api/events', { session: user });
    assert.equal(response.status, 500); assert.match(response.headers.get('content-type'), /application\/json/);
    const body = await response.text();
    assert.ok(!body.includes(diagnostic), 'HTTP errors must not disclose snapshot exceptions');
    assert.deepEqual(JSON.parse(body), { error: 'Une erreur interne est survenue.' });
  } finally { h.store.wallet = original; }
  const stream = await h.open(user); assert.equal((await stream.nextSnapshot()).data.user.id, user.id);
});

test('HTTP beginShutdown ends active streams before server.close and rejects new work', { timeout: 10000 }, async t => {
  const h = await httpFixture(t); const user = h.account(); const projectId = addProject(h.store, user.id);
  const [dashboard, project] = await Promise.all([h.open(user), h.open(user, projectId)]);
  await Promise.all([dashboard.nextSnapshot(), project.nextSnapshot()]);
  h.beginShutdown(); h.beginShutdown();
  await Promise.all([dashboard.expectEnd('server-shutdown'), project.expectEnd('server-shutdown')]);
  assert.equal(h.server.listening, true, 'Streams end before the HTTP listener is closed');
  assert.equal(h.jobs.available, false);
  for (const [route, options] of [['/api/events', {}], ['/api/projects', { method: 'POST', body: { name: 'Refused' } }]]) {
    const response = await h.request(route, { session: user, ...options }); assert.equal(response.status, 503); await response.json();
  }
  assert.equal(h.store.get('SELECT count(*) AS n FROM projects').n, 1);
  // No forced connection destruction here: graceful shutdown must allow server.close to finish.
  await bounded(new Promise((resolve, reject) => h.server.close(error => error ? reject(error) : resolve())), 'graceful server.close');
  assert.equal(h.server.listening, false);
});
