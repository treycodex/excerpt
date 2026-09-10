#!/usr/bin/env node
// Bundles src/engine.ts into a single file for JavaScriptCore.
//
// IIFE, not ESM: JSContext has no module loader. The bundle assigns one global,
// `Excerpt`, and the Swift host calls methods on it.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const outfile = '../../apps/mac/Resources/excerpt-engine.js';

await build({
  entryPoints: ['src/engine.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'ExcerptBundle',
  // JavaScriptCore on macOS 26 is a current engine, but there is no reason to ship
  // syntax newer than the engine's own tests have run against.
  target: ['es2020'],
  platform: 'neutral',
  mainFields: ['module', 'main'],
  conditions: ['import', 'default'],
  outfile,
  footer: { js: 'var Excerpt = ExcerptBundle.engine;' },
  legalComments: 'none',
});

// A browser global reaching the bundle means something in the import graph is not
// as pure as this entry point claims. Fail rather than discover it at runtime,
// where JavaScriptCore reports it as an unrelated TypeError.
const source = readFileSync(outfile, 'utf8');
for (const forbidden of ['idb-keyval', 'indexedDB', 'window.', 'document.']) {
  if (source.includes(forbidden)) {
    console.error(`engine bundle contains "${forbidden}" — something browser-only got imported`);
    process.exit(1);
  }
}

console.log(`wrote ${outfile} — ${(Buffer.byteLength(source) / 1024).toFixed(1)} kB`);
