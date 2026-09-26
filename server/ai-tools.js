'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const { randomUUID } = require('node:crypto');
const C = fs.constants;
const CODE = /\.(js|mjs|cjs|ts|json|css|html|wgsl)$/;
const DOC = /\.(js|mjs|cjs|ts|json|css|html|wgsl|md|txt)$/;
const ASSET = /\.(png|jpe?g|gif|webp|avif|svg|ico|mp3|wav|ogg|m4a|mp4|webm|glb|gltf|obj|bin|pak|blend|woff2?|ttf)$/i;
const MAX_FILE = 2 * 1024 ** 2;
const MAX_GAME = 10 * 1024 ** 2;
const MAX_NODES = 2000;
const fail = () => { throw new Error('AI file operation refused'); };
const fdPath = fd => `/proc/self/fd/${fd}`;
function parts(relative, empty = false, maxSegments = 13) {
  if (typeof relative !== 'string' || relative.length > 400 || (!empty && !relative)) fail();
  const result = relative ? relative.split('/') : [];
  if (result.length > maxSegments || result.some(s => !s || s === '.' || s === '..' || s.startsWith('.') ||
      s.length > 100 || /[\\\x00-\x1f\x7f:]/.test(s))) fail();
  return result;
}
function directory(parent, name) {
  const filename = `${fdPath(parent)}/${name}`;
  const before = fs.lstatSync(filename);
  if (!before.isDirectory()) fail(); // Explicitly refuse symlinks, including intermediate ancestors.
  const fd = fs.openSync(filename, C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW);
  try {
    const after = fs.fstatSync(fd);
    if (!after.isDirectory() || !same(before, after)) fail();
    return fd; // Ownership transfers only after validating the opened directory.
  } catch (error) { fs.closeSync(fd); throw error; }
}
function absoluteDirectory(filename) {
  if (typeof filename !== 'string' || !path.isAbsolute(filename) || filename !== path.resolve(filename)) fail();
  // Resolve every ancestor without following links, not just the final leaf.
  let fd = fs.openSync('/', C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW);
  try {
    for (const name of filename.split('/').filter(Boolean)) {
      const next = directory(fd, name); fs.closeSync(fd); fd = next;
    }
    return fd;
  } catch (error) { fs.closeSync(fd); throw error; }
}
function parentOf(root, segments, create, action) {
  const opened = [];
  let parent = root;
  try {
    for (const name of segments.slice(0, -1)) {
      if (create) {
        try { fs.mkdirSync(`${fdPath(parent)}/${name}`, { mode: 0o700 }); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
      }
      parent = directory(parent, name); opened.push(parent);
    }
    return action(parent, segments.at(-1));
  } finally { for (const fd of opened.reverse()) fs.closeSync(fd); }
}
function regular(stat) { if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_FILE) fail(); }
function same(a, b) { return a.dev === b.dev && a.ino === b.ino; }
function readText(root, segments) {
  return parentOf(root, segments, false, (parent, name) => {
    const fd = fs.openSync(`${fdPath(parent)}/${name}`, C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK);
    try {
      const before = fs.fstatSync(fd); regular(before);
      const buffer = Buffer.alloc(before.size + 1);
      let length = 0; let n;
      while (length < buffer.length && (n = fs.readSync(fd, buffer, length, buffer.length - length, null))) length += n;
      const after = fs.fstatSync(fd); regular(after);
      if (length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs) fail();
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
    } finally { fs.closeSync(fd); }
  });
}
// Every directory operation is descriptor-relative on Linux. O_NOFOLLOW on a
// leaf alone would leave intermediate-directory substitution races. Fail closed
// on platforms without /proc/self/fd rather than provide an unsafe fallback.
function walk(root, { strict = false, accept = CODE, visit }) {
  let nodes = 0; let files = 0; let bytes = 0;
  function walkDirectory(fd, prefix, depth) {
    if (depth > 12) fail();
    const stream = fs.opendirSync(fdPath(fd));
    try {
      let entry;
      while ((entry = stream.readSync())) {
        if (++nodes > MAX_NODES) fail();
        const relative = prefix + entry.name;
        try { parts(relative); } catch (error) { if (strict) throw error; else continue; }
        const stat = fs.lstatSync(`${fdPath(fd)}/${entry.name}`);
        if (stat.isSymbolicLink()) { if (strict) fail(); else continue; }
        if (stat.isDirectory()) {
          const child = directory(fd, entry.name);
          try { if (walkDirectory(child, relative + '/', depth + 1) === false) return false; }
          finally { fs.closeSync(child); }
        } else if (stat.isFile() && stat.nlink === 1 && accept.test(entry.name)) {
          if (strict) {
            regular(stat);
            if (++files > 200 || (bytes += stat.size) > MAX_GAME) fail();
          }
          if (visit(relative, stat) === false) return false;
        } else if (strict) fail();
      }
    } finally { stream.closeSync(); }
    return true;
  }
  walkDirectory(root, '', 0);
  return { files, bytes };
}
const string = { type: 'string' };
function definition(name, description, properties) {
  return { type: 'function', name, description, strict: true,
    parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } };
}
const TOOL_DEFINITIONS = [
  definition('list_files', 'List bounded code/document paths in src/game, src/lib, examples or docs. src/game is the staged draft.', { scope: { type: 'string', enum: ['src/game', 'src/lib', 'examples', 'docs'] } }),
  definition('read_file', 'Read a bounded UTF-8 text slice, with character offset and limit (1-16000). Only listed code/docs are readable.', { path: string, offset: { type: 'integer', minimum: 0, maximum: MAX_FILE }, limit: { type: 'integer', minimum: 1, maximum: 16000 } }),
  definition('search_files', 'Literal substring search (no regular expressions), at most 50 matching file excerpts. Bounded scan.', { scope: { type: 'string', enum: ['src/game', 'src/lib', 'examples', 'docs'] }, query: string }),
  definition('list_assets', 'List public asset paths only; never read asset contents.', {}),
  definition('write_game_file', 'Create or replace a staged src/game code file, never live engine files.', { path: string, content: string }),
  definition('delete_game_file', 'Delete one staged src/game file. No recursive deletes; main.js cannot be deleted.', { path: string }),
];
function createAITools({ engineDir, gameDir, templateDir, signal, readOnly = false }) {
  // Capabilities are enforced here, not only by omitting tools from a prompt.
  const definitions = readOnly ? TOOL_DEFINITIONS.filter(tool => !['write_game_file', 'delete_game_file'].includes(tool.name)) : TOOL_DEFINITIONS;
  let engine; let game;
  try {
    if (process.platform !== 'linux' || !C.O_NOFOLLOW || !C.O_DIRECTORY) fail();
    if (typeof engineDir !== 'string' || typeof gameDir !== 'string') fail();
    const within = value => !value || (!value.startsWith('..' + path.sep) && value !== '..' && !path.isAbsolute(value));
    const protectedRoots = [engineDir];
    if (templateDir !== undefined) protectedRoots.push(fs.realpathSync(templateDir));
    for (const root of protectedRoots) {
      if (within(path.relative(root, gameDir)) || within(path.relative(gameDir, root))) fail();
    }
    engine = absoluteDirectory(engineDir); game = absoluteDirectory(gameDir);
    if (same(fs.fstatSync(engine), fs.fstatSync(game))) fail();
    walk(game, { strict: true, visit: () => {} });
  } catch {
    if (engine !== undefined) fs.closeSync(engine);
    if (game !== undefined) fs.closeSync(game);
    fail();
  }
  let closed = false;
  function check() { if (closed || signal?.aborted) fail(); }
  function scoped(scope, action) {
    if (scope === 'src/game') return action(game);
    const names = scope === 'src/lib' ? ['src', 'lib'] : scope === 'examples' ? ['src', 'examples'] : scope === 'docs' ? ['doc'] : [scope];
    let root;
    try { root = parentOf(engine, names, false, directory); }
    catch (error) {
      // Legacy fixture layouts remain readable only if the preferred root is
      // absent. Never fall back on links, invalid roots or errors in the action.
      if (error.code !== 'ENOENT' || !['examples', 'docs'].includes(scope)) throw error;
      root = directory(engine, scope);
    }
    try { return action(root); } finally { fs.closeSync(root); }
  }
  function location(filename, writable = false) {
    parts(filename, false, 15); // Up to two virtual-root components, then inspectGame's 12 directories + leaf.
    const scope = ['src/game', 'src/lib', 'examples', 'docs'].find(s => filename.startsWith(s + '/'));
    if (!scope || (writable && scope !== 'src/game')) fail();
    const segments = parts(filename.slice(scope.length + 1));
    if (!(scope === 'docs' || scope === 'examples' ? DOC : CODE).test(segments.at(-1))) fail();
    return { scope, segments };
  }
  function validate(name, args) {
    const schema = definitions.find(t => t.name === name)?.parameters;
    if (!schema || !args || typeof args !== 'object' || Array.isArray(args) ||
        Object.keys(args).length !== schema.required.length || schema.required.some(k => !Object.hasOwn(args, k))) fail();
    for (const [key, rule] of Object.entries(schema.properties)) {
      const value = args[key];
      if (rule.type === 'string' && typeof value !== 'string') fail();
      if (rule.type === 'integer' && (!Number.isSafeInteger(value) || value < rule.minimum || value > rule.maximum)) fail();
      if (rule.enum && !rule.enum.includes(value)) fail();
    }
    if (Object.hasOwn(args, 'path')) location(args.path, name === 'write_game_file' || name === 'delete_game_file');
    if (name === 'search_files' && (!args.query || args.query.length > 200)) fail();
    if (name === 'write_game_file' && (Buffer.byteLength(args.content) > MAX_FILE || args.content.includes('\0'))) fail();
  }
  function execute(name, args) {
    check(); validate(name, args);
    try {
      if (name === 'list_files' || name === 'search_files' || name === 'list_assets') {
        const assets = name === 'list_assets';
        const scope = assets ? 'public' : args.scope;
        const results = []; let scannedBytes = 0; let truncated = false;
        const action = root => {
          walk(root, { accept: assets ? ASSET : ['examples', 'docs'].includes(scope) ? DOC : CODE,
            visit: (relative, stat) => {
              check();
              if (results.length >= (name === 'search_files' ? 50 : 200)) { truncated = true; return false; }
              if (name !== 'search_files') { results.push(`${scope}/${relative}`); return; }
              if (stat.size > MAX_FILE || scannedBytes + stat.size > MAX_GAME) { truncated = true; return false; }
              scannedBytes += stat.size;
              const text = readText(root, parts(relative));
              const offset = text.indexOf(args.query); // Literal, bounded: never compile a provider regex.
              if (offset !== -1) results.push({ path: `${scope}/${relative}`, offset, excerpt: text.slice(Math.max(0, offset - 80), offset + 240) });
            } });
        };
        try { scoped(scope, action); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        return { results, truncated };
      }
      const { scope, segments } = location(args.path, name !== 'read_file');
      if (name === 'read_file') return scoped(scope, root => {
        const text = readText(root, segments);
        return { path: args.path, offset: args.offset, content: text.slice(args.offset, args.offset + args.limit),
          nextOffset: args.offset + args.limit < text.length ? args.offset + args.limit : null };
      });
      // Recount the whole draft before every mutation, including files the model
      // did not create. Match inspectGame's depth/extensions/count/byte limits.
      const inventory = walk(game, { strict: true, visit: () => {} });
      return parentOf(game, segments, name === 'write_game_file', (parent, leaf) => {
        const filename = `${fdPath(parent)}/${leaf}`;
        let old;
        try { old = fs.lstatSync(filename); regular(old); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (name === 'delete_game_file') {
          if (segments.join('/') === 'main.js' || !old) fail();
          fs.unlinkSync(filename);
          return { deleted: args.path };
        }
        const data = Buffer.from(args.content);
        if (inventory.files + (old ? 0 : 1) > 200 || inventory.bytes - (old?.size || 0) + data.length > MAX_GAME) fail();
        // Atomic replacement never modifies an existing inode, even if another
        // process hardlinks the old leaf after validation. The temporary file is
        // host-generated, exclusive, descriptor-relative, and removed on error.
        const temporary = `${fdPath(parent)}/.ai-write-${randomUUID()}`;
        const fd = fs.openSync(temporary, C.O_WRONLY | C.O_NOFOLLOW | C.O_CREAT | C.O_EXCL, 0o600);
        let renamed = false;
        try {
          fs.writeFileSync(fd, data);
          fs.fsyncSync(fd);
          regular(fs.fstatSync(fd));
          let current;
          try { current = fs.lstatSync(filename); regular(current); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
          if (old ? !current || !same(old, current) : current) fail();
          fs.renameSync(temporary, filename); renamed = true;
          fs.fsyncSync(parent);
        } finally {
          fs.closeSync(fd);
          if (!renamed) fs.unlinkSync(temporary);
        }
        return { written: args.path, bytes: data.length };
      });
    } catch { fail(); }
  }
  return { definitions, validate, execute,
    close() { if (!closed) { closed = true; fs.closeSync(game); fs.closeSync(engine); } } };
}
module.exports = { createAITools };
