'use strict';
const $ = id => document.getElementById(id);
const state = { config: null, projects: [], selected: '', selection: 0, ready: false, pending: '' };

function notify(message, error = false) {
  $('notice').textContent = message;
  $('notice').className = error ? 'notice error' : 'notice';
}

async function api(url, body) {
  let response;
  try {
    // No client deadline: a synchronous Aider generation may take ten minutes.
    response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      mode: 'same-origin',
      headers: body === undefined ? { Accept: 'application/json' } :
        { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error('Connexion interrompue. Rechargez la page pour vérifier l’état du projet avant de réessayer.');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`Réponse JSON illisible (HTTP ${response.status}). Rechargez la page pour vérifier l’état du projet.`); }
  if (!response.ok) {
    throw new Error(`${typeof data?.error === 'string' ? data.error : 'La demande a échoué.'} (HTTP ${response.status})`);
  }
  return data;
}

function updateControls() {
  const locked = !state.ready || Boolean(state.pending);
  const project = state.projects.find(item => item.id === state.selected);
  $('project-name').disabled = locked;
  $('create-project').disabled = locked;
  $('project-select').disabled = locked || !state.projects.length;
  $('prompt').disabled = locked || !project || !state.config?.generationEnabled || Boolean(project.generating);
  $('generate').disabled = $('prompt').disabled;
  $('generate').textContent = state.pending === 'generate' ? 'Génération en cours…' : 'Générer avec Aider';
  $('create-project').textContent = state.pending === 'create' ? 'Création en cours…' : 'Créer le projet';
}

function renderProjects() {
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = state.projects.length ? 'Sélectionnez un projet' : 'Aucun projet pour le moment';
  $('project-select').replaceChildren(placeholder);
  for (const project of state.projects) {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = project.name + (project.generating ? ' — génération en cours' : '');
    $('project-select').append(option);
  }
  $('project-select').value = state.selected;
}

async function selectProject(id) {
  const project = state.projects.find(item => item.id === id);
  state.selected = project?.id || '';
  // A counter also distinguishes A → B → A and invalidates stale errors.
  const selection = ++state.selection;
  $('project-select').value = state.selected;
  $('prompt').value = '';
  $('code').textContent = '';
  updateControls();
  if (!project) { notify('Sélectionnez un projet ou créez-en un nouveau.'); return; }
  notify('Chargement de main.js…');
  try {
    const { code } = await api(`/api/projects/${encodeURIComponent(project.id)}/code`);
    if (selection !== state.selection) return;
    $('code').textContent = code;
    notify(project.generating ? 'Une génération est déjà en cours pour ce projet. Le code disponible est affiché ; rechargez la page après sa fin.' :
      code ? 'main.js chargé. Décrivez la prochaine modification.' : 'main.js est vide. Décrivez votre première idée.');
  } catch (error) {
    if (selection === state.selection) notify(error.message, true);
  }
}

$('project-select').addEventListener('change', () => {
  if (!state.ready || state.pending) { $('project-select').value = state.selected; return; }
  return selectProject($('project-select').value);
});

$('create-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!state.ready || state.pending) return;
  const name = $('project-name').value.trim();
  if (!name) { notify('Donnez un nom à votre projet.', true); return; }
  state.pending = 'create';
  state.selection++;
  updateControls();
  notify('Création du projet…');
  try {
    const { project } = await api('/api/projects', { name });
    state.projects.push(project);
    renderProjects();
    $('project-name').value = '';
    await selectProject(project.id);
  } catch (error) { notify(error.message, true); }
  finally { state.pending = ''; updateControls(); }
});

$('prompt-form').addEventListener('submit', async event => {
  event.preventDefault();
  updateControls();
  if ($('generate').disabled) return;
  const prompt = $('prompt').value.trim();
  if (!prompt) { notify('Décrivez une modification avant de lancer Aider.', true); return; }
  const id = state.selected;
  state.pending = 'generate';
  // A code read started before this write must not replace the generated code.
  state.selection++;
  updateControls();
  notify('Génération en cours… Cela peut prendre jusqu’à 10 minutes. Gardez cette page ouverte.');
  try {
    const { project, code } = await api(`/api/projects/${encodeURIComponent(id)}/generate`, { prompt });
    state.projects = state.projects.map(item => item.id === id ? project : item);
    renderProjects();
    $('code').textContent = code;
    notify('Génération terminée. main.js est affiché ci-dessous, sans validation ni exécution.');
  } catch (error) { notify(error.message, true); }
  finally { state.pending = ''; updateControls(); }
});

(async () => {
  updateControls();
  try {
    const [config, data] = await Promise.all([api('/api/config'), api('/api/projects')]);
    state.config = config;
    state.projects = data.projects;
    $('ai-model').textContent = `Modèle Aider : ${config.model}`;
    $('generation-disabled').hidden = config.generationEnabled;
    renderProjects();
    state.ready = true;
    notify(state.projects.some(project => project.generating) ?
      'Une génération est déjà en cours. Sélectionnez son projet pour lire le code disponible ; rechargez la page après sa fin.' :
      state.projects.length ? 'Sélectionnez un projet ou créez-en un nouveau.' : 'Créez votre premier projet pour commencer.');
  } catch (error) { notify(`${error.message} Rechargez la page pour réessayer.`, true); }
  finally { updateControls(); }
})();
