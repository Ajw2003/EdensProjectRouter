import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { isFull, continueTarget, accountChoices, duplicateAccount } from '../site/js/accounts.js';
const { buildPtyCommand } = createRequire(import.meta.url)('../desktop/launch.js');

const accts = [
  { id: '.claude', name: '.claude', email: 'a@x.com' },
  { id: '.claude-two', name: '.claude-two', email: 'b@x.com' },
  { id: '.claude-three', name: '.claude-three', email: null },
];

test('a session opens on the account it last used (no hidden switch)', () => {
  const o = { sessionId: '11111111-1111-4111-8111-111111111111', cwd: process.cwd(), homeDir: '/h', env: { CLAUDE_CONFIG_DIR: '/other' } };
  assert.equal(buildPtyCommand({ ...o, accountDir: '/h/.claude-two' }).env.CLAUDE_CONFIG_DIR, '/h/.claude-two');
  assert.equal(buildPtyCommand({ ...o, accountDir: '/h/.claude' }).env.CLAUDE_CONFIG_DIR, undefined);
});

test('suggestion: the account with the most room is first and marked', () => {
  const lim = { '.claude': { fiveHourPct: 80, weeklyPct: 10 }, '.claude-two': { fiveHourPct: 20, weeklyPct: 10 } };
  const c = accountChoices(accts, lim);
  assert.deepEqual(c.map((x) => [x.id, x.suggested]), [['.claude-two', true], ['.claude', false], ['.claude-three', false]]);
  assert.equal(accountChoices([], {}).length, 0);
});

test('isFull: five-hour or weekly at 100', () => {
  assert.equal(isFull({ fiveHourPct: 100, weeklyPct: 3 }), true);
  assert.equal(isFull({ fiveHourPct: 3, weeklyPct: 100 }), true);
  assert.equal(isFull({ fiveHourPct: 99, weeklyPct: null }), false);
  assert.equal(isFull(undefined), false);
});

test('continueTarget: only a full account offers a handoff, to the other with most room', () => {
  const lim = { '.claude': { fiveHourPct: 100, weeklyPct: 5 }, '.claude-two': { fiveHourPct: 60, weeklyPct: 5 }, '.claude-three': { fiveHourPct: 10, weeklyPct: 5 } };
  assert.equal(continueTarget(accts, lim, '.claude').id, '.claude-three');
  assert.equal(continueTarget(accts, lim, '.claude-two'), null);
  lim['.claude-three'].weeklyPct = 100; // that one is full too
  assert.equal(continueTarget(accts, lim, '.claude').id, '.claude-two');
  lim['.claude-two'].fiveHourPct = 100;
  assert.equal(continueTarget(accts, lim, '.claude'), null);
});

test('duplicateAccount: by folder and by email, any number of accounts otherwise', () => {
  assert.equal(duplicateAccount(accts, { folder: '.claude-two' }).id, '.claude-two');
  assert.equal(duplicateAccount(accts, { email: 'A@X.com' }).id, '.claude');
  assert.equal(duplicateAccount(accts, { folder: '.claude-four', email: 'new@x.com' }), null);
  assert.equal(duplicateAccount(accts, { folder: '.claude-four', email: null }), null);
});
