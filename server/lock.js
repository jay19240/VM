'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Exclusive creation is atomic across processes. Never steal an existing lock:
// after an unclean exit, an operator must verify that the old owner has stopped.
function acquireLock(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const directory = fs.realpathSync(dataDir);
  const filename = path.join(directory, '.server.lock');
  let fd;
  try { fd = fs.openSync(filename, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Le répertoire de données est déjà verrouillé.');
    throw new Error('Impossible de verrouiller le répertoire de données.');
  }
  const owned = fs.fstatSync(fd);
  let released = false;
  function releaseLock() {
    if (released) return;
    try {
      const current = fs.lstatSync(filename);
      // Do not remove a lock replaced by another owner or an unrelated file.
      if (current.dev !== owned.dev || current.ino !== owned.ino || !current.isFile()) {
        throw new Error('Le verrou du répertoire de données a changé.');
      }
      fs.unlinkSync(filename);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    } finally {
      released = true;
      fs.closeSync(fd);
    }
  }
  try {
    fs.writeFileSync(fd, `${process.pid}\n`);
    fs.fsyncSync(fd);
  } catch {
    try { releaseLock(); } catch { /* Leave an unverifiable lock in place. */ }
    throw new Error('Impossible de verrouiller le répertoire de données.');
  }
  return releaseLock;
}

module.exports = { acquireLock };
