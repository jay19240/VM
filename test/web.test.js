'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require.resolve('../web/index.html'), 'utf8');
const script = fs.readFileSync(require.resolve('../web/app.js'), 'utf8');
const styles = fs.readFileSync(require.resolve('../web/styles.css'), 'utf8');

// Minimal DOM contract harness, not a browser or a visual/layout test.
class Node {
  constructor(tag, attributes = '') {
    this.tagName = tag.toUpperCase();
    this.children = []; this.events = new Map(); this.value = '';
    this.disabled = /\bdisabled\b/.test(attributes);
    this.hidden = /\bhidden\b/.test(attributes);
  }
  set innerHTML(_value) { throw new Error('Unsafe HTML insertion'); }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return (this.text || '') + this.children.map(node => node.textContent).join(''); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.text = ''; this.children = nodes; }
  addEventListener(name, handler) { this.events.set(name, handler); }
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const response = (data, status = 200) => ({ status, ok: status >= 200 && status < 300, async json() { return structuredClone(data); } });
const projectA = { id: 'project-a', name: 'Mon jeu', createdAt: '2026-09-01T00:00:00Z', generating: false };
const projectB = { ...projectA, id: 'project ?/#', name: 'Autre jeu' };
const codePath = project => `/api/projects/${encodeURIComponent(project.id)}/code`;
const generatePath = project => `/api/projects/${encodeURIComponent(project.id)}/generate`;

async function fixture({ projects = [], config = { model: 'provider/local-model', generationEnabled: true },
  code = '', routes = new Map() } = {}) {
  const nodes = new Map([...html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)]
    .map(([, tag, attributes, id]) => [id, new Node(tag, attributes)]));
  const calls = []; const timers = new Map();
  let now = 0; let nextTimer = 0;
  const context = vm.createContext({
    document: {
      getElementById(id) { assert.ok(nodes.has(id), `Unknown DOM id: ${id}`); return nodes.get(id); },
      createElement(tag) { assert.equal(tag, 'option'); return new Node(tag); },
    },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(url, options) {
      calls.push({ url, options });
      const route = routes.get(`${options.method} ${url}`);
      if (route) return route(options);
      if (options.method === 'GET') {
        if (url === '/api/config') return response(config);
        if (url === '/api/projects') return response({ projects });
        if (/^\/api\/projects\/[^/]+\/code$/.test(url)) return response({ code });
      }
      throw new Error(`Unexpected request: ${options.method} ${url}`);
    },
  }, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(script, context, { filename: 'web/app.js' });
  await flush();
  return {
    nodes, calls, routes, timers, context,
    async advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) { timers.delete(id); timer.fn(); }
      }
      await flush();
    },
    submit(id) { return nodes.get(id).events.get('submit')({ preventDefault() {} }); },
    select(id) { nodes.get('project-select').value = id; return nodes.get('project-select').events.get('change')(); },
  };
}
const posts = h => h.calls.filter(call => call.options.method === 'POST');
function assertLocked(h, locked) {
  for (const id of ['project-name', 'create-project', 'project-select', 'prompt', 'generate']) {
    assert.equal(h.nodes.get(id).disabled, locked, id);
  }
}
function assertWrite(call, url, body) {
  assert.equal(call.url, url);
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.mode, 'same-origin');
  assert.deepEqual({ ...call.options.headers }, { Accept: 'application/json', 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(call.options.body), body);
  assert.equal(call.options.signal, undefined);
}
async function selectedFixture(options = {}) {
  const h = await fixture({ projects: [projectA, projectB], ...options });
  await h.select(projectA.id);
  h.nodes.get('prompt').value = '  Ajoutez un personnage  ';
  return h;
}

