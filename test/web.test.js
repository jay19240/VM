'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID, randomBytes } = require('node:crypto');
const html = fs.readFileSync(require.resolve('../web/index.html'), 'utf8');
const script = fs.readFileSync(require.resolve('../web/app.js'), 'utf8');
const styles = fs.readFileSync(require.resolve('../web/styles.css'), 'utf8');

// Lightweight DOM contract tests, not a substitute for a real browser/visual test.
class Node {
  constructor(tag = '') {
    this.tagName = tag.toUpperCase(); this.open = false;
    this.children = []; this.events = new Map(); this.attributes = new Map(); this.value = '';
    this.classList = { toggle() {} }; this.hidden = false; this.disabled = false;
  }
  set innerHTML(_value) { throw new Error('Unsafe HTML insertion'); }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return (this.text || '') + this.children.map(node => node.textContent).join(''); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.text = ''; this.children = nodes; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  addEventListener(name, handler) { this.events.set(name, handler); }
  focus() {} reset() {}
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const response = (data, status = 200) => ({ status, ok: status < 400, async json() { return structuredClone(data); } });
async function fixture({ packs = [], plans = [], subscription = null, purchaseReplies = [], checkoutReplies = [],
  portalReplies = [], generationReplies = [], projects = [], jobs = [], sessionOverrides = {}, search = '', eventSourceAvailable = true,
  bootstrapResponse = null } = {}) {
  const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Node()]));
  const calls = []; const streams = []; const timers = new Map(); const routes = new Map();
  const documentEvents = new Map(); const windowEvents = new Map();
  let now = 0; let nextTimer = 0;
  const setTimer = (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, at: now + delay, delay }); return id; };
  async function advance(ms) {
    const target = now + ms;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next; now = timer.at; timers.delete(id); timer.fn(); await flush();
    }
    now = target; await flush();
  }
  class MockEventSource {
    static CONNECTING = 0; static OPEN = 1; static CLOSED = 2;
    constructor(url, options) { this.url = url; this.options = options; this.readyState = 0; this.events = new Map(); this.closed = false; streams.push(this); }
    addEventListener(name, handler) { this.events.set(name, handler); }
    close() { this.closed = true; this.readyState = 2; }
    // Deliberately allow queued events after close to exercise stale-stream guards.
    emit(name, data = {}) {
      if (name === 'open') this.readyState = 1;
      this.events.get(name)?.({ data: typeof data === 'string' ? data : JSON.stringify(data), lastEventId: 'opaque-not-a-revision' });
    }
    error(closed = false) { this.readyState = closed ? 2 : 0; this.emit('error'); }
  }
  const session = { user: { id: randomUUID(), name: '<img src=x onerror=alert(1)>', email: 'fixture@example.test', credits: 20, reservedCredits: 3 },
    csrfToken: randomBytes(32).toString('hex'), generationMaxCredits: 200, generationEnabled: true, billingEnabled: true,
    billingProvider: 'lemon-squeezy', aiModel: 'anthropic/claude-sonnet-4-6', microUsdPerCredit: 10000,
    storage: { usedBytes: 1024 ** 2, limitBytes: 1024 ** 3, maxProjects: 10 }, ...sessionOverrides };
  let authenticated = false;
  const context = vm.createContext({
    console, Headers, FormData, Blob, URL, URLSearchParams, Intl, Date, AbortController, crypto: { randomUUID },
    EventSource: eventSourceAvailable ? MockEventSource : undefined,
    setTimeout: setTimer, clearTimeout: id => timers.delete(id),
    location: { search, assign(url) { calls.push({ redirect: url }); } },
    window: { addEventListener: (name, handler) => windowEvents.set(name, handler) },
    document: { hidden: false, getElementById: id => nodes.get(id), createElement: tag => new Node(tag),
      addEventListener: (name, handler) => documentEvents.set(name, handler) },
    async fetch(url, options) {
      calls.push({ url, options });
      if (url === '/api/session' && bootstrapResponse) {
        const pending = bootstrapResponse; bootstrapResponse = null; return pending;
      }
      const route = routes.get(`${options.method || 'GET'} ${url}`);
      if (route) return route(options);
      let data;
      if (url === '/api/auth/login') { authenticated = true; data = session; }
      else if (url === '/api/session') data = authenticated ? session : { ...session, user: null, csrfToken: null };
      else if (url === '/api/projects') data = { projects };
      else if (/^\/api\/projects\/[^/]+\/generations$/.test(url)) {
        data = options.method === 'POST' ? generationReplies.shift() || {} : { jobs };
      }
      else if (/^\/api\/projects\/[^/]+\/assets$/.test(url)) data = { files: [] };
      else if (url === '/api/wallet') data = { balance: session.user.credits, reserved: session.user.reservedCredits,
        available: session.user.credits - session.user.reservedCredits, entries: [] };
      else if (url === '/api/billing/plans') data = { plans };
      else if (url === '/api/billing/subscription') data = { subscription };
      else if (url === '/api/billing/credit-packs') data = { packs };
      else if (url === '/api/billing/credit-checkout') data = purchaseReplies.shift() || { url: 'https://studio.lemonsqueezy.com/checkout/buy/credits' };
      else if (url === '/api/billing/checkout') data = checkoutReplies.shift() || { url: 'https://studio.lemonsqueezy.com/checkout/buy/plan' };
      else if (url === '/api/billing/portal') data = portalReplies.shift() || { url: 'https://studio.lemonsqueezy.com/billing?expires=123&signature=test' };
      else if (url === '/api/auth/logout') { authenticated = false; return { status: 204, ok: true }; }
      else throw new Error('Unhandled mocked API route');
      if (data === 'network-error') throw new Error('Test network failure');
      const status = data.httpStatus || 200;
      return response(data.body || data, status);
    },
  });
  vm.runInContext(script, context, { filename: 'web/app.js' });
  await flush();
  const snapshot = (overrides = {}) => ({ user: structuredClone(session.user), storage: structuredClone(session.storage),
    generationEnabled: session.generationEnabled, projects: structuredClone(projects),
    projectId: vm.runInContext('state.selected', context), jobs: structuredClone(jobs),
    wallet: { balance: session.user.credits, reserved: session.user.reservedCredits,
      available: session.user.credits - session.user.reservedCredits, entries: [] }, ...overrides });
  return { nodes, calls, context, session, streams, timers, routes, advance, snapshot,
    connection: nodes.get('account').children.at(-1),
    hide(hidden) { context.document.hidden = hidden; documentEvents.get('visibilitychange')(); },
    page(name) { windowEvents.get(name)(); } };
}
const packOffer = { id: 'boost', name: 'Boost', amount: 500, currency: 'eur', credits: 50 };
const planOffer = { id: 'studio', name: 'Studio', amount: 1200, currency: 'eur', credits: 100,
  maxProjects: 10, assetQuotaBytes: 1024 ** 3 };
const projectFixture = { id: 'project-1', name: 'Mon jeu', status: 'ready', createdAt: '2026-09-01T00:00:00Z' };
const login = h => h.nodes.get('auth-form').events.get('submit')({ preventDefault() {} });
const submitPrompt = h => h.nodes.get('prompt-form').events.get('submit')({ preventDefault() {} });
const generationPosts = h => h.calls.filter(call => call.url?.endsWith('/generations') && call.options.method === 'POST');
function setBudget(h, value) {
  h.nodes.get('generation-budget').value = String(value);
  h.nodes.get('generation-budget').events.get('input')();
}
async function generationFixture(options = {}) {
  const h = await fixture({ projects: [projectFixture], ...options });
  await login(h); await h.context.selectProject(projectFixture.id);
  h.nodes.get('prompt').value = 'Ajoute un personnage';
  return h;
}

test('every frontend DOM reference exists once, with no remote dependencies or inline handlers', () => {
  const allIds = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  const ids = new Set(allIds); assert.equal(ids.size, allIds.length);
  for (const match of script.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.has(match[1]), `Missing DOM node ${match[1]}`);
  assert.ok(!/\son[a-z]+\s*=/i.test(html));
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html));
  assert.ok(!/(?:src|href)="https?:\/\//i.test(html));
  for (const match of html.matchAll(/(?:for|aria-describedby|aria-labelledby)="([^"]+)"/g)) {
    for (const id of match[1].split(/\s+/)) assert.ok(ids.has(id), `Missing accessible DOM node ${id}`);
  }
  assert.match(html, /id="generation-budget"[^>]*type="number"[^>]*min="1"[^>]*max="200"[^>]*step="1"/);
  assert.ok(!/stripe|auggie|\bTTC\b|generationCost/i.test(html + script));
  assert.match(html, /taxes et le total à payer sont calculés par Lemon Squeezy/);
});

