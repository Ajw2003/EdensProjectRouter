import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The phone's stand-in only has the methods listed in remote.js; a missing one shows up on the phone as "x is not a function".
const src = fs.readFileSync(new URL('../site/js/sources/remote.js', import.meta.url), 'utf8');
test('the phone stand-in has the cloud methods and opens claude.ai in the phone', () => {
  for (const n of ['listCloudSessions', 'refreshSignIn']) assert.ok(src.includes("'" + n + "'"), n + ' missing from remote.js');
  assert.ok(/api\.openExternal\s*=/.test(src));
});
