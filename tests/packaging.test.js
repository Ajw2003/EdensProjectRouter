import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The installed Windows app imports site/js/*.js from resources/site, where no parent package.json
// exists, and Electron 33's Node 20 does not guess ES module syntax. site/package.json must say so.
test('site/ is marked as ES modules for the packaged app', () => {
  const pkg = JSON.parse(readFileSync(new URL('../site/package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.type, 'module');
});
