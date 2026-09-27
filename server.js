const { createApplication } = require('./server/app');

async function start(options = {}) {
  const platform = await createApplication(options);
  let server;
  let shutdownPromise;

  function shutdown() {
    if (!shutdownPromise) {
      shutdownPromise = (async () => {
        try {
          // The application stops accepting work and ends SSE; this module owns HTTP.
          await platform.beginShutdown();
        } finally {
          try {
            if (server) await new Promise((resolve, reject) => {
              server.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve());
              server.closeIdleConnections();
            });
          } finally {
            await platform.close();
          }
        }
      })().finally(() => {
        process.off('SIGTERM', onSignal);
        process.off('SIGINT', onSignal);
        server?.off('error', onServerError);
      });
    }
    return shutdownPromise;
  }

  function onSignal() {
    void shutdown().catch(() => {
      console.error('Arrêt du serveur incomplet. Vérifie le stockage avant de redémarrer.');
      process.exitCode = 1;
    });
  }

  function onServerError() {
    console.error('Erreur du serveur HTTP.');
    process.exitCode = 1;
    onSignal();
  }

  try {
    server = platform.app.listen(platform.config.port, platform.config.host);
    server.requestTimeout = 60000;
    server.headersTimeout = 15000;
    await new Promise((resolve, reject) => {
      const cleanup = () => { server.off('listening', onListening); server.off('error', onListenError); };
      const onListening = () => { cleanup(); resolve(); };
      const onListenError = error => { cleanup(); reject(error); };
      server.once('listening', onListening);
      server.once('error', onListenError);
    });
    server.on('error', onServerError);
    process.once('SIGTERM', onSignal);
    process.once('SIGINT', onSignal);
    console.log(`Legacy Studio écoute sur le port ${server.address().port}.`);
    return { ...platform, server, shutdown, close: shutdown };
  } catch (error) {
    await shutdown().catch(() => {});
    throw error;
  }
}

if (require.main === module) start().catch(() => {
  // Do not dump configuration, Stripe errors, auth payloads or child-process diagnostics.
  console.error('Démarrage impossible. Vérifie la configuration, le stockage et le verrou du serveur.');
  process.exitCode = 1;
});

module.exports = { start, createApplication };