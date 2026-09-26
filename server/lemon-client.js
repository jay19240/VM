'use strict';

// JSON:API document in/out. No SDK, automatic retries, redirects, or provider error leakage.
function createLemonClient({ apiKey, fetchImpl = globalThis.fetch } = {}) {
  return { async request(resource, { method = 'GET', body } = {}) {
    if (typeof apiKey !== 'string' || !apiKey.trim() || typeof fetchImpl !== 'function' ||
        typeof resource !== 'string' || !/^\/[a-z-]+(?:\/[a-zA-Z0-9-]+)?(?:\?[^#]*)?$/.test(resource) ||
        !['GET', 'POST'].includes(method) || (method === 'GET' && body !== undefined)) {
      throw new Error('Lemon Squeezy request unavailable.');
    }
    try {
      const response = await fetchImpl(`https://api.lemonsqueezy.com/v1${resource}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json',
          Authorization: `Bearer ${apiKey}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new Error();
      const document = await response.json();
      if (!document || typeof document !== 'object' || !document.data || document.errors) throw new Error();
      return document;
    } catch { throw new Error('Lemon Squeezy request unavailable.'); }
  } };
}
module.exports = { createLemonClient };
