import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { findAccounts } = require('../desktop/accounts.js');
const { buildResumeCommand, buildNewSessionCommand } = require('../desktop/launch.js');
const fsSource = require('../desktop/fsSource.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'router-desk-'));
const mk = (...p) => fs.mkdirSync(path.join(...p), { recursive: true });

test('findAccounts: .claude first, projects/ required, CLAUDE_CONFIG_DIR added and deduped', () => {
  const home = tmp();
  const elsewhere = tmp();
  mk(home, '.claude', 'projects');
  mk(home, '.claude-work', 'projects');
  mk(home, '.claude-spare', 'projects');
  mk(home, '.claude-empty');
  mk(home, '.other', 'projects');
  mk(elsewhere, 'projects');
  const base = findAccounts(home, {});
  assert.deepEqual(base.map((a) => a.id), ['.claude', '.claude-spare', '.claude-work']);
  const withEnv = findAccounts(home, { CLAUDE_CONFIG_DIR: elsewhere });
  assert.equal(withEnv.length, 4);
  assert.ok(withEnv.some((a) => a.dir === path.resolve(elsewhere)));
  const dup = findAccounts(home, { CLAUDE_CONFIG_DIR: path.join(home, '.claude-work') });
  assert.equal(dup.length, 3);
  assert.equal(findAccounts(home, { CLAUDE_CONFIG_DIR: path.join(home, 'nope') }).length, 3);
});

test('launch: windows shapes, env for default and non-default accounts', () => {
  const home = tmp();
  const cwd = tmp();
  mk(home, '.claude');
  const id = '0a1b2c3d-1111-2222-3333-444455556666';
  const baseEnv = { PATH: 'x', CLAUDE_CONFIG_DIR: 'stale' };
  const def = buildResumeCommand(id, cwd, { homeDir: home, accountDir: path.join(home, '.claude'), env: baseEnv, platform: 'win32' });
  assert.equal(def.file, 'wt.exe');
  assert.deepEqual(def.args, ['-d', cwd, 'cmd', '/k', 'claude --resume ' + id]);
  assert.equal(def.cwd, cwd);
  assert.equal('CLAUDE_CONFIG_DIR' in def.env, false);
  assert.equal(def.env.PATH, 'x');
  const work = path.join(home, '.claude-work');
  const alt = buildResumeCommand(id, cwd, { homeDir: home, accountDir: work, env: baseEnv, platform: 'win32', useWt: false });
  assert.equal(alt.file, 'cmd.exe');
  assert.deepEqual(alt.args, ['/c', 'start', '"Project Router"', 'cmd', '/k', 'claude --resume ' + id]);
  assert.equal(alt.env.CLAUDE_CONFIG_DIR, work);
  const nu = buildNewSessionCommand(cwd, { homeDir: home, accountDir: work, env: baseEnv, platform: 'win32' });
  assert.deepEqual(nu.args, ['-d', cwd, 'cmd', '/k', 'claude']);
  assert.equal(nu.env.CLAUDE_CONFIG_DIR, work);
  assert.equal(baseEnv.CLAUDE_CONFIG_DIR, 'stale', 'input env not mutated');
});

test('launch: refuses bad ids and missing folders', () => {
  const home = tmp();
  const cwd = tmp();
  const o = { homeDir: home, accountDir: path.join(home, '.claude'), env: {}, platform: 'win32' };
  assert.throws(() => buildResumeCommand('abc; del', cwd, o), /session id/);
  assert.throws(() => buildResumeCommand('', cwd, o), /session id/);
  assert.throws(() => buildResumeCommand('0a1b2c3d-1111', path.join(cwd, 'missing'), o), /no longer exists/);
  assert.throws(() => buildNewSessionCommand(path.join(cwd, 'missing'), o), /no longer exists/);
});

function account() {
  const dir = tmp();
  mk(dir, 'projects', 'p1');
  mk(dir, 'projects', 'p1', 'subdir');
  return dir;
}

test('fsSource: lists top-level jsonl only; reads small file whole, big file head+tail', async () => {
  const dir = account();
  const p = path.join(dir, 'projects', 'p1');
  fs.writeFileSync(path.join(p, 'a.jsonl'), '{"a":1}\n{"b":2}\n');
  fs.writeFileSync(path.join(p, 'note.txt'), 'x');
  fs.writeFileSync(path.join(p, 'subdir', 'c.jsonl'), '{}');
  const files = await fsSource.listSessionFiles(dir);
  assert.deepEqual(files.map((f) => f.file), ['a.jsonl']);
  assert.equal(files[0].project, 'p1');
  assert.equal(files[0].size, 16);
  assert.deepEqual(await fsSource.readSessionText(dir, 'p1', 'a.jsonl'), { text: '{"a":1}\n{"b":2}\n', wasCut: false });

  const lines = [];
  for (let i = 0; i < 12000; i++) lines.push(JSON.stringify({ i, pad: 'x'.repeat(40) }));
  fs.writeFileSync(path.join(p, 'big.jsonl'), lines.join('\n') + '\n');
  const r = await fsSource.readSessionText(dir, 'p1', 'big.jsonl');
  assert.equal(r.wasCut, true);
  const out = r.text.split('\n');
  assert.equal(JSON.parse(out[0]).i, 0);
  assert.ok(r.joinLine > 0 && r.joinLine < out.length);
  for (const l of out.slice(0, r.joinLine)) JSON.parse(l); // head is whole lines
  assert.ok(r.text.length <= 64 * 1024 + 256 * 1024 + 2);
  assert.ok(r.text.endsWith(lines[lines.length - 1] + '\n'));
  await assert.rejects(fsSource.readSessionText(dir, '..', 'a.jsonl'), /Bad name/);
});

test('fsSource: readStatus returns good files and flags bad ones; none -> []', async () => {
  const dir = account();
  assert.deepEqual(await fsSource.readStatus(dir), []);
  mk(dir, 'router', 'status');
  fs.writeFileSync(path.join(dir, 'router', 'status', 's1.json'), '{"sessionId":"s1"}');
  fs.writeFileSync(path.join(dir, 'router', 'status', 's2.json'), '{oops');
  const s = await fsSource.readStatus(dir);
  assert.equal(s.length, 2);
  assert.ok(s.some((x) => x.sessionId === 's1'));
  assert.ok(s.some((x) => x.error === 'bad-status-file'));
});

test('fsSource: setReporter on then off restores settings.json exactly (with and without prior statusLine)', async () => {
  for (const original of [
    JSON.stringify({ theme: 'dark', statusLine: { type: 'command', command: 'echo hi' } }, null, 2) + '\n',
    JSON.stringify({ theme: 'dark' }, null, 2) + '\n',
  ]) {
    const dir = account();
    const sp = path.join(dir, 'settings.json');
    fs.writeFileSync(sp, original);
    assert.equal(await fsSource.reporterState(dir), 'off');
    await fsSource.setReporter(dir, true);
    assert.equal(await fsSource.reporterState(dir), 'on');
    assert.equal(fs.readFileSync(sp + '.router-backup', 'utf8'), original);
    assert.ok(fs.existsSync(path.join(dir, 'router', 'previous-statusline.json')));
    await fsSource.setReporter(dir, true); // second install keeps the first previous line
    await fsSource.setReporter(dir, false);
    assert.equal(await fsSource.reporterState(dir), 'off');
    assert.equal(fs.readFileSync(sp, 'utf8'), original);
  }
});

test('fsSource: setReporter leaves invalid settings.json alone', async () => {
  const dir = account();
  const sp = path.join(dir, 'settings.json');
  fs.writeFileSync(sp, '{not json');
  await assert.rejects(fsSource.setReporter(dir, true));
  assert.equal(fs.readFileSync(sp, 'utf8'), '{not json');
});

test('fsSource: claudeRunning returns a boolean', async () => {
  assert.equal(typeof (await fsSource.claudeRunning()), 'boolean');
});
