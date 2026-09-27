'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { UUID } = require('./files');

// Only trusted commands live here. The user's request is a read-only file, never shell code.
const START = 'git init -q && git add src && exec /venv/bin/aider "$@"';
const failure = () => new Error('Aider indisponible ou génération interrompue.');
const containerName = id => {
  if (!UUID.test(id)) throw failure();
  return `legacy-aider-${id}`;
};

function createAider(config, spawnProcess = spawn) {
  const keyName = config.aiderModel?.startsWith('openai/') ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
  const apiKey = keyName === 'OPENAI_API_KEY' ? config.openaiApiKey : config.anthropicApiKey;
  let enabled = false;
  // Docker client only: never inherit unrelated credentials or arbitrary AIDER_* options.
  const dockerEnv = Object.fromEntries(['PATH', 'HOME', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'XDG_RUNTIME_DIR']
    .filter(key => process.env[key]).map(key => [key, process.env[key]]));

  function docker(args, { signal, capture = false, secret = false, timeout = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawnProcess('docker', args, { env: secret ? { ...dockerEnv, [keyName]: apiKey } : dockerEnv,
          stdio: ['ignore', capture ? 'pipe' : 'ignore', 'ignore'], shell: false });
      } catch { reject(failure()); return; }
      let output = ''; let interrupted = false;
      const stop = () => { interrupted = true; child.kill('SIGKILL'); };
      const timer = setTimeout(stop, timeout);
      signal?.addEventListener('abort', stop, { once: true });
      if (signal?.aborted) stop();
      child.stdout?.on('data', chunk => {
        output += chunk.toString('utf8');
        if (output.length > 4096) stop();
      });
      const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop); };
      child.on('error', () => { finish(); reject(failure()); });
      child.on('close', code => {
        finish();
        if (interrupted || code !== 0) reject(failure()); else resolve(output.trim());
      });
    });
  }

  async function cleanup(id) {
    const name = containerName(id);
    const found = await docker(['container', 'ls', '--all', '--quiet', '--filter', `name=^/${name}$`], { capture: true });
    if (found) {
      if (!/^[a-f0-9]{12,64}$/.test(found)) throw failure();
      await docker(['container', 'rm', '--force', name]);
    }
  }

  return {
    get enabled() { return enabled; },
    async initialize() {
      enabled = false;
      if (!apiKey || !config.aiderModel || !config.aiderImage) return;
      try {
        await docker(['info', '--format', '{{.ServerVersion}}']);
        await docker(['image', 'inspect', '--format', '{{.Id}}', config.aiderImage]);
        enabled = true;
      } catch { /* Projects stay usable when generation is unavailable. */ }
    },
    cleanup,
    async run({ id, engineDir, gameDir, prompt, signal }) {
      if (!enabled || signal?.aborted || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 16000) throw failure();
      const name = containerName(id);
      const uid = process.getuid?.() || 1000;
      const gid = process.getgid?.() || 1000;
      const work = path.dirname(gameDir);
      const requestFile = path.join(work, 'request.txt');
      const realGame = await fs.realpath(gameDir);
      const realEngine = await fs.realpath(engineDir);
      const relation = path.relative(realEngine, realGame);
      if (!relation.startsWith('..' + path.sep) || /[,\r\n]/.test(realGame + realEngine + requestFile)) throw failure();
      // Preserve server access even if Node was launched as root; the container never runs as root.
      async function ownership(directory) {
        for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
          const filename = path.join(directory, entry.name);
          if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) throw failure();
          if (entry.isDirectory()) await ownership(filename);
          if (process.getuid?.() === 0) await fs.chown(filename, uid, gid);
        }
        if (process.getuid?.() === 0) await fs.chown(directory, uid, gid);
      }
      await ownership(realGame);
      await fs.writeFile(requestFile, 'Modifie uniquement les fichiers de src/game. Le moteur src/lib et les assets sont en lecture seule.\n' +
        'Ne lance aucune commande et ne modifie aucune configuration.\nDemande utilisateur :\n' + prompt, { flag: 'wx', mode: 0o444 });
      const args = ['create', '--name', name, '--init', '--user', `${uid}:${gid}`, '--read-only',
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '128',
        '--memory', '2g', '--memory-swap', '2g', '--cpus', '1', '--network', 'bridge', '--log-driver', 'none',
        '--tmpfs', `/tmp:rw,nosuid,nodev,noexec,size=256m,uid=${uid},gid=${gid},mode=700`,
        '--tmpfs', `/app:rw,nosuid,nodev,noexec,size=64m,uid=${uid},gid=${gid},mode=700`,
        '--workdir', '/app', '--env', 'HOME=/tmp', '--env', 'GIT_CONFIG_NOSYSTEM=1', '--env', keyName,
        '--mount', `type=bind,src=${realGame},dst=/app/src/game`,
        '--mount', `type=bind,src=${requestFile},dst=/request.txt,readonly`];
      for (const relative of ['src/lib', 'src/examples', 'doc', 'public']) {
        const directory = path.join(realEngine, relative);
        let stat;
        try { stat = await fs.lstat(directory); } catch (error) { if (error.code === 'ENOENT') continue; throw failure(); }
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw failure();
        args.push('--mount', `type=bind,src=${directory},dst=/app/${relative},readonly`);
      }
      args.push('--entrypoint', '/bin/sh', config.aiderImage, '-c', START, 'aider',
        '--message-file', '/request.txt', '--model', config.aiderModel, '--weak-model', config.aiderModel,
        '--yes-always', '--no-auto-commits', '--no-dirty-commits', '--no-gitignore',
        '--no-auto-lint', '--no-auto-test', '--no-suggest-shell-commands', '--no-detect-urls', '--disable-playwright',
        '--no-check-update', '--no-show-release-notes', '--no-analytics',
        '--no-pretty', '--no-stream', '--no-fancy-input', '--config', '/dev/null', '--env-file', '/dev/null',
        '--input-history-file', '/tmp/input', '--chat-history-file', '/tmp/chat', '--file', 'src/game/main.js');
      try {
        // Create first, then start: even if cancellation kills the attach client, cleanup knows the exact container.
        await docker(args, { secret: true });
        if (signal?.aborted) throw failure();
        await docker(['start', '--attach', name], { signal, timeout: config.aiderTimeoutMs });
        if (signal?.aborted) throw failure();
      } finally {
        try { await cleanup(id); }
        catch {
          enabled = false;
          const error = failure(); error.cleanupFailed = true; throw error;
        }
      }
    },
  };
}
module.exports = { createAider };
