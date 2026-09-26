'use strict';
const { createHash, randomUUID } = require('node:crypto');
const { HttpError } = require('./errors');

// Only public, owner-filtered application views cross this channel. No provider
// stream, SQL arguments, session credentials or raw agent output is forwarded.
function createEvents({ store, heartbeatMs = 15000, lifetimeMs = 300000,
  slowClientMs = 30000, maxPerUser = 5, maxConnections = 200, maxFrameBytes = 16 * 1024 ** 2 }) {
  const clients = new Set();
  let closed = false;
  const unsubscribe = store.subscribe(() => {
    for (const client of clients) client.update();
  });
  function open(req, res, snapshot) {
    if (closed) throw new HttpError(503, 'Le serveur est en cours d’arrêt.');
    if (req.method !== 'GET') throw new HttpError(405, 'Le flux requiert GET.');
    const userId = req.session.user_id;
    if (clients.size >= maxConnections || [...clients].filter(c => c.userId === userId).length >= maxPerUser) {
      res.set('Retry-After', '30');
      throw new HttpError(429, 'Trop de connexions en direct. Ferme les onglets inutilisés.');
    }
    const validSession = () => Boolean(store.get(
      'SELECT 1 FROM sessions WHERE token_hash = ? AND user_id = ? AND expires_at > ?',
      req.session.token_hash, userId, Date.now()));
    if (!validSession()) throw new HttpError(401, 'Connecte-toi pour continuer.');
    // Fail normally (JSON HTTP error) before opening a stream if the view is invalid.
    const initial = JSON.stringify(snapshot());
    if (Buffer.byteLength(initial) > maxFrameBytes) throw new HttpError(503, 'Le suivi en direct est temporairement indisponible.');
    const streamId = randomUUID();
    let sequence = 0; let lastHash; let ended = false; let blocked = false; let dirty = false;
    let heartbeat; let lifetime; let slow;
    const client = { userId, update, end };
    function cleanup() {
      if (ended) return;
      ended = true; clients.delete(client);
      clearInterval(heartbeat); clearTimeout(lifetime); clearTimeout(slow);
      res.removeListener('drain', drain); res.removeListener('close', cleanup); res.removeListener('error', disconnect);
    }
    function disconnect() { cleanup(); res.destroy(); }
    function end(event) {
      if (ended) return;
      if (blocked) { disconnect(); return; }
      cleanup();
      try { res.end(event ? `event: ${event}\ndata: {}\n\n` : undefined); } catch { res.destroy(); }
    }
    function write(frame) {
      if (ended) return;
      try {
        if (res.destroyed || res.writableEnded) { cleanup(); return; }
        if (!res.write(frame)) {
          blocked = true;
          // Retain at most one frame plus a dirty bit, never an unbounded event queue.
          slow = setTimeout(disconnect, slowClientMs); slow.unref();
        }
      } catch { disconnect(); }
    }
    function sendSnapshot(data) {
      if (Buffer.byteLength(data) > maxFrameBytes) { disconnect(); return; }
      const hash = createHash('sha256').update(data).digest('hex');
      if (hash === lastHash) return;
      lastHash = hash;
      write(`id: ${streamId}:${++sequence}\nevent: snapshot\ndata: ${data}\n\n`);
    }
    function update() {
      if (ended) return;
      try {
        if (!validSession()) { end('session-expired'); return; }
        if (blocked) { dirty = true; return; }
        sendSnapshot(JSON.stringify(snapshot()));
      } catch { disconnect(); } // Never serialize private exceptions into SSE.
    }
    function drain() {
      blocked = false; clearTimeout(slow); slow = null;
      if (dirty) { dirty = false; update(); }
    }
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'private, no-cache, no-store, no-transform',
      'X-Accel-Buffering': 'no', Connection: 'keep-alive',
    });
    res.setTimeout(0); // Incoming request/body deadlines remain enabled globally.
    res.on('close', cleanup); res.on('error', disconnect); res.on('drain', drain);
    clients.add(client);
    heartbeat = setInterval(() => {
      // Also reevaluate time-based session/entitlement expiry and generator availability.
      update();
      if (!ended && !blocked) write('event: ping\ndata: {}\n\n');
    }, heartbeatMs);
    heartbeat.unref();
    // Rotate long-lived connections; EventSource reconnects and gets a fresh view.
    lifetime = setTimeout(() => end(), lifetimeMs); lifetime.unref();
    try { res.flushHeaders(); } catch { disconnect(); return; }
    // Last-Event-ID is intentionally opaque, never authorization. Reconnects always
    // get a current DB snapshot rather than a lossy in-memory event-log replay.
    write('retry: 3000\n\n');
    if (blocked) dirty = true;
    else sendSnapshot(initial);
  }
  return { open, get size() { return clients.size; }, close() {
    if (closed) return;
    closed = true; unsubscribe();
    for (const client of clients) client.end('server-shutdown');
  } };
}
module.exports = { createEvents };