test('French local POC has accessible controls, a pre, and no preview or external dependencies', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of script.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(id), id);
  for (const [, references] of html.matchAll(/(?:for|aria-describedby|aria-labelledby)="([^"]+)"/g)) {
    for (const id of references.split(/\s+/)) assert.ok(ids.includes(id), id);
  }
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /<pre id="code"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /prototype local.*une seule personne/);
  assert.match(html, /Aucune validation de syntaxe ni de gameplay/);
  assert.match(html, /jamais exécuté ici/);
  assert.match(html, /10 minutes/);
  assert.deepEqual([...html.matchAll(/<(?:input|textarea|select)\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]),
    ['project-name', 'project-select', 'prompt']);
  assert.doesNotMatch(html, /<(?:iframe|canvas|object|embed)\b|\son\w+\s*=|(?:src|href)="https?:\/\//i);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(styles, /@import|url\(/i);
  assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|new Function|import\s*\(|EventSource|setInterval|AbortController/);
  assert.doesNotMatch(html + script + styles, /csrf|billing|credits|wallet|auth-form|upload-form|job-list|\/generations|\/api\/events|\/api\/session/i);
});

test('bootstrap only reads config and projects; empty state permits creating a project', async () => {
  const h = await fixture();
  assert.deepEqual(h.calls.map(call => [call.options.method, call.url]), [['GET', '/api/config'], ['GET', '/api/projects']]);
  assert.equal(h.nodes.get('ai-model').textContent, 'Modèle Aider : provider/local-model');
  assert.equal(h.nodes.get('create-project').disabled, false);
  assert.equal(h.nodes.get('project-select').disabled, true);
  assert.equal(h.nodes.get('generate').disabled, true);
  assert.equal(h.nodes.get('generation-disabled').hidden, true);
  assert.match(h.nodes.get('notice').textContent, /premier projet/);
  assert.equal(h.timers.size, 0);
});

test('creation sends only a trimmed name, locks controls, selects the 201 project and reads its code', async () => {
  const h = await selectedFixture();
  const delayed = deferred();
  const created = { ...projectB, id: 'new project', name: '<img src=x onerror=alert(1)>' };
  h.routes.set('POST /api/projects', () => delayed.promise);
  h.nodes.get('project-name').value = `  ${created.name}  `;
  const pending = h.submit('create-form');
  assertLocked(h, true);
  await h.submit('create-form'); await h.submit('prompt-form'); await h.select(projectB.id);
  assert.equal(posts(h).length, 1);
  assert.equal(h.nodes.get('project-select').value, projectA.id);
  delayed.resolve(response({ project: created }, 201)); await pending;
  assertWrite(posts(h)[0], '/api/projects', { name: created.name });
  assert.equal(h.nodes.get('project-select').value, created.id);
  assert.equal(h.nodes.get('project-select').children.at(-1).textContent, created.name);
  assert.equal(h.calls.at(-1).url, codePath(created));
  assert.equal(h.nodes.get('project-name').value, '');
  assertLocked(h, false);
});

test('project names, configured model and main.js are inserted as literal text', async () => {
  const payload = '</pre><script>globalThis.executed = true</script>\n<img src=x onerror=alert(1)> & < >';
  const project = { ...projectB, name: payload };
  const h = await fixture({ projects: [project], config: { model: payload, generationEnabled: true }, code: payload });
  await h.select(project.id);
  assert.equal(h.calls.at(-1).url, codePath(project));
  assert.equal(h.nodes.get('project-select').children[1].textContent, payload);
  assert.equal(h.nodes.get('ai-model').textContent, `Modèle Aider : ${payload}`);
  assert.equal(h.nodes.get('code').tagName, 'PRE');
  assert.equal(h.nodes.get('code').textContent, payload);
  assert.equal(h.nodes.get('code').children.length, 0);
  assert.equal(h.context.executed, undefined);
});

