const crypto = require('node:crypto');
const { HttpError } = require('./errors');
const { timestamp, userView } = require('./store');
// -----------------------------------------------------------------------------------
const { PASSWORD_HASH, VERIFY_PASSWORD, COOKIE_TOKEN, CREDENTIALS, DIGEST: digest } = require('./utils');
const { COOKIE_NAME, SECURE_COOKIE_NAME, COOKIES, SESSION_MS } = require('./constants');
const { CREATE_MIDDLEWARE_AUTH_LOAD, MIDDLEWARE_REQUIRE_CSRF } = require('./middlewares');
// -----------------------------------------------------------------------------------

module.exports.CREATE_AUTH = function ({ store, config, projects, runner, jobs, billing }) {
  const cookieName = config.secureCookies ? SECURE_COOKIE_NAME : COOKIE_NAME;
  const cookies = { ...COOKIES, secure: Boolean(config.secureCookies) };
  const loadSession = CREATE_MIDDLEWARE_AUTH_LOAD({ store, config });
  async function register(req, res) {
    const { email, password, name } = CREDENTIALS(req.body, true);
    const hash = await PASSWORD_HASH(password);
    const id = crypto.randomUUID();

    try {
      store.run('INSERT INTO users(id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)', id, email, name, hash, timestamp());
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT' || error.message.includes('UNIQUE')) {
        throw new HttpError(409, 'Impossible de créer ce compte avec cette adresse.');
      }

      throw error;
    }

    updateSession(req, res, id, store, cookieName, cookies);
  }

  async function login(req, res) {
    const { email, password } = CREDENTIALS(req.body, false);
    const user = store.get('SELECT * FROM users WHERE email = ?', email);

    if (!await VERIFY_PASSWORD(password, user?.password_hash)) {
      throw new HttpError(401, 'Adresse e-mail ou mot de passe incorrect.');
    }

    updateSession(req, res, user.id, store, cookieName, cookies);
  }

  function logout(req, res) {
    const token = COOKIE_TOKEN(req, cookieName);
    if (token) {
      store.run('DELETE FROM sessions WHERE token_hash = ?', digest(token));
    }

    const { maxAge, ...clearOptions } = cookies;
    res.clearCookie(cookieName, clearOptions);
    res.status(204).end();
  }

  function getSessionInfos(req) {
    const user = req.session ? userView(store.get('SELECT * FROM users WHERE id = ?', req.session.user_id)) : null;
    return {
      user,
      csrfToken: user ? req.session.csrf : null,
      generationMaxCredits: config.generationMaxCredits,
      microUsdPerCredit: config.aiMicroUsdPerCredit,
      aiModel: config.aiderModel,
      storage: user ? projects.storage(user.id) : null,
      billingProvider: 'lemon-squeezy',
      generationEnabled: Boolean(runner.enabled && jobs.available),
      billingEnabled: billing.enabled
    };
  }

  return { register, login, logout, getSessionInfos, loadSession, requireCsrf: MIDDLEWARE_REQUIRE_CSRF };
}

// -------------------------------------------------------------------------------------------
// HELPFUL
// -------------------------------------------------------------------------------------------

function updateSession(req, res, userId, store, cookieName, cookies) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_MS;
  store.transaction(() => {
    const old = COOKIE_TOKEN(req, cookieName);
    if (old) {
      store.run('DELETE FROM sessions WHERE token_hash = ?', digest(old));
    }

    // Supprime les sessions expirées et limite le nombre de sessions par utilisateur à 9
    store.run('DELETE FROM sessions WHERE expires_at <= ?', Date.now());
    store.run(`
      DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN
      (SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY expires_at DESC LIMIT 9)`, userId, userId
    );

    store.run('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES (?,?,?,?)', digest(token), userId, csrf, expiresAt);
  });

  res.cookie(cookieName, token, cookies);
  req.session = { token_hash: digest(token), user_id: userId, csrf, expires_at: expiresAt };
}