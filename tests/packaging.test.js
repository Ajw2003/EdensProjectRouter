import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// The installed Windows app imports site/js/*.js from resources/site, where no parent package.json
// exists, and Electron 33's Node 20 does not guess ES module syntax. site/package.json must say so.
test('site/ is marked as ES modules for the packaged app', () => {
  const pkg = JSON.parse(readFileSync(new URL('../site/package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.type, 'module');
});

// electron-builder only packs the files listed in desktop/package.json, so a desktop module missing from that list
// works when run from source and crashes in the installed app.
test('every desktop module is in the installer file list', () => {
  const dir = new URL('../desktop/', import.meta.url);
  const files = JSON.parse(readFileSync(new URL('package.json', dir), 'utf8')).build.files;
  const modules = readdirSync(dir).filter((n) => /\.(c?js)$/.test(n));
  for (const m of modules) assert.ok(files.includes(m), m + ' is missing from build.files in desktop/package.json');
});
