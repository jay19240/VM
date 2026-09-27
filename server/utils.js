const fs = require('node:fs');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
// -----------------------------------------------------------------------------------
const { COOKIE_NAME, MIN_PASSWORD_LENGTH, MAX_NAME_LENGTH, SESSION_MS } = require('./constants');
// -----------------------------------------------------------------------------------

module.exports.PASSWORD_HASH = async (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const cost = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
  const hash = await scrypt(password, salt, 64, cost);
  return `${salt}:${hash.toString('hex')}`;
};

module.exports.VERIFY_PASSWORD = async (password, stored) => {
  // 1. Si 'stored' est invalide ou mal formaté, on extrait un sel fictif pour exécuter scrypt
  // afin de simuler le temps de calcul (évite les attaques temporelles sur l'existence de l'utilisateur)
  const isValidFormat = typeof stored === 'string' && stored.includes(':');
  const [salt, originalHashHex] = isValidFormat ? stored.split(':') : [crypto.randomBytes(16).toString('hex'), ''];

  // 2. On calcule le hash du mot de passe fourni avec le sel trouvé (ou fictif)
  const cost = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
  const computedHash = await scrypt(password, salt, 64, cost);

  // 3. On prépare le hash de comparaison (si stocké est invalide, on génère un faux hash de même taille)
  const targetHashHex = originalHashHex.length === 128 ? originalHashHex : crypto.randomBytes(64).toString('hex');

  // 4. Les deux buffers font maintenant obligatoirement 64 octets. On compare de manière sûre.
  const match = crypto.timingSafeEqual(computedHash, Buffer.from(targetHashHex, 'hex'));

  // On ne valide que si le hash correspond ET que le format d'origine était correct
  return isValidFormat && match;
};

module.exports.DIGEST = (value) => {
  return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports.CREDENTIALS = (body, registering) => {
  if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') {
    throw new HttpError(400, 'Adresse e-mail et mot de passe requis.');
  }

  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Adresse e-mail invalide.');
  }

  if (Buffer.byteLength(body.password) > 128 || body.password.length < (registering ? MIN_PASSWORD_LENGTH : 1)) {
    throw new HttpError(400, `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (registering && (!name || name.length > MAX_NAME_LENGTH)) {
    throw new HttpError(400, `Indique un nom de 1 à ${MAX_NAME_LENGTH} caractères.`);
  }

  return { email, password: body.password, name };
}

module.exports.COOKIE_TOKEN = (req) => {
  const value = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}

module.exports.CHECK_PATH = async (root, relative, { directory = false, create = false } = {}) => {
  const segments = relative ? relative.split('/') : [];
  if (segments.some(s => !s || s === '.' || s === '..' || s.startsWith('.') || /[\\\x00-\x1f\x7f:]/.test(s) || s.length > 100) || relative.length > 400) {
    throw new HttpError(400, 'Chemin de fichier invalide.');
  }

  const base = await fs.lstat(root);
  if (!base.isDirectory() || base.isSymbolicLink()) throw new HttpError(400, 'Répertoire non autorisé.');
  let current = root;
  for (let i = 0; i < segments.length; i++) {
    current = path.join(current, segments[i]);
    const wantsDir = directory || i < segments.length - 1;
    if (create && wantsDir) await fs.mkdir(current, { mode: 0o755 }).catch(e => { if (e.code !== 'EEXIST') throw e; });
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || (wantsDir ? !stat.isDirectory() : !stat.isFile())) throw new HttpError(400, 'Chemin de fichier non autorisé.');
    } catch (error) {
      if (error.code !== 'ENOENT' || wantsDir) throw error;
    }
  }
  return current;
}

module.exports.FILE_EXISTS = async (filename) => {
  try {
    await fs.lstat(filename);
    return true;
  }
  catch (e) {
    if (e.code === 'ENOENT') {
      return false;
    }

    throw e;
  }
}