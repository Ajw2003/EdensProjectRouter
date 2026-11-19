import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { loginKey, groupLogins, ownerId, desktopOnlyAccounts, accountChoices, filterSummary } from '../site/js/accounts.js';
import { splitDay } from '../site/js/sessionlist.js';

const require = createRequire(import.meta.url);
const { readDesktopOwners } = require('../desktop/desktopowners.js');
const { findAccounts, readLogin, readEmail } = require('../desktop/accounts.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'router-owners-'));
const put = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const U = (n) => '00000000-0000-4000-8000-' + String(n).repeat(12).slice(0, 12); // U(1) ends 111111
const login = (email, uuid) => JSON.stringify({ oauthAccount: { emailAddress: email, accountUuid: uuid } });

test('readDesktopOwners: two accounts, backlog sub-folder, settings file, broken file, only cliSessionId read', () => {
  const base = tmp();
  const root = path.join(base, 'pkg', 'claude-code-sessions');
  put(path.join(root, U(1), 'org', 'local_a.json'), JSON.stringify({ cliSessionId: 's1', title: 'SECRET TITLE' }));
  put(path.join(root, U(1), 'org', 'backlog', 'local_b.json'), JSON.stringify({ cliSessionId: 's2' }));
  put(path.join(root, U(2), 'org', 'local_c.json'), JSON.stringify({ cliSessionId: 's3' }));
  put(path.join(root, U(2), 'org', 'local_task.json'), JSON.stringify({ title: 'scheduled' }));
  put(path.join(root, U(2), 'org', 'local_bad.json'), '{oops');
  const r = readDesktopOwners({ ROUTER_DESKTOP_DATA: base }, 'linux');
  assert.deepEqual(r.sessions, { s1: U(1), s2: U(1), s3: U(2) });
  assert.deepEqual(r.accounts.sort(), [U(1), U(2)]);
  assert.equal(r.warnings.length, 1);
  assert.ok(!JSON.stringify(r).includes('SECRET'));
});

test('readDesktopOwners: missing base or other platform is empty', () => {
  assert.deepEqual(readDesktopOwners({ ROUTER_DESKTOP_DATA: path.join(tmp(), 'nope') }, 'win32'), { sessions: {}, accounts: [], warnings: [] });
  assert.deepEqual(readDesktopOwners({}, 'linux'), { sessions: {}, accounts: [], warnings: [] });
});

test('readLogin: own file, home fallback for .claude, missing, broken; readEmail still works', () => {
  const home = tmp();
  fs.mkdirSync(path.join(home, '.claude'));
  fs.mkdirSync(path.join(home, '.claude-w'));
  const logs = [];
  assert.deepEqual(readLogin(path.join(home, '.claude'), home, (m) => logs.push(m)), { email: null, accountUuid: null });
  put(path.join(home, '.claude.json'), login('h@x.com', U(1)));
  assert.deepEqual(readLogin(path.join(home, '.claude'), home), { email: 'h@x.com', accountUuid: U(1) });
  assert.deepEqual(readLogin(path.join(home, '.claude-w'), home), { email: null, accountUuid: null }, 'home file only for .claude');
  put(path.join(home, '.claude-w', '.claude.json'), login('w@x.com', U(2)));
  assert.deepEqual(readLogin(path.join(home, '.claude-w'), home), { email: 'w@x.com', accountUuid: U(2) });
  put(path.join(home, '.claude', '.claude.json'), '{oops');
  assert.equal(readLogin(path.join(home, '.claude'), home, (m) => logs.push(m)).accountUuid, U(1));
  assert.equal(logs.length, 1);
  assert.equal(readEmail(path.join(home, '.claude-w'), home), 'w@x.com');
});

const f = (id, email, accountUuid) => ({ id, name: id, email, accountUuid });

test('loginKey and groupLogins: same uuid groups, .claude is primary, case differences, unknown stays unique', () => {
  assert.equal(loginKey(f('a', 'X@y.com')), loginKey(f('b', ' x@Y.com ')));
  assert.notEqual(loginKey(f('a')), loginKey(f('b')));
  const g = groupLogins([
    f('.claude-account2', 'a@x.com', U(1)), f('.claude', null, U(1)), f('.claude-Ayden', 'b@x.com', U(2)),
    f('.claude-qa', 'c@x.com', U(3)), f('.claude-AydenjWilkins', 'c@x.com', U(3)), f('.claude-zz'),
  ]);
  assert.deepEqual(g.map((a) => a.id), ['.claude', '.claude-Ayden', '.claude-AydenjWilkins', '.claude-zz']);
  assert.deepEqual(g[0].memberIds, ['.claude-account2']);
  assert.deepEqual(g[2].memberIds, ['.claude-qa']);
  assert.deepEqual(g[3].memberIds, []);
  assert.equal(groupLogins([f('.claude-b', 'a@x.com', U(1)), f('.claude-A', 'a@x.com', U(1))])[0].id, '.claude-A');
});

test('hidden primary: the next folder of that login becomes primary', () => {
  const all = [f('.claude', null, U(1)), f('.claude-account2', 'a@x.com', U(1))];
  const shown = all.filter((a) => a.id !== '.claude'); // hidden folders are not in the list
  const g = groupLogins(shown);
  assert.equal(g.length, 1);
  assert.equal(g[0].id, '.claude-account2');
});

test('ownerId: desktop mapping, fallback to the stored folder, synthetic desktop-only', () => {
  const accts = [f('.claude', null, U(1)), f('.claude-two', 'a@x.com', U(1)), f('.claude-b', 'b@x.com', U(2))];
  const desktop = { sessions: { s1: U(2), s2: U(4) }, accounts: [U(1), U(2), U(4)] };
  assert.equal(ownerId({ id: 's1', accountId: '.claude' }, accts, desktop), '.claude-b');
  assert.equal(ownerId({ id: 's9', accountId: '.claude-two' }, accts, desktop), '.claude', 'stored in a member folder -> group primary');
  assert.equal(ownerId({ id: 's2', accountId: '.claude' }, accts, desktop), 'desktop-444444');
  assert.equal(ownerId({ id: 's9', accountId: '.claude-b' }, accts, null), '.claude-b');
  const only = desktopOnlyAccounts(accts, desktop);
  assert.deepEqual(only.map((a) => [a.id, a.name, a.email, a.desktopOnly]), [['desktop-444444', 'Desktop 444444', '', true]]);
});

test('filter line counts and badge by owner; New session has one entry per login and no desktop-only', () => {
  const accts = [f('.claude', null, U(1)), f('.claude-two', 'a@x.com', U(1))];
  const desktop = { sessions: { s2: U(4) }, accounts: [U(1), U(4)] };
  const display = [...groupLogins(accts), ...desktopOnlyAccounts(accts, desktop)];
  const mk = (id, accountId, lastActiveMs) => ({ id, accountId, lastActiveMs, title: id, project: 'p' });
  const ss = [mk('s1', '.claude-two', 3), mk('s2', '.claude', 2), mk('s3', '.claude', 1)].map((s) => ({ ...s, ownerId: ownerId(s, accts, desktop) }));
  const by = {};
  for (const s of ss) by[s.ownerId] = (by[s.ownerId] || 0) + 1;
  assert.equal(filterSummary(display, by, null).text, 'All accounts (2) · 3 sessions');
  assert.equal(filterSummary(display, by, 'desktop-444444').text, 'Desktop 444444 only · 1 session');
  const { today, earlier } = splitDay([{ sessions: ss }], 10 * 86400000, '', '.claude');
  assert.deepEqual([...today, ...earlier].map((s) => s.id), ['s1', 's3']);
  assert.equal(accountChoices(groupLogins(accts), {}).length, 1);
});

test('end to end: fake home with four folders and a fake desktop data folder', () => {
  const home = tmp();
  const data = tmp();
  const A = U(1), B = U(2), C = U(3), D = U(4);
  put(path.join(home, '.claude.json'), login('a@x.com', A));
  put(path.join(home, '.claude-account2', '.claude.json'), login('a@x.com', A));
  put(path.join(home, '.claude-Ayden', '.claude.json'), login('b@x.com', B));
  put(path.join(home, '.claude-AydenjWilkins', '.claude.json'), login('c@x.com', C));
  put(path.join(home, '.claude-qa', '.claude.json'), login('c@x.com', C));
  const t = (dir, id) => put(path.join(home, dir, 'projects', 'p', id + '.jsonl'), '{}\n');
  // .claude holds everything the desktop app wrote: 2 for A, 1 for B, 2 for C, 1 for D, 1 with no desktop owner.
  for (const id of ['a1', 'a2', 'b1', 'c1', 'c2', 'd1', 'plain']) t('.claude', id);
  t('.claude-qa', 'qa1'); // a CLI session stored in a member folder of C, no desktop record
  const owners = { a1: A, a2: A, b1: B, c1: C, c2: C, d1: D };
  for (const [id, u] of Object.entries(owners)) put(path.join(data, 'pkg', 'claude-code-sessions', u, 'org', 'local_' + id + '.json'), JSON.stringify({ cliSessionId: id }));
  const desktop = readDesktopOwners({ ROUTER_DESKTOP_DATA: data }, 'linux');
  const folders = findAccounts(home, {}).map((a) => ({ ...a, ...readLogin(a.dir, home) }));
  const display = [...groupLogins(folders), ...desktopOnlyAccounts(folders, desktop)];
  assert.deepEqual(display.map((a) => a.id), ['.claude', '.claude-Ayden', '.claude-AydenjWilkins', 'desktop-444444']);
  const counts = {};
  for (const a of folders) {
    for (const file of fs.existsSync(path.join(a.dir, 'projects', 'p')) ? fs.readdirSync(path.join(a.dir, 'projects', 'p')) : []) {
      const o = ownerId({ id: file.replace('.jsonl', ''), accountId: a.id }, folders, desktop);
      counts[o] = (counts[o] || 0) + 1;
    }
  }
  assert.deepEqual(counts, { '.claude': 3, '.claude-Ayden': 1, '.claude-AydenjWilkins': 3, 'desktop-444444': 1 });
  // The check script gives the same picture with masked emails and no ids of messages.
  const out = execFileSync(process.execPath, [new URL('../desktop/scripts/check-real-accounts.cjs', import.meta.url).pathname, home], { env: { ...process.env, ROUTER_DESKTOP_DATA: data } }).toString();
  assert.match(out, /a\*\*\*@x\.com\s+\.\.\.111111\s+3 sessions/);
  assert.match(out, /desktop only/);
  assert.match(out, /no desktop owner.*: 2/);
});
