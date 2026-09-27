const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function loadConfig(env = process.env) {
  // Local single-user POC only: reverse proxies and tunnels are not supported.
  if (env.HOST !== undefined && !['localhost', '127.0.0.1'].includes(env.HOST)) {
    throw new Error('Configuration invalide : HOST (localhost ou 127.0.0.1 uniquement)');
  }
  const dataDir = path.resolve(env.DATA_DIR || path.join(root, 'data', 'poc'));
  const actualDataDir = canonicalPath(dataDir);
  if (contains(dataDir, root) || contains(actualDataDir, canonicalPath(root))) {
    throw new Error('Configuration invalide : DATA_DIR');
  }
  for (const directory of ['engine', 'web', 'server', 'src', 'test', 'scripts', '.git', 'node_modules']) {
    const protectedDir = path.join(root, directory);
    if (contains(protectedDir, dataDir) || contains(canonicalPath(protectedDir), actualDataDir)) {
      throw new Error('Configuration invalide : DATA_DIR');
    }
  }
  const aiderModel = env.AIDER_MODEL || 'anthropic/claude-sonnet-4-6';
  if (!/^(anthropic|openai)\/[A-Za-z0-9_.-]{1,100}$/.test(aiderModel)) {
    throw new Error('Configuration invalide : AIDER_MODEL');
  }
  const aiderImage = env.AIDER_DOCKER_IMAGE || 'paulgauthier/aider:v0.86.2';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_./:@-]{1,200}$/.test(aiderImage)) {
    throw new Error('Configuration invalide : AIDER_DOCKER_IMAGE');
  }

  return {
    root,
    engineDir: path.join(root, 'engine'),
    dataDir,
    host: '127.0.0.1',
    port: integer(env, 'PORT', 3000, 1, 65535),
    aiderModel,
    aiderImage,
    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
    openaiApiKey: env.OPENAI_API_KEY || '',
    aiderTimeoutMs: integer(env, 'AIDER_TIMEOUT_SECONDS', 600, 1, 1800) * 1000
  };
}

module.exports = { loadConfig };

function contains(directory, filename) {
  const relative = path.relative(directory, filename);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function canonicalPath(filename) {
  try { return fs.realpathSync(filename); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Configuration invalide : DATA_DIR');
    // Do not resolve through dangling symlinks as if they were ordinary missing directories.
    try {
      if (fs.lstatSync(filename).isSymbolicLink()) throw new Error('Configuration invalide : DATA_DIR');
    } catch (statError) { if (statError.code !== 'ENOENT') throw statError; }
    const parent = path.dirname(filename);
    if (parent === filename) throw new Error('Configuration invalide : DATA_DIR');
    return path.join(canonicalPath(parent), path.basename(filename));
  }
}

function integer(env, name, fallback, min, max) {
  const value = env[name] === undefined || env[name] === '' ? fallback : Number(env[name]);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Configuration invalide : ${name}`);
  }

  return value;
}