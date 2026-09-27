module.exports.MIDDLEWARE_JSON_ONLY = (req, _res, next) => {
  if (!req.is('application/json')) {
    throw new HttpError(415, 'Un corps JSON est requis.');
  }

  next();
}

module.exports.MIDDLEWARE_REQUIRE_USER = (req, _res, next) => {
  if (!req.session) {
    throw new HttpError(401, 'Connecte-toi pour continuer.');
  }

  next();
}

module.exports.MIDDLEWARE_REQUIRE_CSRF = (req, _res, next) => {
  if (!req.session || req.get('x-csrf-token') !== req.session.csrf) {
    throw new HttpError(403, 'Session expirée ou requête non autorisée. Recharge la page.');
  }

  next();
}

module.exports.MIDDLEWARE_AUTH_LOAD = (req, _res, next) => {
  const token = module.exports.COOKIE_TOKEN(req);
  if (!token) {
    req.session = null;
    return next();
  }

  req.session = store.get(`
    SELECT sessions.*,users.id,users.name,users.email,users.credits,users.reserved
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE token_hash = ? AND expires_at > ?`, digest(token), Date.now()
  );

  next();
}

module.exports.CREATE_MIDDLEWARE_RATE_LIMIT = (max, duration, key = req => req.ip) => {
  const windows = new Map();
  return (req, res, next) => {
    const now = Date.now();
    if (windows.size > 10000) for (const [id, bucket] of windows) if (bucket.until <= now) windows.delete(id);
    const id = key(req);
    let bucket = windows.get(id);
    if (!bucket || bucket.until <= now) {
      if (windows.size > 10000) throw new HttpError(429, 'Service occupé. Réessaie plus tard.');
      bucket = { count: 0, until: now + duration }; windows.set(id, bucket);
    }
    if (++bucket.count > max) {
      res.set('Retry-After', String(Math.ceil((bucket.until - now) / 1000)));
      throw new HttpError(429, 'Trop de tentatives. Réessaie dans quelques minutes.');
    }
    next();
  };
}