test('guest bootstrap shows authentication and toggles registration constraints', async () => {
  const h = await fixture();
  assert.equal(h.nodes.get('auth-view').hidden, false); assert.equal(h.nodes.get('studio-view').hidden, true);
  h.nodes.get('register-tab').events.get('click')();
  assert.equal(h.nodes.get('name-field').hidden, false);
  assert.equal(h.nodes.get('password').minLength, 12);
  assert.equal(h.nodes.get('password').autocomplete, 'new-password');
});

test('login renders user-controlled content as text; authenticated POST sends CSRF; logout clears session', async () => {
  const h = await fixture();
  h.nodes.get('email').value = 'fixture@example.test';
  h.nodes.get('password').value = randomBytes(20).toString('hex');
  await h.nodes.get('auth-form').events.get('submit')({ preventDefault() {} });
  assert.equal(h.nodes.get('studio-view').hidden, false);
  assert.equal(h.nodes.get('account-name').textContent, h.session.user.name);
  assert.equal(h.nodes.get('password').value, '');
  assert.equal(h.nodes.get('credit-balance').textContent, '17');
  await h.nodes.get('logout').events.get('click')();
  const request = h.calls.find(call => call.url === '/api/auth/logout');
  assert.ok(request.options.headers.get('X-CSRF-Token') === h.session.csrfToken);
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(h.nodes.get('auth-view').hidden, false);
});

test('credit packs render independently of subscription status, send stable request IDs and never credit from a redirect', async () => {
  const packs = [{ id: 'boost', name: 'Boost', amount: 500, currency: 'eur', credits: 50 }];
  const h = await fixture({ packs, subscription: { planId: 'pro', status: 'active' },
    purchaseReplies: ['network-error', { url: 'https://studio.lemonsqueezy.com/checkout/buy/credits' }] });
  await h.nodes.get('auth-form').events.get('submit')({ preventDefault() {} });
  await h.context.loadBilling();
  assert.equal(h.nodes.get('credit-pack-list').children.length, 1);
  const button = h.nodes.get('credit-pack-list').children[0].children.at(-1);
  assert.equal(button.disabled, false);
  await button.events.get('click')();
  await button.events.get('click')();
  const attempts = h.calls.filter(call => call.url === '/api/billing/credit-checkout');
  assert.equal(attempts.length, 2);
  const first = JSON.parse(attempts[0].options.body); const second = JSON.parse(attempts[1].options.body);
  assert.equal(first.requestId, second.requestId); assert.equal(first.packId, 'boost');
  assert.deepEqual(Object.keys(first).sort(), ['packId', 'requestId']);
  assert.ok(attempts[1].options.headers.get('X-CSRF-Token') === h.session.csrfToken);
  assert.equal(h.nodes.get('credit-balance').textContent, '17');
  assert.equal(h.calls.at(-1).redirect, 'https://studio.lemonsqueezy.com/checkout/buy/credits');
});

test('credit packs remain purchasable without a subscription and use the confirmed server balance', async () => {
  const h = await fixture({ packs: [{ id: 'boost', name: 'Boost', amount: 500, currency: 'eur', credits: 50 }],
    purchaseReplies: [{ status: 'processing' }, { status: 'paid' }] });
  await h.nodes.get('auth-form').events.get('submit')({ preventDefault() {} });
  await h.context.loadBilling();
  const button = h.nodes.get('credit-pack-list').children[0].children.at(-1);
  assert.equal(button.disabled, false);
  await button.events.get('click')(); await button.events.get('click')();
  assert.equal(h.nodes.get('credit-balance').textContent, '17');
  assert.equal(h.nodes.get('wallet-available').textContent, '17');
});

test('payment redirects accept hosted Lemon Squeezy checkout and signed portal paths only on safe authorities', async () => {
  const h = await fixture();
  for (const url of [
    'http://studio.lemonsqueezy.com/checkout/buy/test', '//studio.lemonsqueezy.com/checkout/buy/test',
    'https://studio.lemonsqueezy.com.attacker.test/checkout', 'https://attacker.test/?next=https://studio.lemonsqueezy.com',
    'https://notlemonsqueezy.com', 'https://lemonsqueezy.com', 'https://nested.studio.lemonsqueezy.com',
    'https://studio.lemonsqueezy.com./checkout', 'https://studio_1.lemonsqueezy.com/checkout',
    'https://user@studio.lemonsqueezy.com/checkout', 'https://user:pass@studio.lemonsqueezy.com/checkout',
    'https://studio.lemonsqueezy.com@attacker.test', 'https://studio.lemonsqueezy.com:8443/checkout',
    'https://studio.lemonsqueezy.com:443/checkout', 'https://studio.lemonsqueezy.com:/checkout',
    'https://studio.lemonsqueezy.com\\@attacker.test', 'https://studio.lemonsqueezy.com\n.attacker.test',
    'javascript:alert(1)', 'data:text/html,test', '/checkout/buy/test', '', null, {},
  ]) assert.throws(() => h.context.lemonRedirect(url), /Adresse de paiement non autorisée/, String(url));
  assert.equal(h.calls.filter(call => call.redirect).length, 0);
  for (const url of [
    'https://studio-1.lemonsqueezy.com/checkout/buy/test',
    'https://studio.lemonsqueezy.com/checkout/custom/test?checkout[email]=test%40example.test',
    'https://studio.lemonsqueezy.com/billing?expires=123&signature=test',
    'https://studio.lemonsqueezy.com/billing/subscriptions/test?signature=test',
  ]) {
    h.context.lemonRedirect(url);
    assert.equal(h.calls.at(-1).redirect, new URL(url).href);
  }
});

test('generation budget defaults to min(50, maximum, available), with a disabled minimum for an empty wallet', async () => {
  for (const [credits, reservedCredits, maximum, expected] of [
    [20, 3, 200, '17'], [300, 3, 200, '50'], [300, 0, 12, '12'], [0, 0, 200, '1'],
  ]) {
    const h = await generationFixture({ sessionOverrides: { generationMaxCredits: maximum,
      user: { id: randomUUID(), name: 'Test', credits, reservedCredits } } });
    assert.equal(h.nodes.get('generation-budget').value, expected);
    assert.equal(h.nodes.get('generation-budget').max, String(maximum));
    assert.equal(h.nodes.get('generate').disabled, credits === 0);
    assert.equal(h.nodes.get('ai-model').textContent, 'Aider · anthropic/claude-sonnet-4-6');
  }
});

test('the Aider model badge uses the configured session model as text and the Sonnet fallback', async () => {
  for (const aiModel of ['provider/configured-model', '<img src=x onerror=alert(1)>', '', undefined]) {
    const h = await generationFixture({ sessionOverrides: { aiModel } });
    const badge = h.nodes.get('ai-model');
    assert.equal(badge.textContent, `Aider · ${aiModel || 'anthropic/claude-sonnet-4-6'}`);
    assert.equal(badge.children.length, 0);
  }
});

test('refreshes preserve the chosen or cleared budget and use dynamic USD conversion without confusing EUR prices', async () => {
  const h = await generationFixture();
  assert.match(h.nodes.get('credit-conversion').textContent, /1 crédit plateforme = US\$0\.01/);
  setBudget(h, 6);
  h.session.user.credits = 100;
  h.session.microUsdPerCredit = 25000;
  await h.context.refreshSession();
  assert.equal(h.nodes.get('generation-budget').value, '6');
  assert.match(h.nodes.get('generation-price').textContent, /US\$0\.025/);
  assert.match(h.nodes.get('generation-price').textContent, /US\$0\.15/);
  assert.match(h.nodes.get('credit-conversion').textContent, /USD.*EUR.*pas d’un taux de change/);
  assert.match(h.nodes.get('credit-conversion').textContent, /coût estimé par Aider, pas une facture fournisseur exacte/);
  assert.match(h.nodes.get('generation-price').textContent, /coût estimé par Aider.*Plafond de débit réservé : 6 crédit\(s\)/);
  assert.match(h.nodes.get('generation-price').textContent, /limite les crédits débitables, pas les dépenses du fournisseur/);
  assert.doesNotMatch(h.nodes.get('credit-conversion').textContent + h.nodes.get('generation-price').textContent, /OpenAI/);
  h.session.generationMaxCredits = 5;
  await h.context.refreshSession();
  assert.equal(h.nodes.get('generation-budget').value, '6');
  assert.equal(h.nodes.get('generate').disabled, true);
  setBudget(h, '');
  await h.context.refreshSession();
  assert.equal(h.nodes.get('generation-budget').value, '');
  h.session.generationMaxCredits = undefined; h.session.microUsdPerCredit = undefined;
  await h.context.refreshSession();
  assert.equal(h.nodes.get('generation-budget').max, '200');
  assert.match(h.nodes.get('generation-price').textContent, /US\$0\.01/);
});

