import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { sameLoginNotes } from '../site/js/accounts.js';

const require = createRequire(import.meta.url);
const { loadHidden, saveHidden, setHidden } = require('../desktop/hiddenaccounts.js');
const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'router-hid-')), 'hidden-accounts.json');

test('missing file: none hidden, no warning', () => {
  const warns = [];
  assert.deepEqual(loadHidden(file(), (m) => warns.push(m)), []);
  assert.deepEqual(warns, []);
});

test('save then load round-trips; setHidden hides and shows', () => {
  const f = file();
  saveHidden(f, ['.claude-old']);
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { hidden: ['.claude-old'] });
  assert.deepEqual(setHidden(f, '.claude-two', true), ['.claude-old', '.claude-two']);
  assert.deepEqual(setHidden(f, '.claude-old', false), ['.claude-two']);
  assert.deepEqual(loadHidden(f), ['.claude-two']);
});

test('broken file: none hidden and a warning, never throws; setHidden recovers', () => {
  const f = file();
  fs.writeFileSync(f, '{nope');
  const warns = [];
  assert.deepEqual(loadHidden(f, (m) => warns.push(m)), []);
  assert.equal(warns.length, 1);
  fs.writeFileSync(f, '{"hidden":"x"}');
  assert.deepEqual(loadHidden(f, (m) => warns.push(m)), []);
  assert.equal(warns.length, 2);
  assert.deepEqual(setHidden(f, 'a', true, () => {}), ['a']);
});

test('sameLoginNotes: names the other folder (same email wording when only emails are known), case-insensitive, ignores blanks and unique emails', () => {
  const n = sameLoginNotes([
    { id: '1', name: '.claude', email: 'A@x.com' }, { id: '2', name: '.claude-two', email: 'b@x.com' },
    { id: '3', name: '.claude-old', email: 'a@X.com' }, { id: '4', name: '.claude-n', email: '' }, { id: '5', name: '.claude-m' },
  ]);
  assert.deepEqual(n, { 3: 'same email as .claude', 1: 'same email as .claude-old' });
  assert.deepEqual(sameLoginNotes([]), {});
  assert.deepEqual(sameLoginNotes(null), {});
});
