import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickNewSession } from '../site/js/tiles/linknew.js';

const tile = { accountId: 'a', cwd: 'C:\\Work\\Alpha' };
const s = (id, o = {}) => ({ id, accountId: 'a', cwd: 'C:/work/alpha', lastActiveMs: 10000, ...o });
const pick = (list, claimed = [], start = 10000) => (pickNewSession(tile, list, claimed, start) || {}).id || null;

test('same cwd wins, ignoring case and slashes, newest first', () => {
  assert.equal(pick([s('x', { cwd: 'D:/other' }), s('y', { lastActiveMs: 11000 }), s('z', { lastActiveMs: 12000 })]), 'z');
});
test('claimed and older-than-start sessions are excluded', () => {
  assert.equal(pick([s('x'), s('y')], ['x']), 'y');
  assert.equal(pick([s('x', { lastActiveMs: 4000 })]), null);
  assert.equal(pick([s('x', { lastActiveMs: 5000 })]), 'x');
});
test('one other candidate is taken, several are ambiguous', () => {
  assert.equal(pick([s('x', { cwd: 'D:/other' })]), 'x');
  assert.equal(pick([s('x', { cwd: 'D:/o1' }), s('y', { cwd: 'D:/o2' })]), null);
});
test('cloud sessions and other accounts are ignored', () => {
  assert.equal(pick([s('x', { cloud: true }), s('y', { accountId: 'b' })]), null);
});
