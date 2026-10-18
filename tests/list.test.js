import test from 'node:test';
import assert from 'node:assert/strict';
import { filterGroups, splitRecent, normalizeState } from '../site/js/list.js';

const groups = [
  { project: 'web-shop', sessions: [{ title: 'Fix checkout', cwd: 'C:\\a\\web-shop' }, { title: 'Gift card', cwd: 'C:\\a\\web-shop' }] },
  { project: 'notes', sessions: [{ title: 'Sync offline', cwd: 'C:\\a\\notes' }, { title: 'Dark theme', cwd: 'C:\\a\\notes' }] },
];

test('filterGroups: empty query keeps all', () => {
  assert.equal(filterGroups(groups, '  ').length, 2);
});
test('filterGroups: project name match keeps all its sessions', () => {
  const r = filterGroups(groups, 'WEB');
  assert.equal(r.length, 1);
  assert.equal(r[0].sessions.length, 2);
});
test('filterGroups: session title match keeps only matching sessions, drops empty groups', () => {
  const r = filterGroups(groups, 'dark');
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].sessions.map((s) => s.title), ['Dark theme']);
  assert.equal(filterGroups(groups, 'zzz').length, 0);
});
test('splitRecent', () => {
  const now = 1e12, day = 86400000;
  const r = splitRecent([{ lastActiveMs: now - day }, { lastActiveMs: now - 8 * day }], now);
  assert.equal(r.recent.length, 1);
  assert.equal(r.older.length, 1);
});
test('normalizeState: old shape (folded and query only) still reads', () => {
  const s = normalizeState({ folded: { a: true }, query: 'x' });
  assert.deepEqual(s, { folded: { a: true }, query: 'x', limits: {} });
});
test('normalizeState: limits keep count, pins and all; bad values are repaired', () => {
  const s = normalizeState({ limits: { a: { count: 99, pins: ['s1', 5], all: true }, b: { count: 'x' }, c: 7 } });
  assert.deepEqual(s.limits.a, { count: 20, pins: ['s1'], all: true });
  assert.deepEqual(s.limits.b, { count: 2, pins: [], all: false });
  assert.equal(s.limits.c, undefined);
  assert.deepEqual(normalizeState(null), { folded: {}, query: '', limits: {} });
});
