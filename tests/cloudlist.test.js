import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { createRequire } from 'node:module';
import { cloudToSessions, localCopyOf, createCloudCache, CLOUD_POLL_MS, cloudNotice } from '../site/js/cloudlist.js';
import { groupByProject } from '../site/js/discovery.js';
import { parseLayout, serializeLayout, openHere, openBeside, emptyLayout, paneId } from '../site/js/panes.js';
import { splitDay, keyOf } from '../site/js/sessionlist.js';

const { buildTeleportCommand } = createRequire(import.meta.url)('../desktop/launch.js');
const base = { cwd: os.tmpdir(), accountDir: '/h/.claude-two', homeDir: '/h', env: {} };

test('teleport: a good id gives --teleport <id> under that account', () => {
  const p = buildTeleportCommand({ ...base, teleport: 'session_01ABCdef', platform: 'linux', claudePath: '/usr/bin/claude' });
  assert.equal(p.file, '/usr/bin/claude');
  assert.deepEqual(p.args, ['--teleport', 'session_01ABCdef']);
  assert.equal(p.env.CLAUDE_CONFIG_DIR, '/h/.claude-two');
  assert.equal(p.cwd, os.tmpdir());
});

test('teleport: a bad id is refused', () => {
  for (const bad of ['', 'short', 'a b c d e f', 'x;rm -rf', 'a'.repeat(101), null, 5]) {
    assert.throws(() => buildTeleportCommand({ ...base, teleport: bad }), /cloud session id looks wrong/);
  }
});

test('teleport: on win32 a .cmd launcher is wrapped in cmd.exe', () => {
  const p = buildTeleportCommand({ ...base, teleport: 'session_01ABCdef', platform: 'win32', claudePath: 'C:\\n\\claude.cmd' });
  assert.equal(p.file, 'cmd.exe');
  assert.deepEqual(p.args, ['/d', '/s', '/c', 'C:\\n\\claude.cmd', '--teleport', 'session_01ABCdef']);
});

const cloud = [{ id: 'session_01A', title: 'Fix it', status: 'running', repo: 'me/widgets', repoName: 'widgets', lastActiveMs: 5000, url: 'https://claude.ai/code/session_01A' },
  { id: 'session_01B', title: '', status: 'idle', repo: '', repoName: '', lastActiveMs: 1000, url: '' }];

test('cloud sessions join the group of local sessions with the same project name', () => {
  const local = { accountId: 'a', id: 'u1', title: 'local', project: 'widgets', cwd: '/w/widgets', lastActiveMs: 3000 };
  const groups = groupByProject([local, ...cloudToSessions('a', cloud)]);
  const w = groups.find((g) => g.project === 'widgets');
  assert.deepEqual(w.sessions.map((s) => s.id), ['session_01A', 'u1']);
  assert.equal(w.sessions[0].cloud, true);
  assert.equal(groups.find((g) => g.project === 'Cloud').sessions[0].title, 'Untitled cloud session');
  assert.equal(splitDay(groups, 6000, '', null).today.length, 3);
});

test('localCopyOf picks the newest local session of that project and ignores cloud ones', () => {
  const groups = groupByProject([
    { accountId: 'a', id: 'u1', project: 'widgets', cwd: '/old', lastActiveMs: 1 }, { accountId: 'a', id: 'u2', project: 'widgets', cwd: '/new', lastActiveMs: 9 },
    ...cloudToSessions('a', cloud)]);
  assert.equal(localCopyOf(groups, 'widgets').cwd, '/new');
  assert.equal(localCopyOf(groups, 'nothing'), null);
});

test('cloud cache: reads at most every 30 s, never blocks, a failure keeps the earlier sessions', async () => {
  let t = 0; let calls = 0; let fail = false; let changed = 0;
  const c = createCloudCache(async () => { calls++; if (fail) throw new Error('boom'); return { state: 'ok', message: '', sessions: cloud }; }, () => changed++, () => t);
  assert.equal(c.get(['a']).sessions.length, 0); // the first call returns at once, the read runs behind
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(c.get(['a']).sessions.length, 2);
  assert.equal(calls, 1);
  t = CLOUD_POLL_MS - 1; c.get(['a']); assert.equal(calls, 1);
  t = CLOUD_POLL_MS; fail = true; c.get(['a']);
  await new Promise((r) => setTimeout(r, 5));
  const g = c.get(['a']);
  assert.equal(calls, 2);
  assert.equal(g.sessions.length, 2);
  assert.deepEqual(g.states.a, { state: 'error', message: 'boom' });
  assert.ok(changed >= 2);
});

test('panes: a cloud pane has the list row key and survives save and restore', () => {
  const params = { kind: 'cloud', accountId: 'a', cloudId: 'session_01A', title: 'Fix it', repo: 'me/widgets', status: 'running', url: 'https://claude.ai/code/session_01A' };
  assert.equal(paneId(params), keyOf({ accountId: 'a', id: 'session_01A' }));
  let l = openHere(emptyLayout(), params);
  l = openBeside(l, { kind: 'session', accountId: 'a', sessionId: 'u1', cwd: '/p', project: 'p', title: 't' });
  const back = parseLayout(JSON.parse(serializeLayout(l)));
  assert.deepEqual(back.panes.map((p) => p.id), ['a|session_01A', 'a|u1']);
  assert.deepEqual(back.panes[0].params, params);
  assert.equal(parseLayout({ panes: [{ params: { kind: 'cloud', accountId: 'a' } }] }).panes.length, 0); // no cloud id: dropped
});

test('cloudNotice: expired says what to do, error shows the message, no-sign-in and ok show nothing', () => {
  const e = cloudNotice({ state: 'expired', message: '' });
  assert.equal(e.text, 'Sign-in out of date: cloud sessions for this account are not shown. Open Claude Code once in this account to sign in again; this notice goes away by itself.');
  const r = cloudNotice({ state: 'error', message: 'timed out' });
  assert.equal(r.text, 'Cloud sessions could not be read: timed out');
  assert.equal(cloudNotice({ state: 'no-sign-in' }), null);
  assert.equal(cloudNotice({ state: 'ok' }), null);
  assert.equal(cloudNotice(undefined), null);
});

test('an expired notice clears by itself once the sign-in is renewed and the next 30 s read runs', async () => {
  let t = 1000; let state = 'expired';
  const cache = createCloudCache(async () => (state === 'expired' ? { state, message: '', sessions: [] } : { state, message: '', sessions: [{ id: 'c1' }] }), () => {}, () => t);
  cache.get(['a']);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(cloudNotice(cache.get(['a']).states.a));
  state = 'ok'; t += CLOUD_POLL_MS;
  cache.get(['a']);
  await new Promise((r) => setTimeout(r, 5));
  const g = cache.get(['a']);
  assert.equal(cloudNotice(g.states.a), null);
  assert.equal(g.sessions.length, 1);
});
