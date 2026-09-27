module.exports.SESSION_MS = 7 * 24 * 3600 * 1000;
module.exports.COOKIE_NAME = 'legacy_session';
module.exports.COOKIES = { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_MS };
module.exports.MIN_PASSWORD_LENGTH = 12;
module.exports.MAX_NAME_LENGTH = 80;
module.exports.UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;