for (const stage of ['fetch', 'body']) test(`synchronous generation waits over ten minutes for ${stage}, locks all controls and renders the response`, async () => {
  const h = await selectedFixture();
  const delayed = deferred();
  const code = 'globalThis.executed = true;\n</pre><script>untrusted()</script>\nnot valid JavaScript';
  const result = { project: { ...projectA, name: 'Projet actualisé' }, code };
  h.routes.set(`POST ${generatePath(projectA)}`, () => stage === 'fetch' ? delayed.promise :
    { status: 200, ok: true, json: () => delayed.promise });
  const pending = h.submit('prompt-form');
  await flush();
  assertLocked(h, true);
  assert.match(h.nodes.get('notice').textContent, /Génération en cours.*10 minutes/);
  await h.submit('prompt-form'); await h.submit('create-form'); await h.select(projectB.id);
  await h.advance(600001);
  assertLocked(h, true);
  assert.equal(h.nodes.get('project-select').value, projectA.id);
  assert.equal(posts(h).length, 1);
  assert.equal(h.timers.size, 0);
  assertWrite(posts(h)[0], generatePath(projectA), { prompt: 'Ajoutez un personnage' });
  delayed.resolve(stage === 'fetch' ? response(result) : result); await pending;
  assertLocked(h, false);
  assert.equal(h.nodes.get('code').textContent, code);
  assert.equal(h.nodes.get('code').children.length, 0);
  assert.equal(h.context.executed, undefined);
  assert.equal(h.nodes.get('project-select').children[1].textContent, result.project.name);
  assert.match(h.nodes.get('notice').textContent, /terminée.*sans validation ni exécution/);
  assert.equal(h.calls.length, 4, 'no follow-up requests or polling');
});

test('HTTP errors show server text and status, preserve input and code, and unlock both forms', async () => {
  for (const status of [400, 404, 409, 500, 503]) {
    const h = await selectedFixture({ code: 'previous code' });
    const message = '<b>Demande refusée</b>';
    for (const [form, path] of [['create-form', '/api/projects'], ['prompt-form', generatePath(projectA)]]) {
      h.routes.set(`POST ${path}`, () => response({ error: message }, status));
      h.nodes.get('project-name').value = 'Projet conservé';
      await h.submit(form);
      assertLocked(h, false);
      assert.equal(h.nodes.get('notice').textContent, `${message} (HTTP ${status})`);
      assert.equal(h.nodes.get('notice').className, 'notice error');
      assert.equal(h.nodes.get('notice').children.length, 0);
      assert.equal(h.nodes.get('code').textContent, 'previous code');
      assert.equal(h.nodes.get('project-name').value, 'Projet conservé');
      assert.equal(h.nodes.get('prompt').value, '  Ajoutez un personnage  ');
    }
    await h.advance(600001);
    assert.equal(posts(h).length, 2, 'errors never trigger automatic retries');
  }
});

test('network and unreadable JSON failures unlock controls; an explicit retry can succeed', async () => {
  for (const [reply, message] of [
    [() => { throw new Error('offline'); }, /Connexion interrompue/],
    [() => ({ status: 502, ok: false, json() { throw new Error('not JSON'); } }), /JSON illisible.*502/],
  ]) {
    const h = await selectedFixture();
    h.routes.set(`POST ${generatePath(projectA)}`, reply);
    await h.submit('prompt-form');
    assertLocked(h, false);
    assert.match(h.nodes.get('notice').textContent, message);
    assert.match(h.nodes.get('notice').textContent, /Rechargez/);
    h.routes.set(`POST ${generatePath(projectA)}`, () => response({ project: projectA, code: 'retry result' }));
    await h.submit('prompt-form');
    assert.equal(h.nodes.get('code').textContent, 'retry result');
    assert.equal(h.nodes.get('notice').className, 'notice');
    assert.equal(posts(h).length, 2);
  }
});

test('rapid A → B → A selection discards late code and errors, including errors from the first A', async () => {
  for (const staleError of [false, true]) {
    const h = await fixture({ projects: [projectA, projectB] });
    const first = deferred(); const second = deferred();
    h.routes.set(`GET ${codePath(projectA)}`, () => first.promise);
    h.routes.set(`GET ${codePath(projectB)}`, () => second.promise);
    const oldA = h.select(projectA.id); const oldB = h.select(projectB.id);
    assert.equal(h.nodes.get('code').textContent, '');
    assert.equal(h.nodes.get('project-select').disabled, false);
    h.routes.set(`GET ${codePath(projectA)}`, () => response({ code: 'new A' }));
    await h.select(projectA.id);
    const notice = h.nodes.get('notice').textContent;
    first.resolve(staleError ? response({ error: 'obsolete A' }, 404) : response({ code: 'old A' }));
    second.resolve(response({ error: 'obsolete B' }, 500));
    await Promise.all([oldA, oldB]);
    assert.equal(h.nodes.get('code').textContent, 'new A');
    assert.equal(h.nodes.get('notice').textContent, notice);
    assert.equal(h.nodes.get('project-select').value, projectA.id);
  }
});

