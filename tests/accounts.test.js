import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { findAccounts, readEmail, validateAccountName } = require('../desktop/accounts.js');
const { buildLoginCommand } = require('../desktop/launch.js');
const { copySession } = require('../desktop/transfer.js');
const fsSource = require('../desktop/fsSource.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'router-acct-'));
const mk = (...p) => fs.mkdirSync(path.join(...p), { recursive: true });
const mail = (e) => JSON.stringify({ oauthAccount: { emailAddress: e } });

test('readEmail: folder file, home file for .claude, missing, bad JSON (logged)', () => {
  const home = tmp();
  mk(home, '.claude');
  mk(home, '.claude-work');
  const logs = [];
  const log = (m) => logs.push(m);
  assert.equal(readEmail(path.join(home, '.claude'), home, log), null, 'missing -> null');
  assert.equal(logs.length, 0, 'missing is not an error');
  fs.writeFileSync(path.join(home, '.claude.json'), mail('home@x.com'));
  assert.equal(readEmail(path.join(home, '.claude'), home, log), 'home@x.com');
  assert.equal(readEmail(path.join(home, '.claude-work'), home, log), null, 'home file is only for .claude');
  fs.writeFileSync(path.join(home, '.claude-work', '.claude.json'), mail('work@x.com'));
  assert.equal(readEmail(path.join(home, '.claude-work'), home, log), 'work@x.com');
  fs.writeFileSync(path.join(home, '.claude', '.claude.json'), mail('folder@x.com'));
  assert.equal(readEmail(path.join(home, '.claude'), home, log), 'folder@x.com', 'folder file first');
  fs.writeFileSync(path.join(home, '.claude', '.claude.json'), '{oops');
  assert.equal(readEmail(path.join(home, '.claude'), home, log), 'home@x.com', 'bad folder file falls through');
  assert.equal(logs.length, 1);
  assert.match(logs[0], /Could not parse/);
  fs.writeFileSync(path.join(home, '.claude-work', '.claude.json'), '{"oauthAccount":{}}');
  assert.equal(readEmail(path.join(home, '.claude-work'), home, log), null);
});

test('validateAccountName: letters, digits, dash only', () => {
  assert.equal(validateAccountName(' work-2 '), 'work-2');
  for (const bad of ['', 'a b', 'a/b', '..', '-x', 'a.b', 'x'.repeat(33), null, 5]) {
    assert.throws(() => validateAccountName(bad), /letters, digits or dashes/, String(bad));
  }
});

test('buildLoginCommand: auth login with CLAUDE_CONFIG_DIR set, cmd.exe wrapper for .cmd on Windows', () => {
  const home = tmp();
  const dir = path.join(home, '.claude-new');
  const base = { PATH: 'x', CLAUDE_CONFIG_DIR: 'stale' };
  const p = buildLoginCommand({ accountDir: dir, homeDir: home, env: base, platform: 'linux', claudePath: '/bin/claude' });
  assert.equal(p.file, '/bin/claude');
  assert.deepEqual(p.args, ['auth', 'login']);
  assert.equal(p.cwd, home);
  assert.equal(p.env.CLAUDE_CONFIG_DIR, dir);
  assert.equal(p.env.PATH, 'x');
  assert.equal(base.CLAUDE_CONFIG_DIR, 'stale');
  const w = buildLoginCommand({ accountDir: dir, homeDir: home, env: base, platform: 'win32', claudePath: 'C:\\n\\claude.cmd' });
  assert.equal(w.file, 'cmd.exe');
  assert.deepEqual(w.args, ['/d', '/s', '/c', 'C:\\n\\claude.cmd', 'auth', 'login']);
  assert.throws(() => buildLoginCommand({ accountDir: dir, homeDir: path.join(home, 'nope'), env: base }), /no longer exists/);
});

test('findAccounts: a signed-in .claude-* folder without projects is found; other folders are not', () => {
  const home = tmp();
  mk(home, '.claude', 'projects');
  mk(home, '.claude-new');
  fs.writeFileSync(path.join(home, '.claude-new', '.claude.json'), mail('n@x.com'));
  mk(home, '.claude-blank');
  mk(home, '.other');
  fs.writeFileSync(path.join(home, '.other', '.claude.json'), '{}');
  assert.deepEqual(findAccounts(home, {}).map((a) => a.id), ['.claude', '.claude-new']);
});

test('fsSource: listSessionFiles on a folder with no projects is empty', async () => {
  assert.deepEqual(await fsSource.listSessionFiles(tmp()), []);
});

test('copySession: copies transcript and sibling folder, keeps the original, never overwrites a newer file', () => {
  const from = tmp();
  const to = tmp();
  const id = '0a1b2c3d-1111-2222-3333-444455556666';
  const proj = '-home-me-proj';
  mk(from, 'projects', proj, id, 'subagents');
  const src = path.join(from, 'projects', proj, id + '.jsonl');
  fs.writeFileSync(src, 'OLD\n');
  fs.writeFileSync(path.join(from, 'projects', proj, id, 'subagents', 'a.jsonl'), 'sub\n');
  const t0 = new Date(Date.now() - 60000);
  fs.utimesSync(src, t0, t0);
  const r = copySession(from, to, proj, id);
  const dst = path.join(to, 'projects', proj, id + '.jsonl');
  assert.equal(fs.readFileSync(dst, 'utf8'), 'OLD\n');
  assert.equal(fs.readFileSync(path.join(to, 'projects', proj, id, 'subagents', 'a.jsonl'), 'utf8'), 'sub\n');
  assert.equal(r.copied.length, 2);
  assert.equal(fs.readFileSync(src, 'utf8'), 'OLD\n', 'original kept');
  assert.ok(fs.existsSync(path.join(from, 'projects', proj, id, 'subagents', 'a.jsonl')), 'original sibling kept');
  // A newer file at the target is left alone.
  fs.writeFileSync(dst, 'NEWER\n');
  const r2 = copySession(from, to, proj, id);
  assert.equal(fs.readFileSync(dst, 'utf8'), 'NEWER\n');
  assert.ok(r2.skipped.includes(dst));
  // An older file at the target is replaced.
  const past = new Date(Date.now() - 600000);
  fs.utimesSync(dst, past, past);
  copySession(from, to, proj, id);
  assert.equal(fs.readFileSync(dst, 'utf8'), 'OLD\n');
  // Works without a sibling folder, and refuses bad input.
  const id2 = '0a1b2c3d-9999-2222-3333-444455556666';
  fs.writeFileSync(path.join(from, 'projects', proj, id2 + '.jsonl'), 'x\n');
  assert.equal(copySession(from, to, proj, id2).copied.length, 1);
  assert.throws(() => copySession(from, to, '..', id), /Bad name/);
  assert.throws(() => copySession(from, to, proj, 'abc; rm'), /session id/);
  assert.throws(() => copySession(from, from, proj, id), /same account/);
  assert.throws(() => copySession(from, to, proj, '0a1b2c3d-0000'), /not found/);
});
