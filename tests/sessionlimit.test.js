import test from 'node:test';
import assert from 'node:assert/strict';
import { limitSessions, clampCount } from '../site/js/sessionlimit.js';
import { filterGroups } from '../site/js/list.js';

const make = (n) => Array.from({ length: n }, (_, i) => ({ id: 's' + i, title: 'Task ' + i, cwd: 'C:\\p' }));

test('default count is 2', () => {
  const r = limitSessions(make(5));
  assert.deepEqual(r.shown.map((s) => s.id), ['s0', 's1']);
  assert.equal(r.hiddenCount, 3);
});
test('43 sessions with one old pin: pin plus newest at count 2, 41 hidden', () => {
  const r = limitSessions(make(43), 2, ['s42']);
  assert.deepEqual(r.shown.map((s) => s.id), ['s42', 's0']);
  assert.equal(r.hiddenCount, 41);
});
test('pins always show beyond count, newest first', () => {
  const r = limitSessions(make(10), 2, ['s7', 's3', 's5']);
  assert.deepEqual(r.shown.map((s) => s.id), ['s3', 's5', 's7']);
  assert.equal(r.hiddenCount, 7);
});
test('few sessions: nothing hidden', () => {
  assert.equal(limitSessions(make(1), 2, []).hiddenCount, 0);
  assert.equal(limitSessions([], 2, []).shown.length, 0);
});
test('count clamps to 1..20', () => {
  assert.equal(clampCount(0), 1);
  assert.equal(clampCount(-4), 1);
  assert.equal(clampCount(99), 20);
  assert.equal(clampCount('x'), 2);
  assert.equal(limitSessions(make(30), 99, []).shown.length, 20);
  assert.equal(limitSessions(make(30), 0, []).shown.length, 1);
});
test('search ignores the limit: a hidden session is found', () => {
  const groups = [{ project: 'p', sessions: make(43) }];
  assert.equal(limitSessions(groups[0].sessions, 2, []).shown.length, 2);
  const found = filterGroups(groups, 'task 30');
  assert.deepEqual(found[0].sessions.map((s) => s.id), ['s30']);
});
