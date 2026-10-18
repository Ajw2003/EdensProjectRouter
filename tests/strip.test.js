import test from 'node:test';
import assert from 'node:assert/strict';
import { planReporterAll } from '../site/js/strip.js';
import { accountForNewSession } from '../site/js/limits.js';

const accts = [
  { id: 'a', name: '.claude' },
  { id: 'b', name: '.claude-work' },
  { id: 'c', name: '.claude-spare', needsPermission: true },
];

test('planReporterAll: only accounts with tracking off', () => {
  assert.deepEqual(planReporterAll(accts, { a: 'on', b: 'off', c: 'off' }), ['b']);
});
test('planReporterAll: skips needsPermission, missing state counts as off, none when all on', () => {
  assert.deepEqual(planReporterAll(accts, {}), ['a', 'b']);
  assert.deepEqual(planReporterAll(accts, { a: 'on', b: 'on' }), []);
  assert.deepEqual(planReporterAll([], null), []);
});
test('strip account: most room, skipping needsPermission', () => {
  const lim = {
    a: { fiveHourPct: 80, weeklyPct: 10 },
    b: { fiveHourPct: 20, weeklyPct: 50 },
    c: { fiveHourPct: 1, weeklyPct: 1 },
  };
  assert.equal(accountForNewSession(accts, lim), 'b');
  assert.equal(accountForNewSession([accts[2]], lim), null);
});