test('a code read pending before generation cannot overwrite its result or status', async () => {
  const h = await fixture({ projects: [projectA] });
  const delayed = deferred();
  h.routes.set(`GET ${codePath(projectA)}`, () => delayed.promise);
  const reading = h.select(projectA.id);
  h.nodes.get('prompt').value = 'Une idée';
  h.routes.set(`POST ${generatePath(projectA)}`, () => response({ project: projectA, code: 'generated' }));
  await h.submit('prompt-form');
  delayed.resolve(response({ code: 'stale' })); await reading;
  assert.equal(h.nodes.get('code').textContent, 'generated');
  assert.match(h.nodes.get('notice').textContent, /terminée/);
});

test('current code errors clear the previous code and allow selecting another project', async () => {
  const h = await selectedFixture({ code: 'old A' });
  h.routes.set(`GET ${codePath(projectB)}`, () => response({ error: 'Projet introuvable' }, 404));
  await h.select(projectB.id);
  assert.equal(h.nodes.get('code').textContent, '');
  assert.match(h.nodes.get('notice').textContent, /Projet introuvable.*404/);
  assertLocked(h, false);
  await h.select(projectA.id);
  assert.equal(h.nodes.get('code').textContent, 'old A');
  await h.select('');
  assert.equal(h.nodes.get('code').textContent, '');
  assert.equal(h.nodes.get('generate').disabled, true);
});

test('disabled generation and a running project after reload still allow reading code, but never POST generation', async () => {
  for (const generating of [false, true]) {
    const project = { ...projectA, generating };
    const h = await selectedFixture({ projects: [project], config: { model: 'test-model', generationEnabled: generating } });
    assert.equal(h.nodes.get('generation-disabled').hidden, generating);
    assert.equal(h.nodes.get('generate').disabled, true);
    assert.equal(h.nodes.get('create-project').disabled, false);
    assert.equal(h.nodes.get('project-select').disabled, false);
    if (generating) {
      assert.match(h.nodes.get('notice').textContent, /déjà en cours.*rechargez/);
      assert.match(h.nodes.get('project-select').children[1].textContent, /génération en cours/);
    }
    await h.submit('prompt-form'); await h.advance(600001);
    assert.equal(posts(h).length, 0);
    assert.equal(h.calls.filter(call => call.url === '/api/projects').length, 1);
  }
});

test('whitespace-only names and prompts, or missing selections, never POST', async () => {
  const h = await fixture({ projects: [projectA] });
  h.nodes.get('project-name').value = ' \n ';
  await h.submit('create-form');
  assert.match(h.nodes.get('notice').textContent, /nom/);
  h.nodes.get('prompt').value = 'Une idée'; await h.submit('prompt-form');
  await h.select(projectA.id);
  h.nodes.get('prompt').value = ' \n '; await h.submit('prompt-form');
  assert.match(h.nodes.get('notice').textContent, /Décrivez/);
  assert.equal(posts(h).length, 0);
});

test('bootstrap failure reports a reload instruction without enabling writes', async () => {
  for (const path of ['/api/config', '/api/projects']) {
    const h = await fixture({ routes: new Map([[`GET ${path}`, () => response({ error: 'Serveur indisponible' }, 503)]]) });
    assert.match(h.nodes.get('notice').textContent, /Serveur indisponible.*503.*Rechargez/);
    assert.equal(h.nodes.get('notice').className, 'notice error');
    assertLocked(h, true);
    await h.submit('create-form'); await h.submit('prompt-form');
    assert.equal(posts(h).length, 0);
  }
});