test('invalid or unaffordable budgets never POST, including direct form submission; valid limits send integers', async () => {
  const h = await generationFixture({ sessionOverrides: { generationMaxCredits: 20 } });
  for (const budget of ['', ' ', 0, -1, 1.5, 21, 'NaN', 'Infinity', 18, Number.MAX_SAFE_INTEGER + 1]) {
    setBudget(h, budget);
    assert.equal(h.nodes.get('generate').disabled, true, String(budget));
    await submitPrompt(h);
  }
  assert.equal(generationPosts(h).length, 0);
  for (const budget of [1, 17, 20]) {
    if (budget === 20) { h.session.user.credits = 23; await h.context.refreshSession(); }
    setBudget(h, budget); h.nodes.get('prompt').value = '  Ajoute un personnage  ';
    assert.equal(h.nodes.get('generate').disabled, false);
    await submitPrompt(h);
    const request = generationPosts(h).at(-1);
    const body = JSON.parse(request.options.body);
    assert.equal(body.budgetCredits, budget);
    assert.equal(body.prompt, 'Ajoute un personnage');
    assert.deepEqual(Object.keys(body).sort(), ['budgetCredits', 'prompt', 'requestId']);
    assert.match(body.requestId, /^[0-9a-f-]{36}$/);
    assert.equal(request.options.headers.get('X-CSRF-Token'), h.session.csrfToken);
    assert.equal(h.nodes.get('generation-budget').value, String(budget));
  }
  assert.equal(generationPosts(h).length, 3);
  assert.match(h.nodes.get('notice').textContent, /coût estimé par Aider.*converti en crédits, arrondi au crédit supérieur.*publication réussie.*reste sera libéré/);
  assert.match(h.nodes.get('notice').textContent, /Échec, aucun changement publié, estimation manquante ou budget dépassé : aucun débit/);
  assert.doesNotMatch(h.nodes.get('notice').textContent, /OpenAI|coût réel/);
});

test('generation guards also block disabled AI, unready projects, active jobs and insufficient unreserved credits', async () => {
  for (const options of [
    { sessionOverrides: { generationEnabled: false } },
    { projects: [{ ...projectFixture, status: 'preparing' }] },
    { jobs: [{ status: 'running', reservedCost: 8, cost: 8, chargedCredits: null, createdAt: projectFixture.createdAt }] },
    { jobs: [{ status: 'queued', reservedCost: 8, cost: 8, chargedCredits: null, createdAt: projectFixture.createdAt }] },
    { sessionOverrides: { user: { id: randomUUID(), name: 'Test', credits: 20, reservedCredits: 20 } } },
  ]) {
    const h = await generationFixture(options);
    setBudget(h, 1);
    assert.equal(h.nodes.get('generate').disabled, true);
    await submitPrompt(h);
    assert.equal(generationPosts(h).length, 0);
  }
});

test('uncertain generation retries keep their ID and budget; changed budget or prompt gets a new ID', async () => {
  const h = await generationFixture({ generationReplies: ['network-error',
    { httpStatus: 503, body: { error: 'Indisponible' } }, 'network-error', {}] });
  setBudget(h, 12);
  await submitPrompt(h);
  await h.context.refreshSession();
  await submitPrompt(h);
  setBudget(h, 6);
  await submitPrompt(h);
  h.nodes.get('prompt').value = 'Ajoute une caméra';
  await submitPrompt(h);
  const bodies = generationPosts(h).map(call => JSON.parse(call.options.body));
  assert.equal(bodies.length, 4);
  assert.deepEqual(bodies.map(body => body.budgetCredits), [12, 12, 6, 6]);
  assert.equal(bodies[0].requestId, bodies[1].requestId);
  assert.notEqual(bodies[1].requestId, bodies[2].requestId);
  assert.notEqual(bodies[2].requestId, bodies[3].requestId);
  assert.equal(h.nodes.get('credit-balance').textContent, '17');
  assert.equal(h.nodes.get('prompt').value, '');
});

test('legacy job history retains historical OpenAI costs, actual debit and every usage field without unsafe HTML', async () => {
  const usage = { inputTokens: 123, cachedInputTokens: 45, cacheWriteInputTokens: 6,
    outputTokens: 78, reasoningTokens: 9, requests: 2 };
  const jobs = [
    { status: 'succeeded', cost: 13, reservedCost: 50, chargedCredits: 13, providerCostMicroUsd: 120001, usage },
    { status: 'running', cost: 30, reservedCost: 30, chargedCredits: null, providerCostMicroUsd: null, usage: null },
    { status: 'failed', cost: 20, reservedCost: 20, chargedCredits: 0, providerCostMicroUsd: 24000, usage,
      error: '<img src=x onerror=alert(1)>' },
    { status: 'failed', cost: 10, reservedCost: 10, chargedCredits: 0, providerCostMicroUsd: 0, usage: {}, error: 'Aucun changement' },
  ].map(job => ({ ...job, costSource: 'legacy', prompt: '<script>untrusted()</script>', createdAt: projectFixture.createdAt }));
  const h = await generationFixture({ jobs });
  const rows = h.nodes.get('job-list').children;
  assert.equal(rows.length, 4);
  assert.match(rows[0].textContent, /13 crédit\(s\) débité\(s\) · plafond 50 · 37 libéré\(s\)/);
  assert.match(rows[0].textContent, /Usage OpenAI historique : US\$0\.120001/);
  for (const text of ['entrée : 123', 'entrée en cache : 45', 'écriture du cache : 6', 'sortie : 78', 'raisonnement : 9', 'requêtes : 2']) {
    assert.ok(rows[0].textContent.includes(text), text);
  }
  assert.match(rows[0].textContent, /<script>untrusted\(\)<\/script>/);
  assert.match(rows[1].textContent, /30 crédit\(s\) réservé\(s\) · débit réel en attente/);
  assert.doesNotMatch(rows[1].textContent, /débité/);
  assert.match(rows[2].textContent, /0 crédit débité · 20 crédit\(s\) libéré/);
  assert.match(rows[2].textContent, /US\$0\.024 · non facturé au client/);
  assert.match(rows[2].textContent, /<img src=x onerror=alert\(1\)>/);
  assert.match(rows[3].textContent, /0 crédit débité · 10 crédit\(s\) libéré/);
  assert.doesNotMatch(h.nodes.get('job-list').textContent, /NaN|undefined|Coût estimé par Aider/);
  delete jobs[0].costSource;
  await h.context.loadJobs();
  assert.match(h.nodes.get('job-list').children[0].textContent, /Usage OpenAI historique : US\$0\.120001/);
});

