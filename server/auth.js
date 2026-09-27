const crypto = require('node:crypto');
const { HttpError } = require('./errors');
const { timestamp } = require('./store');
// -----------------------------------------------------------------------------------
const { PASSWORD_HASH, VERIFY_PASSWORD, COOKIE_TOKEN, CREDENTIALS } = require('./utils');
const { COOKIE_NAME } = require('./constants');
// -----------------------------------------------------------------------------------

module.exports.CREATE_AUTH = function (store) {
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

    updateSession(req, res, id, store);
  }

  async function login(req, res) {
    const { email, password } = CREDENTIALS(req.body, false);
    const user = store.get('SELECT * FROM users WHERE email = ?', email);

    if (!await VERIFY_PASSWORD(password, user?.password_hash)) {
      throw new HttpError(401, 'Adresse e-mail ou mot de passe incorrect.');
    }

    updateSession(req, res, user.id, store);
  }

  function logout(req, res) {
    const token = COOKIE_TOKEN(req);
    if (token) {
      store.run('DELETE FROM sessions WHERE token_hash = ?', digest(token));
    }

    res.clearCookie(COOKIE_NAME, { ...cookies, maxAge: undefined });
    res.status(204).end();
  }

  function getSessionInfos(req) {
    const user = req.session ? userView(store.get('SELECT * FROM users WHERE id = ?', req.session.user_id)) : null;
    return {
      user,
      csrfToken: user ? req.session.csrf : null,
      generationMaxCredits: config.generationMaxCredits,
      microUsdPerCredit: config.aiMicroUsdPerCredit,
      aiModel: config.openaiModel,
      storage: user ? projects.storage(user.id) : null,
      billingProvider: 'lemon-squeezy',
      generationEnabled: Boolean(runner.enabled && jobs.available),
      billingEnabled: billing.enabled
    };
  }

  return { register, login, logout, getSessionInfos };
}

// -------------------------------------------------------------------------------------------
// HELPFUL
// -------------------------------------------------------------------------------------------

function updateSession(req, res, userId, store) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(32).toString('hex');
  store.transaction(() => {
    const old = module.exports.COOKIE_TOKEN(req);
    if (old) {
      store.run('DELETE FROM sessions WHERE token_hash = ?', digest(old));
    }

    // Supprime les sessions expirées et limite le nombre de sessions par utilisateur à 9
    store.run('DELETE FROM sessions WHERE expires_at <= ?', Date.now());
    store.run(`
      DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN
      (SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY expires_at DESC LIMIT 9)`, userId, userId
    );

    store.run('INSERT INTO sessions VALUES (?,?,?,?)', digest(token), userId, csrf, Date.now() + SESSION_MS);
  });

  res.cookie(COOKIE_NAME, token, cookies);
  req.session = { ...store.get('SELECT * FROM users WHERE id = ?', userId), user_id: userId, csrf };
}