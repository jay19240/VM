const { createApplication } = require('./server/app');

async function start() {
  let platform = null;

  try {
    platform = await createApplication();
  } catch (e) {
    platform.close();
  }

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
  
  process.once('SIGTERM', platform.beginShutdown);
  process.once('SIGINT', platform.beginShutdown);
  return { ...platform, server };
}

if (require.main === module) start().catch(() => {
  // Do not dump configuration, Stripe errors, auth payloads or child-process diagnostics.
  console.error('Démarrage impossible. Vérifie la configuration, le stockage et le verrou du serveur.');
  process.exitCode = 1;
});

module.exports = { start, createApplication };