import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  emptyLayout, parseLayout, serializeLayout, openBeside, openHere, closePane, setMode, setParams, paneId, MAX_PANES,
} from '../site/js/panes.js';

const require = createRequire(import.meta.url);
const { readLayout, writeLayout } = require('../desktop/layoutstore.js');

const s = (n) => ({ accountId: 'a', sessionId: String(n), cwd: '/p', project: 'p', title: 'session ' + n });

test('panes: up to four open side by side, the fifth is refused, a repeat only becomes active', () => {
  let l = emptyLayout();
  for (let i = 1; i <= MAX_PANES; i++) l = openBeside(l, s(i));
  assert.deepEqual(l.panes.map((p) => p.id), ['a|1', 'a|2', 'a|3', 'a|4']);
  assert.equal(l.active, 'a|4');
  assert.equal(openBeside(l, s(5)), null);
  const again = openBeside(l, s(2));
  assert.equal(again.panes.length, 4);
  assert.equal(again.active, 'a|2');
});

test('panes: a plain click replaces the active pane; with nothing open it opens one', () => {
  let l = openHere(emptyLayout(), s(1));
  assert.equal(l.panes.length, 1);
  l = openBeside(l, s(2));
  l = openHere(l, s(3));
  assert.deepEqual(l.panes.map((p) => p.id), ['a|1', 'a|3']);
  assert.equal(l.active, 'a|3');
});

test('panes: closing one keeps the others and moves the active pane', () => {
  let l = emptyLayout();
  for (let i = 1; i <= 3; i++) l = openBeside(l, s(i));
  l = closePane(l, 'a|3');
  assert.deepEqual(l.panes.map((p) => p.id), ['a|1', 'a|2']);
  assert.equal(l.active, 'a|2');
  assert.equal(closePane(closePane(l, 'a|1'), 'a|2').active, null);
});

test('panes: the Terminal or Visual pick is kept per pane and is the start mode of the next pane', () => {
  let l = openBeside(emptyLayout(), s(1));
  l = setMode(l, 'a|1', 'visual');
  l = openBeside(l, s(2));
  assert.equal(l.panes[0].mode, 'visual');
  assert.equal(l.panes[1].mode, 'visual');
  l = setMode(l, 'a|2', 'terminal');
  assert.deepEqual(l.panes.map((p) => p.mode), ['visual', 'terminal']);
  assert.equal(setMode(l, 'a|1', 'bogus'), l);
});

test('panes: a new session without an id is kept by its own key; params can be patched', () => {
  const n = { accountId: 'a', sessionId: null, key: 'new:x-1', cwd: '/p', project: 'p', title: 'New session in p' };
  assert.equal(paneId(n), 'new:x-1');
  const l = setParams(openBeside(emptyLayout(), n), 'new:x-1', { accountId: 'b' });
  assert.equal(l.panes[0].params.accountId, 'b');
});

test('panes: the layout survives the file the app writes, in order with modes, active pane and last pick', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-panes-'));
  const file = path.join(dir, 'layout.json');
  let l = emptyLayout();
  for (let i = 1; i <= 3; i++) l = openBeside(l, s(i));
  l = setMode(l, 'a|2', 'visual');
  l = openHere(l, s(1)); // already open: only active
  writeLayout(file, { version: 1, current: JSON.parse(serializeLayout(l)), saved: [] });
  const back = parseLayout(readLayout(file).current);
  assert.deepEqual(back, l);
  assert.deepEqual(back.panes.map((p) => [p.id, p.mode]), [['a|1', 'terminal'], ['a|2', 'visual'], ['a|3', 'terminal']]);
  assert.equal(back.active, 'a|1');
  assert.equal(back.lastMode, 'visual');
});

test('panes: nothing, the old dockview layout and junk panes give an empty or trimmed layout', () => {
  assert.deepEqual(parseLayout(null), emptyLayout());
  assert.deepEqual(parseLayout({ grid: {}, panels: {} }), emptyLayout());
  const l = parseLayout({ panes: [null, { params: 5 }, { id: 'x', mode: 'weird', params: s(1) }, { params: s(1) }, ...[2, 3, 4, 5, 6].map((n) => ({ params: s(n) }))], active: 'gone', lastMode: 'nope' });
  assert.equal(l.panes.length, MAX_PANES);
  assert.equal(l.panes[0].mode, 'terminal');
  assert.equal(l.lastMode, 'terminal');
  assert.equal(l.active, l.panes[MAX_PANES - 1].id);
});
