import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { emptyLayout, openBeside } from '../site/js/panes.js';
import { splitDay, limitEarlier, keyOf } from '../site/js/sessionlist.js';
import { lastMessages, lastActiveLabel, sessionTileKey } from '../site/js/tiles/session.js';

const require = createRequire(import.meta.url);
const { readLayout, writeLayout } = require('../desktop/layoutstore.js');

test('layout store: atomic write then read gives the same object and leaves no temp file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-layout-'));
  const file = path.join(dir, 'sub', 'layout.json');
  assert.equal(readLayout(file), null);
  const f = { version: 1, current: openBeside(emptyLayout(), { accountId: 'a', sessionId: '1' }), saved: [] };
  writeLayout(file, f);
  writeLayout(file, f); // second write replaces the first
  assert.deepEqual(readLayout(file), f);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['layout.json']);
  fs.writeFileSync(file, '{broken');
  assert.throws(() => readLayout(file), /damaged/);
  assert.throws(() => writeLayout(file, [1]), /layout object/);
});

test('session tile helpers: key, last 3 messages, last active text', () => {
  assert.equal(sessionTileKey({ accountId: 'a', sessionId: '9' }), 'a|9');
  assert.equal(sessionTileKey({ accountId: 'a', sessionId: null, key: 'new:x' }), 'new:x');
  const entries = [
    { kind: 'you', text: 'one' }, { kind: 'tool', summary: 'Ran ls' }, { kind: 'claude', text: 'two' },
    { kind: 'you', text: 'three' }, { kind: 'tool', summary: 'Read a' }, { kind: 'claude', text: 'x'.repeat(2000) },
  ];
  const m = lastMessages(entries);
  assert.deepEqual(m.map((x) => x.kind), ['claude', 'you', 'claude']);
  assert.equal(m[0].text, 'two');
  assert.ok(m[2].text.length <= 601 && m[2].text.endsWith('…'));
  assert.deepEqual(lastMessages([]), []);
  const now = 1_000_000_000;
  assert.equal(lastActiveLabel(now - 5 * 60000, now), 'Last active 5 min ago');
  assert.equal(lastActiveLabel(0, now), 'No activity recorded yet');
});

const sess = (id, ms, extra = {}) => ({ accountId: 'a', id, title: 't' + id, project: 'p', cwd: '/p', lastActiveMs: ms, ...extra });

test('session list: Today holds sessions since local midnight, Earlier the rest, newest first', () => {
  const now = new Date(2026, 5, 10, 15, 0, 0).getTime();
  const midnight = new Date(2026, 5, 10, 0, 0, 0).getTime();
  const groups = [{ project: 'p', sessions: [sess('old', midnight - 1000), sess('a', now - 5000), sess('b', midnight + 1000)] }, { project: 'q', sessions: [sess('c', now - 1000, { project: 'q' })] }];
  const { today, earlier } = splitDay(groups, now, '');
  assert.deepEqual(today.map((s) => s.id), ['c', 'a', 'b']);
  assert.deepEqual(earlier.map((s) => s.id), ['old']);
  assert.deepEqual(splitDay(groups, now, 'Q').today.map((s) => s.id), ['c']); // search by project, any case
});

test('session list: Show N more keeps starred sessions visible and counts what is hidden', () => {
  const earlier = [1, 2, 3, 4, 5, 6, 7].map((n) => sess(String(n), 100 - n));
  const r = limitEarlier(earlier, 3, new Set([keyOf(earlier[5])]));
  assert.deepEqual(r.shown.map((s) => s.id), ['1', '2', '3', '6']);
  assert.equal(r.more, 3);
  assert.equal(limitEarlier(earlier, 20, new Set()).more, 0);
});
