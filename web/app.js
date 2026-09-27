'use strict';
const $ = id => document.getElementById(id);
const state = { session: null, projects: [], selected: null, jobs: [], registering: false,
  pendingRequest: null, purchaseRequests: new Map(), budgetUserId: null,
  view: 'projects', epoch: 0, revision: 0, selection: 0, busy: false,
  stream: null, streamVersion: 0, reconnectTimer: null, heartbeatTimer: null, reconnectAttempt: 0, pageActive: true,
  logoutPending: null };
const format = new Intl.NumberFormat('fr-FR');
const date = value => new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const statuses = { queued: 'En attente', running: 'En cours', succeeded: 'Appliquée', failed: 'Échec' };
const phases = { coding: 'Écriture du jeu', validating: 'Vérification', publishing: 'Publication' };
const usdFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
const usd = microUsd => `US$${usdFormat.format(microUsd / 1000000)}`;
const generationMax = () => Number.isSafeInteger(state.session?.generationMaxCredits) && state.session.generationMaxCredits > 0 ? state.session.generationMaxCredits : 200;
const creditMicroUsd = () => Number.isSafeInteger(state.session?.microUsdPerCredit) && state.session.microUsdPerCredit > 0 ? state.session.microUsdPerCredit : 10000;
function chosenBudget() {
  const value = Number($('generation-budget').value);
  return Number.isSafeInteger(value) && value >= 1 && value <= generationMax() ? value : null;
}
function bytesLabel(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'quota à confirmer';
  const unit = bytes >= 1024 ** 3 ? 'Gio' : bytes >= 1024 ** 2 ? 'Mio' : bytes >= 1024 ? 'Kio' : 'octets';
  const divisor = { Gio: 1024 ** 3, Mio: 1024 ** 2, Kio: 1024, octets: 1 }[unit];
  return `${format.format(bytes / divisor)} ${unit}`;
}
function renderStorage() {
  const storage = state.session?.storage;
  $('storage-summary').textContent = storage ? `Stockage global partagé entre tous tes projets : ${bytesLabel(storage.usedBytes)} / ${bytesLabel(storage.limitBytes)}. Projets : ${format.format(state.projects.length)} / ${format.format(storage.maxProjects)}.` : 'Quotas de stockage et de projets en attente.';
  $('new-project').disabled = !state.session?.user || Boolean(storage && state.projects.length >= storage.maxProjects);
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function notify(message, error = false) {
  $('notice').textContent = message;
  $('notice').className = error ? 'notice error' : 'notice';
  $('notice').hidden = !message;
}
// A snapshot supersedes every older REST read. Selection also distinguishes A → B → A.
const readTicket = () => ({ epoch: state.epoch, revision: state.revision, selection: state.selection });
const isCurrent = (ticket, snapshot = true) => ticket.epoch === state.epoch && ticket.selection === state.selection &&
  (!snapshot || ticket.revision === state.revision);
const connectionStatus = el('span', 'hint');
connectionStatus.setAttribute('role', 'status');
connectionStatus.setAttribute('aria-live', 'polite');
$('account').append(connectionStatus);
async function api(url, options = {}) {
  const ticket = readTicket();
  const { timeoutMs = 30000, ...request } = options;
  const mutation = !['GET', 'HEAD'].includes((request.method || 'GET').toUpperCase());
  const headers = new Headers(request.headers);
  if (request.body && !(request.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    request.body = JSON.stringify(request.body);
  }
  if (mutation && state.session?.csrfToken) headers.set('X-CSRF-Token', state.session.csrfToken);
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('Délai de réponse dépassé. Réessaie dans un instant.');
      error.uncertain = mutation;
      reject(error); controller.abort();
    }, Math.min(120000, Math.max(1000, timeoutMs)));
  });
  try {
    return await Promise.race([deadline, (async () => {
      let response;
      try { response = await fetch(url, { ...request, headers, credentials: 'same-origin', signal: controller.signal }); }
      catch { const error = new Error('Connexion interrompue. Vérifie ton réseau puis réessaie.'); error.uncertain = mutation; throw error; }
      // Even a fetch implementation that completes after abort must not affect a later account.
      if (response.status === 401 && !controller.signal.aborted && isCurrent(ticket) && state.session?.user) clearAuth();
      if (response.status === 204) return null;
      let data;
      try { data = await response.json(); } catch {
        const error = new Error('Réponse du serveur indisponible. Réessaie dans un instant.'); error.uncertain = mutation; throw error;
      }
      if (!response.ok) {
        const error = new Error(data.error || 'La demande a échoué.');
        error.status = response.status;
        // A server/proxy error may happen after acceptance. Reuse the operation id on retry.
        error.uncertain = response.status >= 500;
        throw error;
      }
      return data;
    })()]);
  } finally { clearTimeout(timer); }
}
async function action(button, fn) {
  const epoch = state.epoch;
  const old = button.disabled;
  button.disabled = true;
  try { await fn(); } catch (error) { if (epoch === state.epoch) notify(error.message, true); }
  finally { button.disabled = old; updateGenerate(); }
}
function renderSession() {
  const session = state.session;
  const user = session?.user;
  $('loading').hidden = true;
  $('auth-view').hidden = Boolean(user);
  $('studio-view').hidden = !user;
  $('account').hidden = !user;
  if (!user) { state.budgetUserId = null; return; }
  const available = user.credits - user.reservedCredits;
  if (state.budgetUserId !== user.id) {
    $('generation-budget').value = String(Math.max(1, Math.min(50, generationMax(), available)));
    state.budgetUserId = user.id;
  }
  $('account-name').textContent = user.name;
  $('credit-balance').textContent = format.format(available);
  $('credit-reserved').textContent = user.reservedCredits ? `${format.format(user.reservedCredits)} crédit(s) réservé(s)` : 'Aucun crédit réservé';
  $('ai-model').textContent = `Aider · ${session.aiModel || 'anthropic/claude-sonnet-4-6'}`;
  $('credit-conversion').textContent = `1 crédit plateforme = ${usd(creditMicroUsd())} de coût estimé par Aider, pas une facture fournisseur exacte. Ce ne sont pas des tokens : une demande ne coûte pas forcément un crédit. Estimation IA en USD, abonnements et packs facturés en EUR ; il ne s’agit pas d’un taux de change.`;
  $('generation-disabled').hidden = session.generationEnabled;
  $('billing-disabled').hidden = session.billingEnabled;
  renderStorage(); updateGenerate();
}
function updateGenerate() {
  const session = state.session;
  const active = state.jobs.some(job => ['queued', 'running'].includes(job.status));
  const project = state.projects.find(p => p.id === state.selected);
  const budget = chosenBudget();
  const available = session?.user ? session.user.credits - session.user.reservedCredits : 0;
  $('generation-budget').max = String(generationMax());
  $('generation-budget').setAttribute('aria-invalid', String(budget === null));
  $('generation-price').textContent = `1 crédit = ${usd(creditMicroUsd())} de coût estimé par Aider. ${budget === null ? 'Choisis un budget entier valide.' : `Plafond de débit réservé : ${format.format(budget)} crédit(s), soit ${usd(budget * creditMicroUsd())}.`} Maximum : ${format.format(generationMax())} · disponibles : ${format.format(available)}.${budget !== null && available < budget ? ' Solde insuffisant pour ce plafond.' : ''} Ce plafond limite les crédits débitables, pas les dépenses du fournisseur.`;
  $('generate').disabled = state.busy || !session?.user || !session.generationEnabled || !project || project.status !== 'ready' || active ||
    budget === null || available < budget;
  $('generate').textContent = state.busy ? 'Envoi en cours…' : active ? 'Génération en cours…' : 'Créer avec l’IA ↗';
}
function setAuthMode(registering) {
  state.registering = registering;
  $('name-field').hidden = !registering; $('name').required = registering;
  $('password-help').hidden = !registering;
  $('password').minLength = registering ? 12 : 1;
  $('password').autocomplete = registering ? 'new-password' : 'current-password';
  $('login-tab').setAttribute('aria-pressed', String(!registering));
  $('register-tab').setAttribute('aria-pressed', String(registering));
  $('auth-title').textContent = registering ? 'Ton prochain jeu t’attend.' : 'Content de te revoir.';
  $('auth-submit').textContent = registering ? 'Créer mon studio ↗' : 'Entrer dans le studio ↗';
  $('auth-error').textContent = '';
}
function renderProjects() {
  renderStorage();
  $('project-count').textContent = state.projects.length;
  $('project-list').replaceChildren();
  if (!state.projects.length) $('project-list').append(el('div', 'empty', 'Ton premier univers t’attend. Crée un projet pour commencer.'));
  for (const project of state.projects) {
    const card = el('button', 'project-card' + (project.id === state.selected ? ' selected' : ''));
    card.type = 'button'; card.setAttribute('aria-pressed', String(project.id === state.selected));
    card.append(el('span', 'project-icon', '▧'), el('span', 'project-arrow', '↗'), el('h3', '', project.name),
      el('p', '', project.status === 'ready' ? `Créé le ${date(project.createdAt)}` : project.status === 'failed' ? 'Copie du moteur échouée' : 'Préparation du moteur…'));
    card.addEventListener('click', () => selectProject(project.id).catch(error => notify(error.message, true)));
    $('project-list').append(card);
  }
}
async function loadProjects() {
  const ticket = readTicket();
  const data = await api('/api/projects');
  if (!isCurrent(ticket)) return;
  state.projects = data.projects; renderProjects();
}
async function selectProject(id) {
  state.selection++; state.selected = id; state.jobs = []; state.busy = false; state.pendingRequest = null;
  $('prompt').value = ''; $('workbench').hidden = false;
  $('selected-project').textContent = state.projects.find(p => p.id === id)?.name || '';
  $('job-list').replaceChildren(el('p', 'hint', 'Chargement…'));
  $('asset-list').replaceChildren(el('p', 'hint', 'Chargement…'));
  renderProjects(); updateGenerate();
  startEvents();
  await Promise.all([loadJobs(id), loadAssets(id)]);
}
function renderJobs() {
  $('job-list').replaceChildren();
  if (!state.jobs.length) $('job-list').append(el('p', 'hint', 'Décris ta première idée au copilote pour commencer.'));
  for (const job of state.jobs) {
    const item = el('article', 'job');
    const meta = el('div', 'job-meta');
    meta.append(el('span', 'job-status ' + job.status, statuses[job.status] || job.status));
    if (job.status === 'running' && Object.hasOwn(phases, job.phase)) meta.append(el('span', '', phases[job.phase]));
    meta.append(el('span', '', date(job.createdAt)));
    const reserved = job.reservedCost ?? job.cost;
    const charged = job.chargedCredits ?? (job.status === 'succeeded' ? job.cost : 0);
    const accounting = job.status === 'succeeded' ? `${format.format(charged)} crédit(s) débité(s) · plafond ${format.format(reserved)} · ${format.format(Math.max(0, reserved - charged))} libéré(s)` :
      job.status === 'failed' ? `0 crédit débité · ${format.format(reserved)} crédit(s) libéré(s) (échec ou aucun changement publié)` : `${format.format(reserved)} crédit(s) réservé(s) · débit réel en attente`;
    item.append(meta, el('p', '', job.prompt));
    item.append(el('p', 'hint', accounting));
    const aider = job.costSource === 'aider';
    // A zero default without an Aider usage record is not a reported estimate.
    const hasCost = Number.isSafeInteger(job.providerCostMicroUsd) && job.providerCostMicroUsd >= 0 &&
      (!aider || job.providerCostMicroUsd > 0 || job.usage);
    if (hasCost) {
      item.append(el('p', 'hint', `${aider ? 'Coût estimé par Aider' : 'Usage OpenAI historique'} : ${usd(job.providerCostMicroUsd)}${job.status === 'failed' ? ' · non facturé au client' : ''}`));
    } else if (aider) item.append(el('p', 'hint', 'Coût estimé par Aider : indisponible'));
    if (!aider && job.usage) {
      const usage = job.usage;
      item.append(el('p', 'hint', `Tokens — entrée : ${format.format(usage.inputTokens ?? 0)} · entrée en cache : ${format.format(usage.cachedInputTokens ?? 0)} · écriture du cache : ${format.format(usage.cacheWriteInputTokens ?? 0)} · sortie : ${format.format(usage.outputTokens ?? 0)} · raisonnement : ${format.format(usage.reasoningTokens ?? 0)} · requêtes : ${format.format(usage.requests ?? 0)}`));
    }
    if (job.error) item.append(el('p', 'error', job.error));
    $('job-list').append(item);
  }
  updateGenerate();
}
async function loadJobs(id = state.selected) {
  if (!id) return;
  const ticket = readTicket();
  const data = await api(`/api/projects/${id}/generations`);
  if (state.selected !== id || !isCurrent(ticket)) return;
  state.jobs = data.jobs; renderJobs();
}
async function loadAssets(id = state.selected) {
  if (!id) return;
  const ticket = readTicket();
  const data = await api(`/api/projects/${id}/assets`);
  // Assets are not in snapshots, but still belong to this account and selection.
  if (state.selected !== id || !isCurrent(ticket, false)) return;
  $('asset-list').replaceChildren();
  if (!data.files.length) $('asset-list').append(el('p', 'hint', 'Aucun asset ajouté pour le moment.'));
  for (const file of data.files) {
    const row = el('div', 'asset');
    const link = el('a', '', `${file.folder ? file.folder + '/' : ''}${file.filename} ↓`);
    // Construct a local URL from opaque ids rather than trusting returned URL schemes.
    link.href = `/api/projects/${encodeURIComponent(id)}/assets/${encodeURIComponent(file.id)}/download`;
    link.download = file.filename;
    row.append(link, el('small', '', `${format.format(Math.ceil(file.size / 1024))} Ko`));
    $('asset-list').append(row);
  }
}
async function refreshSession() {
  const ticket = readTicket();
  const data = await api('/api/session');
  if (!isCurrent(ticket)) return;
  const changedAccount = state.session?.user && state.session.user.id !== data.user?.id;
  if (changedAccount) clearAuth();
  state.session = data; renderSession();
  if (changedAccount && data.user) await enterStudio();
}
function stopEvents() {
  state.streamVersion++;
  clearTimeout(state.reconnectTimer); clearTimeout(state.heartbeatTimer);
  state.reconnectTimer = null; state.heartbeatTimer = null;
  state.stream?.close(); state.stream = null;
}
function clearAuth() {
  stopEvents(); state.epoch++; state.selection++; state.revision++;
  state.session = null; state.projects = []; state.selected = null; state.jobs = []; state.busy = false;
  state.pendingRequest = null; state.purchaseRequests.clear(); state.reconnectAttempt = 0;
  $('workbench').hidden = true; $('prompt').value = ''; $('asset-file').value = ''; connectionStatus.textContent = '';
  for (const id of ['asset-list', 'ledger', 'plan-list', 'credit-pack-list']) $(id).replaceChildren();
  for (const id of ['account-name', 'credit-balance', 'credit-reserved', 'wallet-available', 'wallet-reserved', 'subscription-status', 'selected-project']) $(id).textContent = '';
  renderSession(); renderProjects(); renderJobs();
}
const wantsEvents = () => Boolean(state.session?.user && !document.hidden && state.pageActive);
function reconnectEvents(message) {
  stopEvents();
  if (!wantsEvents()) return;
  connectionStatus.textContent = message;
  const version = state.streamVersion;
  const delay = Math.min(30000, 3000 * 2 ** Math.min(state.reconnectAttempt++, 4));
  state.reconnectTimer = setTimeout(async () => {
    state.reconnectTimer = null;
    if (version !== state.streamVersion || !wantsEvents()) return;
    try {
      // Recovery is read-only. Never replay a generation, upload or checkout.
      await refreshSession();
      if (version === state.streamVersion && wantsEvents()) startEvents();
    } catch (error) {
      if (version === state.streamVersion && wantsEvents()) reconnectEvents(`Connexion indisponible : ${error.message}`);
    }
  }, delay);
}
function startEvents() {
  stopEvents();
  if (!wantsEvents()) return;
  if (typeof EventSource !== 'function') {
    connectionStatus.textContent = 'Mises à jour en direct indisponibles : ce navigateur ne prend pas en charge EventSource. Utilise un navigateur compatible.';
    return;
  }
  const version = state.streamVersion;
  const epoch = state.epoch;
  const userId = state.session.user.id;
  const projectId = state.selected;
  let source;
  try { source = new EventSource('/api/events' + (projectId === null ? '' : `?projectId=${encodeURIComponent(projectId)}`), { withCredentials: true }); }
  catch { reconnectEvents('Impossible de connecter les mises à jour en direct. Nouvelle tentative…'); return; }
  state.stream = source;
  const current = () => version === state.streamVersion && epoch === state.epoch && state.stream === source && wantsEvents();
  const heartbeat = () => {
    clearTimeout(state.heartbeatTimer);
    state.heartbeatTimer = setTimeout(() => {
      if (current()) reconnectEvents('Connexion sans réponse. Reconnexion…');
    }, 45000);
  };
  connectionStatus.textContent = 'Connexion aux mises à jour en direct…'; heartbeat();
  source.addEventListener('open', () => { if (current()) { connectionStatus.textContent = 'Synchronisation en cours…'; heartbeat(); } });
  source.addEventListener('ping', () => { if (current()) heartbeat(); });
  source.addEventListener('snapshot', event => {
    if (!current()) return;
    let data;
    try {
      data = JSON.parse(event.data);
      if (!data?.user || typeof data.user.id !== 'string' || !Array.isArray(data.projects) || !Array.isArray(data.jobs) ||
          !data.wallet || !Array.isArray(data.wallet.entries) || !data.storage || typeof data.generationEnabled !== 'boolean' ||
          [...data.projects, ...data.jobs, ...data.wallet.entries].some(item => !item || typeof item !== 'object')) throw new Error('snapshot');
    } catch { reconnectEvents('Mise à jour du serveur invalide. Reconnexion…'); return; }
    if (data.user.id !== userId) { clearAuth(); notify('Le compte connecté a changé. Reconnecte-toi.', true); return; }
    if (data.projectId !== projectId) return;
    state.revision++;
    // Settings and CSRF are deliberately absent from the protocol; keep the /api/session values.
    state.session = { ...state.session, user: data.user, storage: data.storage, generationEnabled: data.generationEnabled };
    state.projects = data.projects; state.jobs = data.jobs;
    renderSession(); renderProjects(); renderJobs(); renderWallet(data.wallet);
    $('selected-project').textContent = state.projects.find(project => project.id === state.selected)?.name || '';
    state.reconnectAttempt = 0; connectionStatus.textContent = 'Mises à jour en direct connectées'; heartbeat();
  });
  source.addEventListener('session-expired', () => {
    if (current()) { clearAuth(); notify('Ta session a expiré. Reconnecte-toi.', true); }
  });
  source.addEventListener('server-shutdown', () => { if (current()) reconnectEvents('Serveur en redémarrage. Reconnexion…'); });
  source.addEventListener('error', () => {
    if (!current()) return;
    if (source.readyState === EventSource.CLOSED) reconnectEvents('Connexion fermée. Vérification de la session…');
    else connectionStatus.textContent = 'Connexion interrompue. Reconnexion automatique…';
    // CONNECTING uses native EventSource retry:3000; the watchdog bounds silent stalls.
  });
}
function showView(view) {
  state.view = view;
  $('projects-view').hidden = view !== 'projects'; $('billing-view').hidden = view !== 'billing';
  $('projects-tab').classList.toggle('active', view === 'projects');
  $('billing-tab').classList.toggle('active', view === 'billing');
  if (view === 'billing') loadBilling().catch(error => notify(error.message, true));
}
async function loadWallet() {
  const ticket = readTicket();
  const wallet = await api('/api/wallet');
  if (!isCurrent(ticket)) return;
  renderWallet(wallet);
}
function renderWallet(wallet) {
  $('wallet-available').textContent = format.format(wallet.available);
  $('wallet-reserved').textContent = format.format(wallet.reserved);
  $('ledger').replaceChildren();
  for (const entry of wallet.entries) {
    const row = el('tr');
    const amount = entry.amount ? (entry.amount > 0 ? '+' : '') + format.format(entry.amount) : '—';
    row.append(el('td', '', date(entry.createdAt)), el('td', '', entry.description), el('td', entry.amount > 0 ? 'positive' : '', amount));
    $('ledger').append(row);
  }
  if (!wallet.entries.length) { const row = el('tr'); const cell = el('td', '', 'Aucune opération pour le moment.'); cell.colSpan = 3; row.append(cell); $('ledger').append(row); }
}
function lemonRedirect(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('Adresse de paiement non autorisée.'); }
  // Check the raw authority too: URL normalizes an explicit :443 away.
  const authority = typeof value === 'string' && /^https:\/\/([a-z0-9-]+\.lemonsqueezy\.com)(?:[/?#]|$)/i.test(value);
  if (!authority || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port ||
      !/^[a-z0-9-]+\.lemonsqueezy\.com$/.test(parsed.hostname)) throw new Error('Adresse de paiement non autorisée.');
  // Hosted checkout (/checkout/...) and signed customer portal (/billing/...) URLs
  // may carry provider query parameters. Never use an external URL as a fallback.
  location.assign(parsed.href);
}
function priceLabel(offer, suffix) {
  const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const configured = offer.currency?.toLowerCase() === 'eur' && Number.isSafeInteger(offer.amount) && offer.amount >= 0;
  const price = el('p', 'plan-price', configured ? money.format(offer.amount / 100) : 'Tarif à confirmer');
  price.append(el('small', '', suffix));
  return price;
}
async function checkout(kind, offerId) {
  if (!state.session?.billingEnabled) throw new Error('Les paiements ne sont pas encore configurés.');
  const epoch = state.epoch;
  const key = `${kind}:${offerId}`;
  if (!state.purchaseRequests.has(key)) state.purchaseRequests.set(key, crypto.randomUUID());
  // Keep the id across refreshes, network errors and 409 review responses.
  // Retrying is manual only; a review must never start a new checkout POST loop.
  const result = await api(kind === 'pack' ? '/api/billing/credit-checkout' : '/api/billing/checkout', { method: 'POST',
    body: { [kind === 'pack' ? 'packId' : 'planId']: offerId, requestId: state.purchaseRequests.get(key) } });
  if (epoch !== state.epoch) return;
  if (result.url) { lemonRedirect(result.url); return; }
  if (result.status === 'paid') {
    state.purchaseRequests.delete(key);
    notify('Cet achat a déjà été crédité. Ton solde est à jour.');
  } else if (result.status === 'review') {
    notify('Ce paiement Lemon Squeezy nécessite une vérification. Aucun nouveau paiement ne sera lancé automatiquement.', true);
  } else notify('Paiement Lemon Squeezy en attente de confirmation ; les crédits seront ajoutés après validation.');
  await Promise.all([refreshSession(), loadWallet()]);
}
function buyCredits(packId) { return checkout('pack', packId); }
async function loadBilling() {
  const epoch = state.epoch;
  const [, plans, subscription, creditPacks] = await Promise.all([
    loadWallet(), api('/api/billing/plans'), api('/api/billing/subscription'), api('/api/billing/credit-packs')]);
  if (epoch !== state.epoch) return;
  const sub = subscription.subscription;
  const active = sub && (!['canceled', 'incomplete_expired'].includes(sub.status) ||
    (sub.status === 'canceled' && sub.currentPeriodEnd * 1000 > Date.now()));
  const statusNames = { active: 'Actif', past_due: 'Paiement en retard', unpaid: 'Paiement à régulariser', incomplete: 'Paiement en attente', canceled: 'Résilié', incomplete_expired: 'Paiement expiré', paused: 'En pause', trialing: 'Période d’essai' };
  $('subscription-status').textContent = sub ? `${statusNames[sub.status] || sub.status}${(sub.cancelAtPeriodEnd || sub.status === 'canceled') && sub.currentPeriodEnd ? ' — période payée jusqu’au ' + date(sub.currentPeriodEnd * 1000) : ''}` : 'Aucun abonnement actif.';
  $('manage-subscription').hidden = !sub;
  $('plan-list').replaceChildren();
  for (const plan of plans.plans) {
    const card = el('article', 'plan');
    const price = priceLabel(plan, ' / mois');
    const button = el('button', 'primary full', active ? sub.planId === plan.id ? 'Abonnement actuel' : 'Un abonnement est déjà actif' : 'Choisir cet abonnement ↗');
    button.type = 'button'; button.disabled = Boolean(active) || !state.session?.billingEnabled;
    button.addEventListener('click', () => action(button, () => checkout('plan', plan.id)));
    card.append(el('h3', '', plan.name), price, el('p', '', `${format.format(plan.credits)} crédits à chaque échéance payée`),
      el('p', 'hint', `${format.format(plan.maxProjects)} projets maximum · ${bytesLabel(plan.assetQuotaBytes)} de stockage global partagé, pas par projet.`), button);
    $('plan-list').append(card);
  }
  $('credit-pack-list').replaceChildren();
  if (!creditPacks.packs.length) $('credit-pack-list').append(el('p', 'hint', 'Les packs de crédits ne sont pas encore configurés.'));
  for (const pack of creditPacks.packs) {
    const card = el('article', 'plan');
    const button = el('button', 'primary full', 'Acheter des crédits ↗');
    button.type = 'button'; button.disabled = !state.session?.billingEnabled;
    button.addEventListener('click', () => action(button, () => buyCredits(pack.id)));
    card.append(el('h3', '', pack.name), priceLabel(pack, ' · une seule fois'),
      el('p', '', `${format.format(pack.credits)} crédits supplémentaires`),
      el('p', 'hint', 'Sans abonnement requis. Aucun espace disque supplémentaire.'), button);
    $('credit-pack-list').append(card);
  }
}
$('login-tab').addEventListener('click', () => setAuthMode(false));
$('register-tab').addEventListener('click', () => setAuthMode(true));
$('auth-form').addEventListener('submit', async event => {
  event.preventDefault(); $('auth-submit').disabled = true; $('auth-error').textContent = '';
  clearAuth(); const epoch = state.epoch;
  try {
    // Serialize cookie-changing requests: a late logout Set-Cookie must not
    // clear the cookie issued by a newer login/register response.
    await state.logoutPending;
    if (epoch !== state.epoch) return;
    const session = await api('/api/auth/' + (state.registering ? 'register' : 'login'), { method: 'POST',
      body: { name: $('name').value, email: $('email').value, password: $('password').value } });
    if (epoch !== state.epoch) return;
    state.session = session; $('password').value = ''; notify(''); renderSession(); await enterStudio();
  } catch (error) { if (epoch === state.epoch) $('auth-error').textContent = error.message; }
  finally { $('auth-submit').disabled = false; }
});
$('logout').addEventListener('click', () => action($('logout'), async () => {
  if (state.logoutPending) return;
  const logout = api('/api/auth/logout', { method: 'POST' });
  const barrier = logout.then(() => {}, () => {});
  state.logoutPending = barrier;
  // Close immediately, even if the logout response is slow or lost. A new login
  // waits for this bounded request to finish or abort before sending credentials.
  clearAuth(); notify('');
  const epoch = state.epoch;
  try { await logout; }
  catch (error) { if (epoch === state.epoch) notify(`Déconnexion serveur non confirmée : ${error.message}`, true); }
  finally { if (state.logoutPending === barrier) state.logoutPending = null; }
}));
$('new-project').addEventListener('click', () => { $('create-form').hidden = false; $('project-name').focus(); });
$('cancel-create').addEventListener('click', () => { $('create-form').hidden = true; });
$('create-form').addEventListener('submit', event => {
  event.preventDefault();
  action(event.submitter, async () => {
    const ticket = readTicket();
    notify('Préparation du projet : copie du moteur et des assets…');
    const { project } = await api('/api/projects', { method: 'POST', timeoutMs: 120000, body: { name: $('project-name').value } });
    if (!isCurrent(ticket, false)) return;
    $('create-form').reset(); $('create-form').hidden = true; await Promise.all([loadProjects(), refreshSession()]);
    if (!isCurrent(ticket, false)) return;
    await selectProject(project.id);
    if (ticket.epoch === state.epoch && state.selected === project.id) notify('Ton nouveau projet est prêt. À toi de jouer.');
  });
});
$('generation-budget').addEventListener('input', updateGenerate);
$('prompt-form').addEventListener('submit', async event => {
  event.preventDefault(); if (state.busy || !state.selected) return;
  updateGenerate();
  if ($('generate').disabled) { notify('Vérifie le plafond choisi, ton solde disponible et la disponibilité du projet.', true); return; }
  const project = state.selected; const prompt = $('prompt').value.trim(); if (!prompt) return;
  const budgetCredits = chosenBudget();
  if (!state.pendingRequest || state.pendingRequest.project !== project || state.pendingRequest.prompt !== prompt || state.pendingRequest.budgetCredits !== budgetCredits) {
    state.pendingRequest = { project, prompt, budgetCredits, requestId: crypto.randomUUID() };
  }
  const ticket = readTicket();
  state.busy = true; updateGenerate();
  try {
    await api(`/api/projects/${project}/generations`, { method: 'POST', body: { prompt, budgetCredits, requestId: state.pendingRequest.requestId } });
    if (!isCurrent(ticket, false)) return;
    state.pendingRequest = null; $('prompt').value = '';
    notify('Demande reçue. Ton budget est réservé ; le coût estimé par Aider en USD sera converti en crédits, arrondi au crédit supérieur, et débité après publication réussie. Le reste sera libéré. Échec, aucun changement publié, estimation manquante ou budget dépassé : aucun débit.');
    await Promise.all([loadJobs(project), refreshSession()]);
  } catch (error) {
    if (!isCurrent(ticket, false)) return;
    if (!error.uncertain) state.pendingRequest = null;
    notify(error.message + (error.uncertain ? ' Une nouvelle tentative réutilisera la même demande pour éviter un double débit.' : ''), true);
  } finally { if (isCurrent(ticket, false)) { state.busy = false; updateGenerate(); } }
});
$('upload-form').addEventListener('submit', event => {
  event.preventDefault(); const project = state.selected; if (!project) return;
  action(event.submitter, async () => {
    const ticket = readTicket();
    const data = new FormData(); data.append('folder', $('asset-folder').value.trim()); data.append('file', $('asset-file').files[0]);
    await api(`/api/projects/${project}/assets`, { method: 'POST', timeoutMs: 120000, body: data });
    if (!isCurrent(ticket, false)) return;
    $('asset-file').value = '';
    await Promise.all([loadAssets(project), refreshSession()]);
    if (isCurrent(ticket, false)) notify('Asset ajouté à ton projet.');
  });
});
$('projects-tab').addEventListener('click', () => showView('projects'));
$('billing-tab').addEventListener('click', () => showView('billing'));
$('recharge').addEventListener('click', () => showView('billing'));
$('manage-subscription').addEventListener('click', () => action($('manage-subscription'), async () => {
  const epoch = state.epoch;
  const result = await api('/api/billing/portal', { method: 'POST' });
  if (epoch === state.epoch) lemonRedirect(result.url);
}));
function suspendEvents() {
  // Do not discard the very first session response while bootstrap is pending;
  // without it a returning page cannot decide whether to reopen a stream.
  if (state.session) state.revision++;
  stopEvents();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) suspendEvents(); else startEvents(); });
window.addEventListener('pagehide', () => { state.pageActive = false; suspendEvents(); });
window.addEventListener('pageshow', () => { state.pageActive = true; startEvents(); });
async function enterStudio() {
  state.selection++; state.selected = null; state.jobs = []; state.purchaseRequests.clear(); $('workbench').hidden = true;
  const ticket = readTicket();
  startEvents();
  await loadProjects();
  if (!isCurrent(ticket, false)) return;
  const returned = new URLSearchParams(location.search).get('billing');
  showView(returned ? 'billing' : 'projects');
  if (['success', 'credits-success'].includes(returned)) notify('Retour de Lemon Squeezy : les crédits apparaîtront après confirmation du paiement. Aucun crédit n’est ajouté à partir de cette page.');
  if (['cancelled', 'credits-cancelled'].includes(returned)) notify('Paiement interrompu. Le solde reste basé uniquement sur les confirmations Lemon Squeezy.');
}
(async () => {
  const epoch = state.epoch;
  try { await refreshSession(); if (epoch === state.epoch && state.session?.user) await enterStudio(); }
  catch (error) { if (epoch === state.epoch) { $('loading').hidden = true; notify(error.message, true); } }
})();
