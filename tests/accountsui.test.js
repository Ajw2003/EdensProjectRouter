import test from 'node:test';
import assert from 'node:assert/strict';
import { accountLabel, validateAccountName, usageText, switchTargets, chooseNewSessionAccount } from '../site/js/accounts.js';

const accts = [
  { id: 'a', name: '.claude', email: 'a@x.com' },
  { id: 'b', name: '.claude-b', email: null },
  { id: 'c', name: '.claude-c', email: 'c@x.com', needsPermission: true },
];

test('accountLabel: email, else folder name', () => {
  assert.equal(accountLabel(accts[0]), 'a@x.com');
  assert.equal(accountLabel(accts[1]), '.claude-b');
});

test('validateAccountName matches the desktop rule', () => {
  assert.equal(validateAccountName(' work-2 '), 'work-2');
  for (const bad of ['', 'a b', 'a/b', '-x', 'a.b', null]) assert.throws(() => validateAccountName(bad), /letters, digits or dashes/);
});

test('switchTargets lists the other usable accounts with their usage', () => {
  const lim = { a: { fiveHourPct: 12.4, weeklyPct: 30 } };
  assert.deepEqual(switchTargets(accts, lim, 'a'), [{ id: 'b', label: '.claude-b', usage: 'no reading' }]);
  assert.equal(usageText(lim.a), '5-hour 12% · weekly 30%');
  assert.equal(usageText({ fiveHourPct: null, weeklyPct: 5 }), '5-hour ? · weekly 5%');
});

test('chooseNewSessionAccount: the pick if it still exists, else the default', () => {
  assert.equal(chooseNewSessionAccount(accts, 'b', 'a'), 'b');
  assert.equal(chooseNewSessionAccount(accts, 'gone', 'a'), 'a');
  assert.equal(chooseNewSessionAccount(accts, 'c', 'a'), 'a', 'needs permission');
  assert.equal(chooseNewSessionAccount(accts, null, 'a'), 'a');
});
