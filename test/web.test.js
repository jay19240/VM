'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID, randomBytes } = require('node:crypto');
const html = fs.readFileSync(require.resolve('../web/index.html'), 'utf8');
const script = fs.readFileSync(require.resolve('../web/app.js'), 'utf8');

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
async function fixture({ packs = [], plans = [], subscription = null, purchaseReplies = [], checkoutReplies = [],
  portalReplies = [], generationReplies = [], projects = [], jobs = [], sessionOverrides = {}, search = '' } = {}) {
  const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Node()]));
  const calls = [];
  const session = { user: { id: randomUUID(), name: '<img src=x onerror=alert(1)>', email: 'fixture@example.test', credits: 20, reservedCredits: 3 },
    csrfToken: randomBytes(32).toString('hex'), generationMaxCredits: 200, generationEnabled: true, billingEnabled: true,
    billingProvider: 'lemon-squeezy', aiModel: 'gpt-6-astra', microUsdPerCredit: 10000,
    storage: { usedBytes: 1024 ** 2, limitBytes: 1024 ** 3, maxProjects: 10 }, ...sessionOverrides };
  let authenticated = false;
  const context = vm.createContext({
    console, Headers, FormData, Blob, URL, URLSearchParams, Intl, Date, crypto: { randomUUID },
    setTimeout: () => 1, clearTimeout() {},
    location: { search, assign(url) { calls.push({ redirect: url }); } },
    window: { addEventListener() {} },
    document: { hidden: false, getElementById: id => nodes.get(id), createElement: tag => new Node(tag), addEventListener() {} },
    async fetch(url, options) {
      calls.push({ url, options });
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
      return { ok: status < 400, status, async json() { return data.body || data; } };
    },
  });
  vm.runInContext(script, context, { filename: 'web/app.js' });
  await new Promise(resolve => setImmediate(resolve));
  return { nodes, calls, context, session };
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
    assert.match(h.nodes.get('ai-model').textContent, /OpenAI · gpt-6-astra/);
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
  assert.match(h.nodes.get('notice').textContent, /publication réussie.*reste sera libéré.*aucun débit/);
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

test('job history displays actual debit, released ceiling, provider USD and every usage field without unsafe HTML', async () => {
  const usage = { inputTokens: 123, cachedInputTokens: 45, cacheWriteInputTokens: 6,
    outputTokens: 78, reasoningTokens: 9, requests: 2 };
  const jobs = [
    { status: 'succeeded', cost: 13, reservedCost: 50, chargedCredits: 13, providerCostMicroUsd: 120001, usage },
    { status: 'running', cost: 30, reservedCost: 30, chargedCredits: null, providerCostMicroUsd: null, usage: null },
    { status: 'failed', cost: 20, reservedCost: 20, chargedCredits: 0, providerCostMicroUsd: 24000, usage,
      error: '<img src=x onerror=alert(1)>' },
    { status: 'failed', cost: 10, reservedCost: 10, chargedCredits: 0, providerCostMicroUsd: 0, usage: {}, error: 'Aucun changement' },
  ].map(job => ({ ...job, prompt: '<script>untrusted()</script>', createdAt: projectFixture.createdAt }));
  const h = await generationFixture({ jobs });
  const rows = h.nodes.get('job-list').children;
  assert.equal(rows.length, 4);
  assert.match(rows[0].textContent, /13 crédit\(s\) débité\(s\) · plafond 50 · 37 libéré\(s\)/);
  assert.match(rows[0].textContent, /US\$0\.120001/);
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
  assert.doesNotMatch(h.nodes.get('job-list').textContent, /NaN|undefined/);
});

