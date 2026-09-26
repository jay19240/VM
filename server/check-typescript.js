'use strict';
// Invoked in a separate, credential-free Node process. Parse only: never link/evaluate modules.
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const { SourceTextModule } = require('node:vm');
try {
  const source = readFileSync(0, 'utf8');
  if (Buffer.byteLength(source) > 2 * 1024 ** 2) throw new Error('Source too large');
  new SourceTextModule(stripTypeScriptTypes(source, { mode: 'strip' }));
} catch {
  // Syntax diagnostics can quote user code; do not log them.
  process.exitCode = 1;
}
