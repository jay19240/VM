'use strict';
const { createApplication } = require('./server/app');

async function start() {
  const platform = await createApplication();
  const server = platform.app.listen(platform.config.port, platform.config.host, () => {
    console.log(`Legacy Studio écoute sur le port ${platform.config.port}.`);
  });
  server.on('error', async () => {
    console.error('Impossible de démarrer le serveur HTTP.');
    await platform.close();
    process.exitCode = 1;
  });
  server.requestTimeout = 60000;
  server.headersTimeout = 15000;
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    platform.beginShutdown();
    // Drain HTTP handlers before closing their database or releasing the data-directory lock.
    await new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); });
    await platform.close();
  }
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  return { ...platform, server };
}
if (require.main === module) start().catch(() => {
  // Do not dump configuration, Stripe errors, auth payloads or child-process diagnostics.
  console.error('Démarrage impossible. Vérifie la configuration, le stockage et le verrou du serveur.');
  process.exitCode = 1;
});
module.exports = { start, createApplication };