test('Aider history shows estimates and server-settled credits without a technical token breakdown', async () => {
  const usage = { inputTokens: 123, outputTokens: 78, requests: 2 };
  const jobs = [
    { status: 'succeeded', cost: 13, reservedCost: 50, chargedCredits: 13, providerCostMicroUsd: 120001, usage },
    { status: 'running', phase: 'coding', cost: 30, reservedCost: 30, chargedCredits: null, providerCostMicroUsd: 20000, usage },
    { status: 'queued', cost: 10, reservedCost: 10, chargedCredits: null, providerCostMicroUsd: 0, usage: null },
    { status: 'succeeded', cost: 0, reservedCost: 10, chargedCredits: 0, providerCostMicroUsd: 0,
      usage: { inputTokens: 0, outputTokens: 0, requests: 1 } },
  ].map(job => ({ ...job, costSource: 'aider', prompt: '<script>untrusted()</script>', createdAt: projectFixture.createdAt }));
  const h = await generationFixture({ jobs });
  const rows = h.nodes.get('job-list').children;
  assert.equal(rows.length, 4);
  assert.match(rows[0].textContent, /13 crédit\(s\) débité\(s\) · plafond 50 · 37 libéré\(s\)/);
  assert.match(rows[0].textContent, /Coût estimé par Aider : US\$0\.120001/);
  assert.match(rows[0].textContent, /<script>untrusted\(\)<\/script>/);
  assert.match(rows[1].textContent, /30 crédit\(s\) réservé\(s\) · débit réel en attente/);
  assert.match(rows[1].textContent, /Coût estimé par Aider : US\$0\.02/);
  assert.doesNotMatch(rows[1].textContent, /débité/);
  assert.match(rows[2].textContent, /10 crédit\(s\) réservé\(s\)/);
  assert.match(rows[2].textContent, /Coût estimé par Aider : indisponible/);
  assert.doesNotMatch(rows[2].textContent, /US\$|débité/);
  assert.match(rows[3].textContent, /0 crédit\(s\) débité\(s\) · plafond 10 · 10 libéré\(s\)/);
  assert.match(rows[3].textContent, /Coût estimé par Aider : US\$0\.00/);
  assert.doesNotMatch(h.nodes.get('job-list').textContent, /OpenAI|Tokens|entrée|sortie|cache|raisonnement|requêtes|NaN|undefined/);
});

test('Aider failures, no change, missing estimates and overbudget results display no debit, never success', async () => {
  const usage = { inputTokens: 100, outputTokens: 10, requests: 1 };
  const jobs = [
    { providerCostMicroUsd: 24000, usage, error: '<img src=x onerror=alert(1)>' },
    { providerCostMicroUsd: 24000, usage, error: 'Aucun changement publié' },
    { providerCostMicroUsd: null, usage: null, error: 'Estimation manquante' },
    { providerCostMicroUsd: 0, usage: null, error: 'Estimation manquante' },
    { providerCostMicroUsd: 510000, usage, error: 'Budget dépassé' },
  ].map(job => ({ ...job, status: 'failed', cost: 50, reservedCost: 50, chargedCredits: 0,
    costSource: 'aider', prompt: 'Une idée', createdAt: projectFixture.createdAt }));
  const h = await generationFixture({ jobs });
  const rows = h.nodes.get('job-list').children;
  assert.equal(rows.length, jobs.length);
  rows.forEach((row, index) => {
    assert.equal(row.children[0].children[0].textContent, 'Échec');
    assert.match(row.textContent, /0 crédit débité · 50 crédit\(s\) libéré/);
    assert.ok(row.textContent.includes(jobs[index].error));
    assert.doesNotMatch(row.textContent, /Appliquée|OpenAI|Tokens/);
  });
  for (const index of [0, 1, 4]) assert.match(rows[index].textContent, /Coût estimé par Aider : US\$.*non facturé au client/);
  for (const index of [2, 3]) {
    assert.match(rows[index].textContent, /Coût estimé par Aider : indisponible/);
    assert.doesNotMatch(rows[index].textContent, /US\$/);
  }
  assert.match(rows[4].textContent, /US\$0\.51/);
  assert.equal(h.nodes.get('credit-balance').textContent, '17', 'rendering must not settle the wallet locally');
});

test('history keeps status labels and only shows coding, validation and publication phases for running jobs', async () => {
  const cases = [
    [{ status: 'running', phase: 'planning', costSource: 'legacy' }, 'En cours'],
    [{ status: 'running', phase: 'planning' }, 'En cours'],
    [{ status: 'running', phase: 'coding' }, 'En cours', 'Écriture du jeu'],
    [{ status: 'running', phase: 'validating' }, 'En cours', 'Vérification'],
    [{ status: 'running', phase: 'publishing' }, 'En cours', 'Publication'],
    [{ status: 'running' }, 'En cours'],
    [{ status: 'running', phase: null, plan: null }, 'En cours'],
    [{ status: 'running', phase: '<img src=x onerror=alert(1)>' }, 'En cours'],
    [{ status: 'running', phase: '__proto__' }, 'En cours'],
    [{ status: 'queued' }, 'En attente'],
    [{ status: 'succeeded', phase: 'validating' }, 'Appliquée'],
    [{ status: 'failed', phase: 'coding' }, 'Échec'],
  ];
  const jobs = cases.map(([job], index) => ({ id: `job-${index}`, cost: 8, costSource: 'aider', prompt: 'Une idée',
    createdAt: projectFixture.createdAt, ...job }));
  const h = await generationFixture({ jobs });
  const rows = h.nodes.get('job-list').children;
  assert.equal(rows.length, cases.length);
  cases.forEach(([, label, phase], index) => {
    const meta = rows[index].children[0];
    assert.equal(meta.children[0].textContent, label);
    assert.equal(meta.children.length, phase ? 3 : 2);
    if (phase) assert.equal(meta.children[1].textContent, phase);
    assert.ok(!rows[index].children.some(node => node.tagName === 'DETAILS'));
  });
  assert.doesNotMatch(h.nodes.get('job-list').textContent, /Analyse du prompt|planning|NaN|undefined|\[object Object\]/);
});

test('plans are not displayed, even when historical or new jobs contain untrusted plan markup', async () => {
  const plan = '  Plan 🎮\n\t<img src=x onerror=alert(1)>\r\n</details><script>untrusted()</script>\n[ouvrir](javascript:alert(1)) &lt;b&gt;  ';
  for (const costSource of ['aider', 'legacy']) {
    const jobs = ['queued', 'running', 'succeeded', 'failed'].map((status, index) => ({ id: `job-${index}`, status,
      costSource, phase: 'coding', plan, prompt: 'Une idée', cost: 8, createdAt: projectFixture.createdAt }));
    const h = await generationFixture({ jobs });
    for (const row of h.nodes.get('job-list').children) {
      assert.ok(!row.children.some(node => node.tagName === 'DETAILS' || node.tagName === 'SUMMARY'));
      assert.doesNotMatch(row.textContent, /Plan 🎮|Plan de création|<img|<script>|javascript:|&lt;b&gt;/);
      assert.match(row.textContent, /Une idée/);
    }
  }
});

test('explicit refresh and project reselection update phases without plan UI or expansion state', async () => {
  const jobs = [{ id: 'job-1', status: 'running', costSource: 'aider', phase: 'coding', plan: 'Plan public', cost: 8,
    prompt: 'Une idée', createdAt: projectFixture.createdAt }];
  const h = await generationFixture({ jobs });
  for (const [phase, label] of [['coding', 'Écriture du jeu'], ['validating', 'Vérification'], ['publishing', 'Publication']]) {
    jobs[0].phase = phase; await h.context.loadJobs();
    const row = h.nodes.get('job-list').children[0];
    assert.equal(row.children[0].children[0].textContent, 'En cours');
    assert.equal(row.children[0].children[1].textContent, label);
    assert.ok(!row.children.some(node => node.tagName === 'DETAILS'));
    assert.doesNotMatch(row.textContent, /Plan public/);
  }
  await h.context.selectProject(projectFixture.id);
  assert.match(h.nodes.get('job-list').textContent, /Publication/);
  assert.doesNotMatch(h.nodes.get('job-list').textContent, /Plan public/);
  assert.equal(vm.runInContext('Object.hasOwn(state, "expandedPlans")', h.context), false);
});

test('absent, empty and non-string plans never create a disclosure or stringify provider data', async () => {
  const jobs = [undefined, null, '', ' \n\t ', {}, ['raw output'], 12].map((plan, index) => ({ id: `job-${index}`,
    status: 'running', phase: null, plan, prompt: 'Une idée', cost: 8, createdAt: projectFixture.createdAt }));
  const h = await generationFixture({ jobs });
  for (const row of h.nodes.get('job-list').children) assert.ok(!row.children.some(node => node.tagName === 'DETAILS'));
  assert.doesNotMatch(h.nodes.get('job-list').textContent, /undefined|null|\[object Object\]|raw output/);
});

