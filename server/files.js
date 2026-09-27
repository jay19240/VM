const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
// -----------------------------------------------------------------------------------
const { HttpError } = require('./errors');
const { timestamp } = require('./store');
const { UUID } = require('./constants');
const { CHECK_PATH, FILE_EXISTS } = require('./utils');
// -----------------------------------------------------------------------------------


function projectRoot(config, userId, projectId) {
  if (!UUID.test(userId) || !UUID.test(projectId)) throw new HttpError(404, 'Projet introuvable.');
  return path.join(config.dataDir, 'users', userId, projectId);
}

async function COPY_ENGINE(source, destination) {
  // The template is never written. Exclude dependencies/builds and private tool/auth configuration.
  await fs.cp(source, destination, { recursive: true, force: false, errorOnExist: true,
    filter: async filename => {
      const relative = path.relative(source, filename);
      if (relative.split(path.sep).some(part => ['node_modules', 'dist', 'target', 'coverage'].includes(part) ||
          (part.startsWith('.') && part !== '.gitignore' && part !== '.augmentignore'))) return false;
      const stat = await fs.lstat(filename);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new HttpError(500, 'Le modèle du moteur contient un fichier non autorisé.');
      return true;
    } });
}

function createProjects({ store, config, entitlements = () => null }) {
  const queues = new Map();
  async function exclusive(id, fn) {
    const previous = queues.get(id) || Promise.resolve();
    const result = previous.then(fn);
    const tail = result.catch(() => {});
    queues.set(id, tail);
    try { return await result; } finally { if (queues.get(id) === tail) queues.delete(id); }
  }
  function storage(userId) {
    const plan = entitlements(userId);
    return { usedBytes: store.get(`SELECT coalesce(sum(a.size),0) AS n FROM assets a
      JOIN projects p ON p.id=a.project_id WHERE p.user_id=?`, userId).n,
      limitBytes: plan?.assetQuotaBytes ?? config.maxUserAssetBytes,
      maxProjects: plan?.maxProjects ?? config.maxProjects };
  }

  function assertOwnProject(userId, id) {
    const row = store.get('SELECT * FROM projects WHERE id = ? AND user_id = ?', id, userId);
    if (!row) throw new HttpError(404, 'Projet introuvable.');
    return row;
  }

  function getByUserID(userId) {
    return store.all('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC', userId);
  }

  async function create(userId, name) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) throw new HttpError(400, 'Le nom du projet doit contenir de 1 à 80 caractères.');
    const id = randomUUID();
    store.transaction(() => {
      const count = store.get("SELECT count(*) AS n FROM projects WHERE user_id = ? AND status != 'failed'", userId).n;
      if (count >= storage(userId).maxProjects) throw new HttpError(409, 'Nombre maximum de projets atteint pour ton offre.');
      store.run('INSERT INTO projects VALUES (?,?,?,?,?,?)', id, userId, name.trim(), 'provisioning', timestamp(), timestamp());
    });
    const root = projectRoot(config, userId, id);
    try {
      await fs.mkdir(root, { recursive: true, mode: 0o700 });
      await COPY_ENGINE(config.engineDir, path.join(root, 'engine'));
      await fs.mkdir(path.join(root, 'engine/public/game'), { recursive: true, mode: 0o755 });
      const game = await fs.lstat(path.join(root, 'engine/src/game'));
      if (!game.isDirectory() || game.isSymbolicLink()) throw new Error('Invalid game template');
      store.run("UPDATE projects SET status = 'ready', updated_at = ? WHERE id = ?", timestamp(), id);
      return assertOwnProject(userId, id);
    } catch {
      store.run("UPDATE projects SET status = 'failed' WHERE id = ?", id);
      throw new HttpError(500, 'La copie du moteur a échoué. Le projet est conservé pour diagnostic.');
    }
  }
  function listAssets(projectId) {
    return store.all('SELECT * FROM assets WHERE project_id = ? ORDER BY created_at DESC', projectId).map(assetView);
  }
  function assetView(row) {
    return { id: row.id, filename: row.filename, folder: row.folder, size: row.size, createdAt: row.created_at,
      downloadUrl: `/api/projects/${row.project_id}/assets/${row.id}/download` };
  }
  async function upload(userId, projectId, file, folder = '') {
    if (!file || !file.size) throw new HttpError(400, 'Choisis un fichier non vide.');
    if (typeof folder !== 'string' || typeof file.originalname !== 'string' || file.originalname.includes('/') || file.originalname.includes('\\')) {
      throw new HttpError(400, 'Nom de fichier ou dossier invalide.');
    }
    // Serialize uploads across every project of one owner as well as against that project's generation.
    return exclusive(`assets:${userId}`, () => exclusive(projectId, async () => {
      const project = assertOwnProject(userId, projectId);
      if (project.status !== 'ready') throw new HttpError(409, 'Le projet n’est pas prêt.');
      if (store.get("SELECT id FROM jobs WHERE project_id = ? AND status IN ('queued','running','publishing')", projectId)) throw new HttpError(409, 'Attends la fin de la génération avant de modifier les assets.');
      const root = path.join(projectRoot(config, userId, projectId), 'engine/public/game');
      await CHECK_PATH(root, folder, { directory: true, create: true });
      const relative = folder ? `${folder}/${file.originalname}` : file.originalname;
      const destination = await CHECK_PATH(root, relative);
      if (await FILE_EXISTS(destination)) throw new HttpError(409, 'Un fichier porte déjà ce nom. Renomme-le avant l’envoi.');
      const quota = storage(userId);
      if (quota.usedBytes + file.size > quota.limitBytes) throw new HttpError(413, 'Quota global d’assets de ton compte atteint.');
      let handle;
      try {
        handle = await fs.open(destination, 'wx', 0o644);
        await handle.writeFile(file.buffer);
        await handle.sync();
      } catch (error) {
        if (error.code === 'EEXIST') throw new HttpError(409, 'Un fichier porte déjà ce nom. Renomme-le avant l’envoi.');
        if (handle) { await handle.close(); handle = null; await fs.unlink(destination); }
        throw error;
      } finally { await handle?.close(); }
      const id = randomUUID();
      try {
        store.run('INSERT INTO assets VALUES (?,?,?,?,?,?)', id, projectId, file.originalname, folder, file.size, timestamp());
      } catch (error) {
        // Remove only the just-created unregistered upload, never existing assets.
        await fs.unlink(destination);
        throw error;
      }
      return assetView(store.get('SELECT * FROM assets WHERE id = ?', id));
    }));
  }

  async function download(userId, projectId, assetId) {
    assertOwnProject(userId, projectId);
    const row = store.get('SELECT * FROM assets WHERE id = ? AND project_id = ?', assetId, projectId);
    if (!row) throw new HttpError(404, 'Fichier introuvable.');
    const root = path.join(projectRoot(config, userId, projectId), 'engine/public/game');
    return { filename: row.filename, path: await CHECK_PATH(root, row.folder ? `${row.folder}/${row.filename}` : row.filename) };
  }

  return { create, assertOwnProject, getByUserID, listAssets, upload, download, exclusive, storage };
}




module.exports = { createProjects, projectRoot, UUID, CHECK_PATH, COPY_ENGINE, exists: FILE_EXISTS };
