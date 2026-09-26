'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { HttpError } = require('./errors');
const { timestamp } = require('./store');
const scrypt = promisify(crypto.scrypt);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const SESSION_MS = 7 * 24 * 3600 * 1000;
const cost = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

async function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = await scrypt(password, salt, 64, cost);
  return `${salt}:${hash.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const salt = stored ? stored.split(':')[0] : '0'.repeat(32);
  const computed = await passwordHash(password, salt);
  return Boolean(stored) && crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(stored));
}
function credentials(body, registering) {
  if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') throw new HttpError(400, 'Adresse e-mail et mot de passe requis.');
  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Adresse e-mail invalide.');
  if (Buffer.byteLength(body.password) > 128 || body.password.length < (registering ? 12 : 1)) {
    throw new HttpError(400, 'Le mot de passe doit contenir au moins 12 caractères et au plus 128 octets.');
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (registering && (!name || name.length > 80)) throw new HttpError(400, 'Indique un nom de 1 à 80 caractères.');
  return { email, password: body.password, name };
}
function createAuth({ store, config }) {
  const cookieName = config.secureCookies ? '__Host-legacy_session' : 'legacy_session';
  const cookies = { httpOnly: true, secure: config.secureCookies, sameSite: 'lax', path: '/', maxAge: SESSION_MS };
  function cookieToken(req) {
    const value = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
  }
  function load(req, _res, next) {
    const token = cookieToken(req);
    req.session = token ? store.get(`SELECT sessions.*,users.id,users.name,users.email,users.credits,users.reserved
      FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?`, digest(token), Date.now()) : null;
    next();
  }
  function requireUser(req, _res, next) {
    if (!req.session) throw new HttpError(401, 'Connecte-toi pour continuer.');
    next();
  }
  function requireCsrf(req, _res, next) {
    if (!req.session || req.get('x-csrf-token') !== req.session.csrf) throw new HttpError(403, 'Session expirée ou requête non autorisée. Recharge la page.');
    next();
  }
  function issue(req, res, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const csrf = crypto.randomBytes(32).toString('hex');
    store.transaction(() => {
      const old = cookieToken(req);
      if (old) store.run('DELETE FROM sessions WHERE token_hash = ?', digest(old));
      store.run('DELETE FROM sessions WHERE expires_at <= ?', Date.now());
      // Bound persistent sessions per account.
      store.run(`DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN
        (SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY expires_at DESC LIMIT 9)`, userId, userId);
      store.run('INSERT INTO sessions VALUES (?,?,?,?)', digest(token), userId, csrf, Date.now() + SESSION_MS);
    });
    res.cookie(cookieName, token, cookies);
    req.session = { ...store.get('SELECT * FROM users WHERE id = ?', userId), user_id: userId, csrf };
  }
  async function register(req, res) {
    const { email, password, name } = credentials(req.body, true);
    const hash = await passwordHash(password);
    const id = crypto.randomUUID();
    store.transaction(() => {
      if (store.get('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'Impossible de créer ce compte avec cette adresse.');
      store.run('INSERT INTO users(id,email,name,password_hash,created_at) VALUES (?,?,?,?,?)', id, email, name, hash, timestamp());
    });
    issue(req, res, id);
  }
  async function login(req, res) {
    const { email, password } = credentials(req.body, false);
    const user = store.get('SELECT * FROM users WHERE email = ?', email);
    if (!await verifyPassword(password, user?.password_hash)) throw new HttpError(401, 'Adresse e-mail ou mot de passe incorrect.');
    issue(req, res, user.id);
  }
  function logout(req, res) {
    const token = cookieToken(req);
    if (token) store.run('DELETE FROM sessions WHERE token_hash = ?', digest(token));
    res.clearCookie(cookieName, { ...cookies, maxAge: undefined });
    res.status(204).end();
  }
  return { load, requireUser, requireCsrf, register, login, logout };
}
module.exports = { createAuth, passwordHash, verifyPassword };
