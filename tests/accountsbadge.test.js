import test from 'node:test';
import assert from 'node:assert/strict';
import { accountColor, badgeText, filterSummary, ACCOUNT_PALETTE } from '../site/js/accounts.js';
import { splitDay } from '../site/js/sessionlist.js';

const A = [
  { id: 'c', name: '.claude-zed', email: 'zed@x.com' },
  { id: 'a', name: '.claude', email: 'aj@x.com' },
  { id: 'b', name: '.claude-work', email: null },
];

test('accountColor is stable whatever the order the accounts arrive in', () => {
  const rev = [...A].reverse();
  for (const a of A) assert.equal(accountColor(A, a.id), accountColor(rev, a.id));
});

test('accountColor gives distinct palette colours to up to six accounts', () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ id: 'i' + i, name: 'n' + i }));
  const cols = six.map((a) => accountColor(six, a.id));
  assert.equal(new Set(cols).size, 6);
  for (const c of cols) assert.ok(ACCOUNT_PALETTE.includes(c));
});

test('badgeText: email before @, else folder name without .claude-, .claude is main', () => {
  assert.equal(badgeText({ email: 'aj@x.com', name: '.claude' }), 'aj');
  assert.equal(badgeText({ email: null, name: '.claude-work' }), 'work');
  assert.equal(badgeText({ email: '', name: '.claude' }), 'main');
});

test('filterSummary counts all accounts and one account', () => {
  const by = { a: 30, b: 2, c: 9 };
  assert.deepEqual(filterSummary(A, by, null), { text: 'All accounts (3) · 41 sessions', count: 41 });
  assert.deepEqual(filterSummary(A, by, 'c'), { text: 'zed only · 9 sessions', count: 9 });
  assert.deepEqual(filterSummary(A, { a: 1 }, 'a'), { text: 'aj only · 1 session', count: 1 });
  assert.equal(filterSummary(A, by, 'gone').text, 'All accounts (3) · 41 sessions');
});

test('splitDay narrows to one account', () => {
  const now = Date.now();
  const groups = [{ sessions: [{ accountId: 'a', title: 't', lastActiveMs: now }, { accountId: 'b', title: 'u', lastActiveMs: now }] }];
  assert.equal(splitDay(groups, now, '', 'a').today.length, 1);
  assert.equal(splitDay(groups, now, '', null).today.length, 2);
});