test('generation needs only a prompt and budget after project selection and discloses Aider settlement limits', () => {
  const promptForm = html.match(/<form id="prompt-form"[\s\S]*?<\/form>/)[0];
  const fields = [...promptForm.matchAll(/<(?:input|textarea|select)\b[^>]*\bid="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(fields, ['prompt', 'generation-budget']);
  assert.match(promptForm, /Aider · anthropic\/claude-sonnet-4-6/);
  assert.match(promptForm, /Aider écrit le code ; le jeu est vérifié avant publication/);
  assert.match(promptForm, /budget choisi est réservé avant la création, pas facturé d’avance/);
  assert.match(promptForm, /Après publication réussie, le coût estimé par Aider en USD est converti en crédits, arrondi au crédit supérieur ; le reste est libéré/);
  assert.match(promptForm, /Échec, aucun changement publié, estimation manquante ou budget dépassé : aucun débit, réservation libérée/);
  assert.match(promptForm, /Cette estimation n’est pas une facture fournisseur exacte/);
  assert.match(promptForm, /sans garantir un plafond strict des dépenses du fournisseur/);
  assert.doesNotMatch(html + script, /prépare un plan|préparation du plan|Plan de création|expandedPlans|job\.plan|job-plan|planning|Analyse du prompt/);
  assert.doesNotMatch(html, /OpenAI|gpt-6-astra/);
  assert.doesNotMatch(styles, /\.job-plan/);
  assert.match(styles, /\.plan-grid\{/); assert.match(styles, /\.plan\{/);
});

test('shared global storage and project limits refresh, and plan cards show server quotas and EUR minor-unit prices', async () => {
  const h = await generationFixture({ plans: [planOffer], packs: [packOffer] });
  assert.match(h.nodes.get('storage-summary').textContent, /global partagé.*1 Mio \/ 1 Gio.*Projets : 1 \/ 10/);
  assert.equal(h.nodes.get('new-project').disabled, false);
  h.session.storage = { usedBytes: 2 * 1024 ** 2, limitBytes: 2 * 1024 ** 3, maxProjects: 1 };
  await h.context.refreshSession();
  assert.match(h.nodes.get('storage-summary').textContent, /2 Mio \/ 2 Gio.*Projets : 1 \/ 1/);
  assert.equal(h.nodes.get('new-project').disabled, true);
  await h.context.loadBilling();
  assert.match(h.nodes.get('plan-list').textContent, /12,00\s*€.*\/ mois/);
  assert.match(h.nodes.get('plan-list').textContent, /10 projets maximum · 1 Gio.*global partagé, pas par projet/);
  assert.match(h.nodes.get('credit-pack-list').textContent, /5,00\s*€/);
  assert.match(h.context.priceLabel({ currency: 'eur', amount: null }, '').textContent, /Tarif à confirmer/);
});

test('canceled but paid subscriptions block new subscriptions until expiry; mapped expired subscriptions allow them', async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const [status, currentPeriodEnd, disabled] of [
    ['active', now + 3600, true], ['past_due', now - 3600, true], ['paused', null, true],
    ['canceled', now + 3600, true], ['canceled', now - 3600, false], ['incomplete_expired', now - 3600, false],
  ]) {
    const h = await fixture({ plans: [planOffer, { ...planOffer, id: 'pro' }], packs: [packOffer],
      subscription: { planId: planOffer.id, status, currentPeriodEnd, cancelAtPeriodEnd: status === 'canceled' } });
    await login(h); await h.context.loadBilling();
    for (const card of h.nodes.get('plan-list').children) assert.equal(card.children.at(-1).disabled, disabled, status);
    assert.equal(h.nodes.get('credit-pack-list').children[0].children.at(-1).disabled, false);
    if (status === 'canceled') assert.match(h.nodes.get('subscription-status').textContent, /Résilié — période payée jusqu’au/);
  }
});

for (const kind of ['pack', 'plan']) test(`${kind} checkout reuses its ID through network, review and refresh, without automatic POST retries`, async () => {
  const replies = ['network-error', { httpStatus: 409, body: { error: 'Paiement à vérifier' } },
    { status: 'review' }, { url: 'https://studio.lemonsqueezy.com/checkout/buy/test' }];
  const h = await fixture({ packs: [packOffer], plans: [planOffer],
    ...(kind === 'pack' ? { purchaseReplies: replies } : { checkoutReplies: replies }) });
  await login(h); await h.context.loadBilling();
  const list = kind === 'pack' ? 'credit-pack-list' : 'plan-list';
  const route = kind === 'pack' ? '/api/billing/credit-checkout' : '/api/billing/checkout';
  const attempts = () => h.calls.filter(call => call.url === route);
  for (let i = 0; i < 4; i++) {
    await h.nodes.get(list).children[0].children.at(-1).events.get('click')();
    assert.equal(attempts().length, i + 1);
    if (i === 1) assert.match(h.nodes.get('notice').textContent, /Paiement à vérifier/);
    if (i === 2) assert.match(h.nodes.get('notice').textContent, /vérification.*automatiquement/);
    await h.context.refreshSession(); await h.context.loadBilling();
    assert.equal(attempts().length, i + 1, 'refresh must never start checkout');
  }
  const bodies = attempts().map(call => JSON.parse(call.options.body));
  assert.equal(new Set(bodies.map(body => body.requestId)).size, 1);
  assert.match(bodies[0].requestId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(Object.keys(bodies[0]).sort(), [kind === 'pack' ? 'packId' : 'planId', 'requestId']);
  assert.equal(bodies[0][kind === 'pack' ? 'packId' : 'planId'], kind === 'pack' ? packOffer.id : planOffer.id);
  assert.equal(h.calls.filter(call => call.redirect).length, 1);
  assert.equal(h.nodes.get('credit-balance').textContent, '17');
});

test('disabled billing disables all purchase buttons and blocks direct checkout calls', async () => {
  const h = await fixture({ packs: [packOffer], plans: [planOffer], sessionOverrides: { billingEnabled: false } });
  await login(h); await h.context.loadBilling();
  assert.equal(h.nodes.get('billing-disabled').hidden, false);
  for (const list of ['credit-pack-list', 'plan-list']) assert.equal(h.nodes.get(list).children[0].children.at(-1).disabled, true);
  await assert.rejects(h.context.buyCredits(packOffer.id), /pas encore configurés/);
  await assert.rejects(h.context.checkout('plan', planOffer.id), /pas encore configurés/);
  assert.equal(h.calls.filter(call => call.options?.method === 'POST' && call.url.startsWith('/api/billing/')).length, 0);
});

test('all billing actions use the redirect validator and never credit a returned external URL', async () => {
  const h = await fixture({ packs: [packOffer], plans: [planOffer],
    subscription: { planId: 'old', status: 'incomplete_expired' },
    purchaseReplies: [{ url: 'https://attacker.test/' }],
    checkoutReplies: [{ url: 'https://studio.lemonsqueezy.com.attacker.test/' }],
    portalReplies: [{ url: 'https://user@studio.lemonsqueezy.com/billing' },
      { url: 'https://studio.lemonsqueezy.com/billing?signature=test' }] });
  await login(h); await h.context.loadBilling();
  for (const button of [h.nodes.get('credit-pack-list').children[0].children.at(-1),
    h.nodes.get('plan-list').children[0].children.at(-1), h.nodes.get('manage-subscription')]) {
    await button.events.get('click')();
    assert.match(h.nodes.get('notice').textContent, /Adresse de paiement non autorisée/);
  }
  assert.equal(h.calls.filter(call => call.redirect).length, 0);
  assert.equal(h.nodes.get('credit-balance').textContent, '17');
  await h.nodes.get('manage-subscription').events.get('click')();
  assert.equal(h.calls.at(-1).redirect, 'https://studio.lemonsqueezy.com/billing?signature=test');
});

test('billing return query parameters never grant credits or create checkouts', async () => {
  for (const returned of ['success', 'credits-success', 'cancelled', 'credits-cancelled']) {
    const h = await fixture({ search: `?billing=${returned}` });
    await login(h); await new Promise(resolve => setImmediate(resolve));
    assert.match(h.nodes.get('notice').textContent, /Lemon Squeezy/);
    assert.equal(h.nodes.get('credit-balance').textContent, '17');
    assert.equal(h.nodes.get('wallet-available').textContent, '17');
    assert.equal(h.calls.filter(call => call.options?.method === 'POST' && call.url.startsWith('/api/billing/')).length, 0);
  }
});

const posts = h => h.calls.filter(call => call.options?.method === 'POST');
const stateValue = (h, expression) => vm.runInContext(expression, h.context);

test('one authenticated same-origin SSE stream replaces jobs, quotas and wallet without plan UI, preserving session settings', async () => {
  const h = await fixture({ projects: [projectFixture] });
  assert.equal(h.streams.length, 0, 'guests must not open an authenticated stream');
  await login(h);
  const initial = h.streams[0];
  assert.equal(initial.url, '/api/events'); assert.equal(initial.options.withCredentials, true);
  await h.context.selectProject(projectFixture.id);
  const source = h.streams.at(-1);
  assert.equal(initial.closed, true);
  assert.equal(source.url, '/api/events?projectId=project-1');
  const job = { id: 'job-live', status: 'running', phase: 'coding', plan: '<script>Plan public</script>',
    costSource: 'aider', providerCostMicroUsd: 12000, usage: { inputTokens: 100, outputTokens: 20, requests: 1 },
    prompt: 'Une idée', cost: 8, reservedCost: 8, createdAt: projectFixture.createdAt };
  setBudget(h, 6);
  source.emit('snapshot', h.snapshot({ jobs: [job], user: { ...h.session.user, credits: 80, reservedCredits: 8 },
    storage: { usedBytes: 2048, limitBytes: 4096, maxProjects: 1 },
    wallet: { balance: 80, reserved: 8, available: 72, entries: [{ amount: 60, description: 'Crédits reçus', createdAt: projectFixture.createdAt }] } }));
  assert.match(h.nodes.get('job-list').textContent, /En cours.*Écriture du jeu/);
  assert.match(h.nodes.get('job-list').textContent, /Coût estimé par Aider : US\$0\.012/);
  assert.doesNotMatch(h.nodes.get('job-list').textContent, /Plan public|OpenAI|Tokens/);
  assert.equal(h.nodes.get('credit-balance').textContent, '72');
  assert.equal(h.nodes.get('wallet-available').textContent, '72');
  assert.equal(h.nodes.get('wallet-reserved').textContent, '8');
  assert.match(h.nodes.get('ledger').textContent, /Crédits reçus.*\+60/);
  assert.match(h.nodes.get('storage-summary').textContent, /2 Kio \/ 4 Kio/);
  assert.equal(h.nodes.get('new-project').disabled, true);
  assert.ok(!h.nodes.get('job-list').children[0].children.some(node => node.tagName === 'DETAILS'));
  source.emit('snapshot', h.snapshot({ jobs: [{ ...job, status: 'succeeded', cost: 2, chargedCredits: 2 }],
    projects: [{ ...projectFixture, name: 'Nom actualisé' }], generationEnabled: false }));
  assert.match(h.nodes.get('job-list').textContent, /Appliquée.*2 crédit\(s\) débité.*plafond 8 · 6 libéré/);
  assert.doesNotMatch(h.nodes.get('job-list').textContent, /Plan public|Écriture du jeu|Tokens/);
  assert.ok(!h.nodes.get('job-list').children[0].children.some(node => node.tagName === 'DETAILS'));
  assert.equal(h.nodes.get('selected-project').textContent, 'Nom actualisé');
  assert.equal(h.nodes.get('generation-disabled').hidden, false);
  assert.equal(h.nodes.get('generate').disabled, true);
  assert.equal(h.nodes.get('generation-budget').value, '6');
  assert.equal(stateValue(h, 'state.session.csrfToken'), h.session.csrfToken);
  assert.equal(stateValue(h, 'state.session.billingEnabled'), true);
  assert.equal(stateValue(h, 'state.session.generationMaxCredits'), 200);
  assert.equal(stateValue(h, 'state.session.aiModel'), h.session.aiModel);
  assert.equal(h.nodes.get('ai-model').textContent, `Aider · ${h.session.aiModel}`);
  assert.equal(stateValue(h, 'state.session.microUsdPerCredit'), h.session.microUsdPerCredit);
  source.emit('snapshot', h.snapshot({ projects: [], jobs: [] }));
  assert.equal(stateValue(h, 'state.projects.length'), 0);
  assert.equal(stateValue(h, 'state.jobs.length'), 0);
  assert.match(h.nodes.get('ledger').textContent, /Aucune opération/);
  assert.equal(h.nodes.get('generate').disabled, true);
});

test('project changes encode the selected id and reject old streams, wrong-project events and A → B → A REST replies', async () => {
  const other = { ...projectFixture, id: 'project ?&', name: 'Autre jeu' };
  const h = await generationFixture({ projects: [projectFixture, other] });
  const old = h.streams.at(-1);
  const delayed = deferred();
  h.routes.set('GET /api/projects/project-1/generations', () => delayed.promise);
  const read = h.context.loadJobs();
  await h.context.selectProject(other.id);
  assert.equal(h.streams.at(-1).url, '/api/events?projectId=project%20%3F%26');
  old.emit('snapshot', h.snapshot({ projectId: projectFixture.id, user: { ...h.session.user, credits: 999 } }));
  old.emit('session-expired');
  assert.equal(h.nodes.get('credit-balance').textContent, '17');
  const current = h.streams.at(-1);
  current.emit('snapshot', h.snapshot({ projectId: projectFixture.id, jobs: [{ status: 'failed' }] }));
  assert.equal(stateValue(h, 'state.jobs.length'), 0);
  h.routes.delete('GET /api/projects/project-1/generations');
  await h.context.selectProject(projectFixture.id);
  delayed.resolve(response({ jobs: [{ status: 'failed', prompt: 'obsolete' }] })); await read;
  assert.doesNotMatch(h.nodes.get('job-list').textContent, /obsolete/);
  assert.equal(old.closed, true); assert.equal(current.closed, true);
  assert.equal(h.streams.filter(stream => !stream.closed).length, 1);
});

test('a newer snapshot supersedes delayed session, project, job and wallet REST bodies', async () => {
  const h = await generationFixture();
  const values = [
    ['/api/session', { ...h.session, user: { ...h.session.user, credits: 1 } }, () => h.context.refreshSession()],
    ['/api/projects', { projects: [] }, () => h.context.loadProjects()],
    ['/api/projects/project-1/generations', { jobs: [{ status: 'failed', prompt: 'obsolete' }] }, () => h.context.loadJobs()],
    ['/api/wallet', { balance: 1, reserved: 0, available: 1, entries: [] }, () => h.context.loadWallet()],
  ];
  const reads = values.map(([url, , load]) => {
    const body = deferred(); h.routes.set(`GET ${url}`, () => ({ status: 200, ok: true, json: () => body.promise }));
    return { body, pending: load() };
  });
  await flush();
  h.streams.at(-1).emit('snapshot', h.snapshot({ user: { ...h.session.user, credits: 90, reservedCredits: 0 },
    wallet: { balance: 90, reserved: 0, available: 90, entries: [] },
    jobs: [{ id: 'latest', status: 'succeeded', prompt: 'latest', cost: 2, createdAt: projectFixture.createdAt }] }));
  reads.forEach(({ body }, index) => body.resolve(values[index][1]));
  await Promise.all(reads.map(read => read.pending));
  assert.equal(h.nodes.get('credit-balance').textContent, '90');
  assert.equal(h.nodes.get('wallet-available').textContent, '90');
  assert.equal(stateValue(h, 'state.projects.length'), 1);
  assert.match(h.nodes.get('job-list').textContent, /latest/);
  assert.doesNotMatch(h.nodes.get('job-list').textContent, /obsolete/);
});

test('old-account events, reads and unauthorized replies cannot replace or sign out a newer account', async () => {
  const h = await generationFixture();
  const old = h.streams.at(-1); const oldSnapshot = h.snapshot();
  const delayedSession = deferred(); const delayedUnauthorized = deferred();
  h.routes.set('GET /api/session', () => delayedSession.promise);
  h.routes.set('GET /api/wallet', () => delayedUnauthorized.promise);
  const read = h.context.refreshSession();
  const unauthorized = assert.rejects(h.context.loadWallet(), error => error.status === 401);
  await h.nodes.get('logout').events.get('click')();
  h.session.user = { ...h.session.user, id: randomUUID(), name: 'Autre compte', credits: 60, reservedCredits: 0 };
  await login(h);
  old.emit('snapshot', oldSnapshot); old.emit('session-expired'); old.emit('server-shutdown'); old.error(true);
  delayedSession.resolve(response({ ...h.session, user: oldSnapshot.user }));
  delayedUnauthorized.resolve(response({ error: 'Ancienne session' }, 401));
  await Promise.all([read, unauthorized]);
  assert.equal(h.nodes.get('account-name').textContent, 'Autre compte');
  assert.equal(h.nodes.get('credit-balance').textContent, '60');
  assert.equal(h.nodes.get('auth-view').hidden, true);
  assert.equal(h.streams.at(-1).closed, false);
});

test('transient errors use native reconnect; open, ping and repeated full snapshots never poll or POST', async () => {
  const h = await generationFixture(); const source = h.streams.at(-1);
  const requests = h.calls.length; const count = h.streams.length;
  h.context.notify('Erreur de paiement à conserver', true);
  source.emit('snapshot', h.snapshot()); source.error();
  assert.match(h.connection.textContent, /Reconnexion automatique/);
  source.emit('open'); source.emit('snapshot', h.snapshot());
  for (let i = 0; i < 8; i++) { await h.advance(15000); source.emit('ping'); }
  assert.equal(h.calls.length, requests); assert.equal(h.streams.length, count);
  assert.equal(h.nodes.get('notice').textContent, 'Erreur de paiement à conserver');
  assert.match(h.connection.textContent, /connectées/);
  assert.doesNotMatch(script, /schedulePoll|state\.polling|setInterval/);
});

test('CLOSED streams recheck the normal session with bounded exponential backoff and reset after a snapshot', async () => {
  const h = await generationFixture(); const mutations = posts(h).length;
  let sessionReads = h.calls.filter(call => call.url === '/api/session').length;
  for (const delay of [3000, 6000, 12000, 24000, 30000, 30000]) {
    const source = h.streams.at(-1); source.error(true);
    assert.equal(source.closed, true);
    await h.advance(delay - 1);
    assert.equal(h.calls.filter(call => call.url === '/api/session').length, sessionReads);
    await h.advance(1);
    assert.equal(h.calls.filter(call => call.url === '/api/session').length, ++sessionReads);
    assert.notEqual(h.streams.at(-1), source);
  }
  h.streams.at(-1).emit('snapshot', h.snapshot());
  const source = h.streams.at(-1); source.emit('server-shutdown');
  await h.advance(3000);
  assert.notEqual(h.streams.at(-1), source);
  assert.equal(posts(h).length, mutations);
  assert.equal(h.streams.filter(stream => !stream.closed).length, 1);
});

test('CLOSED recovery logs out on 401 or a guest session; network failures remain bounded and read-only', async () => {
  for (const unauthorized of [true, false]) {
    const h = await generationFixture(); const count = h.streams.length;
    h.routes.set('GET /api/session', () => response(unauthorized ? { error: 'Session expirée' } : { ...h.session, user: null }, unauthorized ? 401 : 200));
    h.streams.at(-1).error(true); await h.advance(3000);
    assert.equal(h.nodes.get('auth-view').hidden, false);
    assert.equal(h.streams.length, count); assert.equal(h.timers.size, 0);
  }
  const h = await generationFixture(); const count = h.streams.length; const mutations = posts(h).length;
  h.routes.set('GET /api/session', () => { throw new Error('offline'); });
  h.streams.at(-1).error(true); await h.advance(3000);
  assert.match(h.connection.textContent, /Connexion indisponible/);
  await h.advance(5999); assert.equal(h.streams.length, count);
  h.routes.delete('GET /api/session'); await h.advance(1);
  assert.equal(h.streams.length, count + 1); assert.equal(posts(h).length, mutations);
});

test('heartbeat watchdog restarts a stalled stream around 45 seconds after its last heartbeat', async () => {
  const h = await generationFixture(); const source = h.streams.at(-1);
  source.emit('snapshot', h.snapshot());
  await h.advance(44000); source.emit('ping');
  await h.advance(44000); assert.equal(source.closed, false);
  await h.advance(1000); assert.equal(source.closed, true);
  assert.match(h.connection.textContent, /sans réponse/);
  const mutations = posts(h).length;
  await h.advance(3000);
  assert.notEqual(h.streams.at(-1), source); assert.equal(posts(h).length, mutations);
});

test('hidden and pagehide close streams and timers; visible/pageshow resume exactly one selected-project stream', async () => {
  const h = await generationFixture(); const source = h.streams.at(-1);
  const calls = h.calls.length;
  h.hide(true); assert.equal(source.closed, true); assert.equal(h.timers.size, 0);
  source.emit('session-expired'); source.error(true);
  await h.advance(120000); assert.equal(h.calls.length, calls);
  h.hide(false); const visible = h.streams.at(-1);
  assert.notEqual(visible, source); assert.equal(visible.url, '/api/events?projectId=project-1');
  h.page('pagehide'); assert.equal(visible.closed, true); assert.equal(h.timers.size, 0);
  h.hide(false); assert.equal(h.streams.at(-1), visible, 'visibility alone cannot undo pagehide');
  h.page('pageshow'); assert.equal(h.streams.filter(stream => !stream.closed).length, 1);
  assert.equal(h.streams.at(-1).url, visible.url);
  h.hide(true); h.page('pageshow'); assert.equal(h.streams.filter(stream => !stream.closed).length, 0);
});

test('suspension invalidates a pending session recheck without opening another stream on return', async () => {
  const h = await generationFixture(); const delayed = deferred();
  h.routes.set('GET /api/session', () => delayed.promise);
  h.streams.at(-1).error(true); await h.advance(3000);
  h.hide(true); h.hide(false);
  const source = h.streams.at(-1); const count = h.streams.length;
  source.emit('snapshot', h.snapshot({ user: { ...h.session.user, credits: 40 } }));
  delayed.resolve(response({ ...h.session, user: null })); await flush();
  assert.equal(h.streams.length, count); assert.equal(source.closed, false);
  assert.equal(h.nodes.get('credit-balance').textContent, '37');
});

test('session-expired clears private state and timers and never revives on visibility changes', async () => {
  const h = await generationFixture(); const source = h.streams.at(-1);
  source.emit('snapshot', h.snapshot()); source.emit('session-expired');
  assert.equal(source.closed, true); assert.equal(h.timers.size, 0);
  assert.equal(h.nodes.get('auth-view').hidden, false);
  assert.equal(stateValue(h, 'state.projects.length + state.jobs.length + state.purchaseRequests.size'), 0);
  assert.equal(stateValue(h, 'state.pendingRequest'), null);
  assert.equal(h.nodes.get('prompt').value, ''); assert.equal(h.nodes.get('workbench').hidden, true);
  assert.equal(h.nodes.get('ledger').children.length, 0);
  const count = h.streams.length; const calls = h.calls.length;
  h.hide(true); h.hide(false); h.page('pageshow'); await h.advance(120000);
  assert.equal(h.streams.length, count); assert.equal(h.calls.length, calls);
});

test('logout closes immediately but serializes new login until the old cookie-deleting headers arrive', async () => {
  const h = await generationFixture(); const old = h.streams.at(-1); const delayed = deferred();
  const headers = []; let browserCookie = 'old';
  h.routes.set('POST /api/auth/logout', async () => {
    await delayed.promise;
    // Model the browser applying Set-Cookie before fetch delivers the Response.
    browserCookie = null; headers.push('logout'); return response(null, 204);
  });
  h.routes.set('POST /api/auth/login', () => {
    browserCookie = 'new'; headers.push('login'); return response(h.session);
  });
  const attempts = h.calls.filter(call => call.url === '/api/auth/login').length;
  const logout = h.nodes.get('logout').events.get('click')();
  assert.equal(old.closed, true); assert.equal(h.nodes.get('auth-view').hidden, false);
  const pendingLogin = login(h); await flush();
  assert.equal(h.calls.filter(call => call.url === '/api/auth/login').length, attempts);
  assert.equal(h.nodes.get('auth-submit').disabled, true);
  delayed.resolve(); await Promise.all([logout, pendingLogin]);
  old.emit('session-expired');
  assert.deepEqual(headers, ['logout', 'login']); assert.equal(browserCookie, 'new');
  assert.equal(h.nodes.get('auth-view').hidden, true); assert.equal(h.streams.at(-1).closed, false);
});

test('timed-out logout is aborted before a waiting login can issue a new session cookie', async () => {
  const h = await generationFixture(); const delayed = deferred(); const headers = [];
  let logoutSignal;
  h.routes.set('POST /api/auth/logout', async options => {
    logoutSignal = options.signal;
    await delayed.promise;
    if (!options.signal.aborted) headers.push('logout');
    return response(null, 204);
  });
  h.routes.set('POST /api/auth/login', () => {
    assert.equal(logoutSignal.aborted, true);
    headers.push('login'); return response(h.session);
  });
  const logout = h.nodes.get('logout').events.get('click')();
  const pendingLogin = login(h); await flush();
  await h.advance(29999); assert.deepEqual(headers, []);
  await h.advance(1); await Promise.all([logout, pendingLogin]);
  delayed.resolve(); await flush();
  assert.deepEqual(headers, ['login']);
  assert.equal(h.nodes.get('auth-view').hidden, true);
  assert.equal(stateValue(h, 'state.logoutPending'), null);
});

test('hiding during initial session loading does not discard bootstrap or leave the page stuck', async () => {
  for (const authenticated of [false, true]) {
    for (const finishHidden of [false, true]) {
      const delayed = deferred();
      const h = await fixture({ bootstrapResponse: delayed.promise, projects: [projectFixture] });
      h.hide(true); h.page('pagehide');
      if (!finishHidden) { h.page('pageshow'); h.hide(false); }
      delayed.resolve(response(authenticated ? h.session : { ...h.session, user: null, csrfToken: null }));
      await flush();
      if (finishHidden) { h.page('pageshow'); h.hide(false); }
      await flush();
      assert.equal(h.nodes.get('loading').hidden, true);
      assert.equal(h.nodes.get('auth-view').hidden, authenticated);
      assert.equal(h.nodes.get('studio-view').hidden, !authenticated);
      assert.equal(h.streams.filter(stream => !stream.closed).length, authenticated ? 1 : 0);
      assert.equal(h.calls.filter(call => call.url === '/api/session').length, 1);
    }
  }
});

for (const stage of ['fetch', 'body']) test(`generation ${stage} timeout aborts after 30s, remains uncertain and preserves the request ID for manual retry`, async () => {
  const h = await generationFixture(); const delayed = deferred(); const route = 'POST /api/projects/project-1/generations';
  h.routes.set(route, () => stage === 'fetch' ? delayed.promise : { status: 200, ok: true, json: () => delayed.promise });
  setBudget(h, 6);
  const pending = submitPrompt(h); await flush();
  const first = generationPosts(h)[0];
  await h.advance(29999); assert.equal(first.options.signal.aborted, false);
  await h.advance(1); await pending;
  assert.equal(first.options.signal.aborted, true);
  assert.match(h.nodes.get('notice').textContent, /Délai.*même demande/);
  assert.equal(stateValue(h, 'state.busy'), false);
  assert.equal(generationPosts(h).length, 1);
  // Reconnection, including a shutdown after an uncertain mutation, is read-only.
  h.streams.at(-1).emit('server-shutdown'); await h.advance(3000);
  assert.equal(generationPosts(h).length, 1);
  h.routes.delete(route); await submitPrompt(h);
  assert.equal(generationPosts(h).length, 2);
  assert.equal(JSON.parse(first.options.body).requestId, JSON.parse(generationPosts(h)[1].options.body).requestId);
  delayed.resolve(stage === 'fetch' ? response({}) : {}); await flush();
  assert.equal(generationPosts(h).length, 2);
});

test('REST timeouts cover read bodies and longer mutation limits are bounded, with timers cleaned on all paths', async () => {
  const h = await fixture();
  h.routes.set('GET /slow-read', () => ({ status: 200, ok: true, json: () => new Promise(() => {}) }));
  const read = assert.rejects(h.context.api('/slow-read'), error => /Délai/.test(error.message) && error.uncertain === false);
  await h.advance(30000); await read;
  assert.equal(h.calls.at(-1).options.signal.aborted, true); assert.equal(h.timers.size, 0);
  h.routes.set('POST /slow-write', () => new Promise(() => {}));
  const write = assert.rejects(h.context.api('/slow-write', { method: 'POST', timeoutMs: 999999 }), error => error.uncertain === true);
  await h.advance(119999); assert.equal(h.calls.at(-1).options.signal.aborted, false);
  await h.advance(1); await write;
  assert.equal(h.calls.at(-1).options.signal.aborted, true); assert.equal(h.timers.size, 0);
  await h.context.refreshSession(); assert.equal(h.timers.size, 0);
});

test('malformed SSE and unavailable EventSource report explicit errors without replacing unrelated notices or polling', async () => {
  const h = await generationFixture(); const source = h.streams.at(-1);
  h.context.notify('Erreur indépendante', true); source.emit('snapshot', '{not-json');
  assert.equal(source.closed, true); assert.match(h.connection.textContent, /invalide/);
  assert.equal(h.nodes.get('notice').textContent, 'Erreur indépendante');
  await h.advance(3000);
  h.streams.at(-1).emit('snapshot', h.snapshot({ wallet: null }));
  assert.match(h.connection.textContent, /invalide/);
  assert.equal(h.nodes.get('credit-balance').textContent, '17');
  const unsupported = await fixture({ eventSourceAvailable: false }); await login(unsupported);
  assert.match(unsupported.connection.textContent, /ne prend pas en charge EventSource/);
  assert.equal(unsupported.streams.length, 0); assert.equal(unsupported.timers.size, 0);
  const calls = unsupported.calls.length; await unsupported.advance(120000);
  assert.equal(unsupported.calls.length, calls);
});

test('a delayed 401 from before a newer snapshot cannot clear the current authenticated state', async () => {
  const h = await generationFixture(); const delayed = deferred();
  h.routes.set('GET /api/wallet', () => delayed.promise);
  const read = assert.rejects(h.context.loadWallet(), error => error.status === 401);
  h.streams.at(-1).emit('snapshot', h.snapshot({ user: { ...h.session.user, credits: 50 } }));
  delayed.resolve(response({ error: 'Obsolete' }, 401)); await read;
  assert.equal(h.nodes.get('auth-view').hidden, true);
  assert.equal(h.nodes.get('credit-balance').textContent, '47');
  assert.equal(h.streams.at(-1).closed, false);
});

test('a delayed generation reply after project switching cannot clear the new prompt or trigger extra refreshes', async () => {
  const other = { ...projectFixture, id: 'project-2' };
  const h = await generationFixture({ projects: [projectFixture, other] }); const delayed = deferred();
  h.routes.set('POST /api/projects/project-1/generations', () => delayed.promise);
  const pending = submitPrompt(h);
  await h.context.selectProject(other.id);
  h.nodes.get('prompt').value = 'Nouvelle idée';
  const calls = h.calls.length;
  delayed.resolve(response({})); await pending;
  assert.equal(h.nodes.get('prompt').value, 'Nouvelle idée');
  assert.equal(stateValue(h, 'state.selected'), other.id);
  assert.equal(h.calls.length, calls); assert.equal(generationPosts(h).length, 1);
});

test('invalid REST bodies and rejected mutations remain visible without leaving timeout timers behind', async () => {
  const h = await generationFixture();
  h.routes.set('POST /api/projects/project-1/generations', () => ({ status: 200, ok: true, json() { throw new Error('invalid JSON'); } }));
  await submitPrompt(h);
  assert.match(h.nodes.get('notice').textContent, /Réponse du serveur indisponible.*même demande/);
  const firstId = JSON.parse(generationPosts(h)[0].options.body).requestId;
  h.routes.set('POST /api/projects/project-1/generations', () => response({ error: 'Budget refusé' }, 400));
  await submitPrompt(h);
  assert.equal(JSON.parse(generationPosts(h)[1].options.body).requestId, firstId);
  assert.match(h.nodes.get('notice').textContent, /Budget refusé/);
  assert.equal(stateValue(h, 'state.pendingRequest'), null);
  assert.equal([...h.timers.values()].filter(timer => timer.delay === 30000).length, 0);
});

test('current-stream account mismatch fails closed instead of mixing accounts or CSRF settings', async () => {
  const h = await generationFixture(); const source = h.streams.at(-1);
  source.emit('snapshot', h.snapshot({ user: { ...h.session.user, id: randomUUID() } }));
  assert.equal(source.closed, true); assert.equal(h.nodes.get('auth-view').hidden, false);
  assert.equal(stateValue(h, 'state.session'), null); assert.equal(h.timers.size, 0);
  assert.match(h.nodes.get('notice').textContent, /compte connecté a changé/);
});