test('running jobs display each French agent phase, while legacy and terminal statuses retain their labels', async () => {
  const cases = [
    [{ status: 'running', phase: 'planning' }, 'Analyse du prompt'],
    [{ status: 'running', phase: 'coding' }, 'Écriture du jeu'],
    [{ status: 'running', phase: 'validating' }, 'Vérification'],
    [{ status: 'running', phase: 'publishing' }, 'Publication'],
    [{ status: 'running' }, 'Création en cours'],
    [{ status: 'running', phase: null, plan: null }, 'Création en cours'],
    [{ status: 'running', phase: '<img src=x onerror=alert(1)>' }, 'Création en cours'],
    [{ status: 'running', phase: '__proto__' }, 'Création en cours'],
    [{ status: 'queued' }, 'En attente'],
    [{ status: 'succeeded', phase: 'validating' }, 'Appliquée'],
    [{ status: 'failed', phase: 'coding' }, 'Non facturée'],
  ];
  const jobs = cases.map(([job], index) => ({ id: `job-${index}`, cost: 8, prompt: 'Une idée',
    createdAt: projectFixture.createdAt, ...job }));
  const h = await generationFixture({ jobs });
  const rows = h.nodes.get('job-list').children;
  assert.equal(rows.length, cases.length);
  cases.forEach(([, label], index) => {
    assert.equal(rows[index].children[0].children[0].textContent, label);
    assert.ok(!rows[index].children.some(node => node.tagName === 'DETAILS'));
  });
  assert.doesNotMatch(h.nodes.get('job-list').textContent, /NaN|undefined|\[object Object\]/);
});

test('public plans are collapsed native details and render markup, links and line breaks only as text', async () => {
  const plan = '  Plan 🎮\n\t<img src=x onerror=alert(1)>\r\n</details><script>untrusted()</script>\n[ouvrir](javascript:alert(1)) &lt;b&gt;  ';
  const jobs = ['running', 'succeeded', 'failed'].map((status, index) => ({ id: `job-${index}`, status,
    phase: 'coding', plan, prompt: 'Une idée', cost: 8, createdAt: projectFixture.createdAt }));
  const h = await generationFixture({ jobs });
  for (const row of h.nodes.get('job-list').children) {
    const details = row.children.find(node => node.tagName === 'DETAILS');
    assert.ok(details); assert.equal(details.open, false);
    assert.equal(details.children.length, 2);
    assert.equal(details.children[0].tagName, 'SUMMARY');
    assert.equal(details.children[0].textContent, 'Plan de création');
    assert.equal(details.children[1].tagName, 'P');
    assert.equal(details.children[1].textContent, plan);
    assert.equal(details.children[1].children.length, 0, 'untrusted plan must create no child elements');
    assert.equal(details.children[1].attributes.size, 0);
  }
});

test('polling preserves plan expansion through phase changes and switching projects resets it', async () => {
  const jobs = [{ id: 'job-1', status: 'running', phase: 'coding', plan: 'Plan public', cost: 8,
    prompt: 'Une idée', createdAt: projectFixture.createdAt }];
  const h = await generationFixture({ jobs });
  const details = () => h.nodes.get('job-list').children[0].children.find(node => node.tagName === 'DETAILS');
  details().open = true; details().events.get('toggle')();
  jobs[0].phase = 'validating'; await h.context.loadJobs();
  assert.equal(details().open, true);
  assert.match(h.nodes.get('job-list').textContent, /Vérification/);
  details().open = false; details().events.get('toggle')();
  await h.context.loadJobs(); assert.equal(details().open, false);
  details().open = true; details().events.get('toggle')();
  await h.context.selectProject(projectFixture.id); assert.equal(details().open, false);
});

test('absent, empty and non-string plans never create a disclosure or stringify provider data', async () => {
  const jobs = [undefined, null, '', ' \n\t ', {}, ['raw output'], 12].map((plan, index) => ({ id: `job-${index}`,
    status: 'running', phase: null, plan, prompt: 'Une idée', cost: 8, createdAt: projectFixture.createdAt }));
  const h = await generationFixture({ jobs });
  for (const row of h.nodes.get('job-list').children) assert.ok(!row.children.some(node => node.tagName === 'DETAILS'));
  assert.doesNotMatch(h.nodes.get('job-list').textContent, /undefined|null|\[object Object\]|raw output/);
});

test('prompt hints explain preparation, coding, validation and one shared budget without changing settlement terms', () => {
  assert.match(html, /L’IA prépare un plan, puis écrit le code ; le jeu est vérifié avant publication/);
  assert.match(html, /Un seul budget est partagé entre toutes les étapes : préparation du plan, écriture du code et validation avant publication/);
  assert.match(html, /Après publication réussie, seul le coût total réel OpenAI en USD est débité/);
  assert.match(html, /Échec ou aucun changement publié : aucun débit/);
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
