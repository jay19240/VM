'use strict';
const fs = require('node:fs');
const path = require('node:path');

// SQLite handles transaction concurrency, but filesystem publication/recovery needs one coordinator.
function acquireLock(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const filename = path.join(dataDir, 'server.lock');
  function open() { return fs.openSync(filename, 'wx', 0o600); }
  let fd;
  try { fd = open(); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Verrou de données invalide.');
    const owner = Number(fs.readFileSync(filename, 'utf8'));
    if (!Number.isSafeInteger(owner) || owner <= 0) throw new Error('Verrou de données à vérifier manuellement.');
    try { process.kill(owner, 0); throw new Error('Un serveur utilise déjà ce répertoire de données.'); }
    catch (check) { if (check.code !== 'ESRCH') throw check; }
    fs.unlinkSync(filename);
    fd = open();
  }
  fs.writeFileSync(fd, String(process.pid));
  fs.fsyncSync(fd);
  return () => {
    fs.closeSync(fd);
    if (fs.readFileSync(filename, 'utf8') === String(process.pid)) fs.unlinkSync(filename);
  };
}
module.exports = { acquireLock };
