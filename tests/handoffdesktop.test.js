import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const h = require('../desktop/handoff.js');
const { buildPtyCommand } = require('../desktop/launch.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'router-handoff-'));
const SID = '0123abcd-4567-89ef-0123-456789abcdef';

test('write: only inside .router-handoff, never overwrites, bad names refused', () => {
  const cwd = tmp();
  const r = h.write(cwd, '2026-10-18-x.md', 'hello');
  assert.equal(r.path, path.join(cwd, '.router-handoff', '2026-10-18-x.md'));
  assert.equal(fs.readFileSync(r.path, 'utf8'), 'hello');
  assert.throws(() => h.write(cwd, '2026-10-18-x.md', 'again'), /already in/);
  assert.equal(fs.readFileSync(r.path, 'utf8'), 'hello');
  for (const bad of ['../evil.md', '..', '.', 'a/b.md', 'a\\b.md', '', 'C:evil.md', 'x\0y']) {
    assert.throws(() => h.write(cwd, bad, 'x'), /not allowed/, JSON.stringify(bad));
  }
  assert.deepEqual(fs.readdirSync(cwd), ['.router-handoff']);
  assert.deepEqual(fs.readdirSync(path.join(cwd, '.router-handoff')), ['2026-10-18-x.md']);
  assert.throws(() => h.write(path.join(cwd, 'nope'), 'a.md', 'x'), /does not exist/);
  assert.deepEqual(h.list(cwd), ['2026-10-18-x.md']);
  assert.deepEqual(h.list(tmp()), []);
});

test('copyFile: copies into the folder, keeps both when the name is taken', () => {
  const cwd = tmp();
  const other = tmp();
  const src = path.join(other, 'pic.png');
  fs.writeFileSync(src, 'PNGDATA');
  const a = h.copyFile(cwd, src);
  assert.equal(a.name, 'pic.png');
  assert.equal(fs.readFileSync(a.path, 'utf8'), 'PNGDATA');
  const b = h.copyFile(cwd, src);
  assert.equal(b.name, 'pic-2.png');
  assert.deepEqual(h.list(cwd).sort(), ['pic-2.png', 'pic.png']);
  assert.throws(() => h.copyFile(cwd, other), /not a file/);
  assert.throws(() => h.copyFile(cwd, path.join(other, 'missing')), /could not be read/);
});

test('exclude: add and remove exactly one line, other lines untouched', () => {
  const repo = tmp();
  fs.mkdirSync(path.join(repo, '.git', 'info'), { recursive: true });
  const ex = path.join(repo, '.git', 'info', 'exclude');
  fs.writeFileSync(ex, '# comment\n*.log\n.router-handoff-old/\n');
  assert.equal(h.gitExcludeGet(repo), false);
  assert.equal(h.gitExcludeSet(repo, true), true);
  assert.equal(fs.readFileSync(ex, 'utf8'), '# comment\n*.log\n.router-handoff-old/\n.router-handoff/\n');
  assert.equal(h.gitExcludeGet(repo), true);
  h.gitExcludeSet(repo, true); // already on: no second line
  assert.equal(fs.readFileSync(ex, 'utf8').split('.router-handoff/').length, 2);
  assert.equal(h.gitExcludeSet(repo, false), false);
  assert.equal(fs.readFileSync(ex, 'utf8'), '# comment\n*.log\n.router-handoff-old/\n');
  assert.equal(h.gitExcludeGet(repo), false);
  // no trailing newline, and no exclude file at all
  fs.writeFileSync(ex, 'keep');
  h.gitExcludeSet(repo, true);
  assert.equal(fs.readFileSync(ex, 'utf8'), 'keep\n.router-handoff/\n');
  fs.rmSync(ex);
  assert.equal(h.gitExcludeGet(repo), false);
  h.gitExcludeSet(repo, true);
  assert.equal(fs.readFileSync(ex, 'utf8'), '.router-handoff/\n');
});

test('exclude: found from a sub-folder; not a repository is a clear error', () => {
  const repo = tmp();
  fs.mkdirSync(path.join(repo, '.git'));
  const sub = path.join(repo, 'a', 'b');
  fs.mkdirSync(sub, { recursive: true });
  h.gitExcludeSet(sub, true);
  assert.equal(fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf8'), '.router-handoff/\n');
  const plain = tmp();
  assert.throws(() => h.gitExcludeGet(plain), /Not a git repository/);
  assert.throws(() => h.gitExcludeSet(plain, true), /Not a git repository/);
});

test('exclude: a .git file pointing to a worktree gitdir is followed to the shared exclude', () => {
  const main = tmp();
  const wt = tmp();
  const gd = path.join(main, '.git', 'worktrees', 'w1');
  fs.mkdirSync(gd, { recursive: true });
  fs.writeFileSync(path.join(gd, 'commondir'), '../..\n');
  fs.writeFileSync(path.join(wt, '.git'), 'gitdir: ' + gd + '\n');
  h.gitExcludeSet(wt, true);
  assert.equal(fs.readFileSync(path.join(main, '.git', 'info', 'exclude'), 'utf8'), '.router-handoff/\n');
  assert.equal(h.gitExcludeGet(wt), true);
  assert.equal(fs.existsSync(path.join(gd, 'info')), false);
  // a relative gitdir (submodule style, no commondir)
  const sm = tmp();
  fs.mkdirSync(path.join(sm, 'real'));
  fs.mkdirSync(path.join(sm, 'sub'));
  fs.writeFileSync(path.join(sm, 'sub', '.git'), 'gitdir: ../real\n');
  h.gitExcludeSet(path.join(sm, 'sub'), true);
  assert.equal(fs.readFileSync(path.join(sm, 'real', 'info', 'exclude'), 'utf8'), '.router-handoff/\n');
});

test('exclude: real git agrees (ignored when on, not when off), in a real worktree too', (t) => {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch (e) { return t.skip('git is not installed here'); }
  const repo = tmp();
  const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g(repo, 'init', '-q');
  g(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x');
  const wt = path.join(tmp(), 'wt');
  g(repo, 'worktree', 'add', '-q', wt, '-b', 'other');
  h.write(wt, 'a.md', 'x');
  const ignored = () => { try { g(wt, 'check-ignore', '-q', '.router-handoff/a.md'); return true; } catch (e) { return false; } };
  assert.equal(ignored(), false);
  h.gitExcludeSet(wt, true);
  assert.equal(ignored(), true);
  h.gitExcludeSet(wt, false);
  assert.equal(ignored(), false);
});

test('summary: runs claude with the fork args in the session folder, returns stdout; errors are clear', async () => {
  const cwd = tmp();
  const calls = [];
  const fake = (code, out, err) => (file, args, o) => {
    calls.push({ file, args, o });
    const c = new EventEmitter();
    c.stdout = new EventEmitter();
    c.stderr = new EventEmitter();
    c.kill = () => { c.killed = true; };
    setImmediate(() => { if (out) c.stdout.emit('data', out); if (err) c.stderr.emit('data', err); c.emit('close', code); });
    return c;
  };
  const base = { sessionId: SID, cwd, accountDir: '/h/.claude-w', homeDir: '/h', env: { PATH: 'p' }, platform: 'linux', claudePath: '/bin/claude' };
  assert.equal(await h.summary({ ...base, spawnFn: fake(0, 'Goals: x\n') }), 'Goals: x\n');
  assert.equal(calls[0].file, '/bin/claude');
  assert.deepEqual(calls[0].args.slice(2), ['--resume', SID, '--fork-session', '--no-session-persistence', '--tools', 'Read,Grep,Glob']);
  assert.equal(calls[0].o.cwd, cwd);
  assert.equal(calls[0].o.env.CLAUDE_CONFIG_DIR, '/h/.claude-w');
  assert.deepEqual(calls[0].o.stdio, ['ignore', 'pipe', 'pipe']);
  await assert.rejects(h.summary({ ...base, spawnFn: fake(1, '', 'boom') }), /code 1.*boom/);
  await assert.rejects(h.summary({ ...base, spawnFn: fake(0, '  \n') }), /no summary/);
  await assert.rejects(h.summary({ ...base, claudePath: null }), /wasn't found/);
  const hang = () => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => { c.killed = true; }; return c; };
  await assert.rejects(h.summary({ ...base, spawnFn: hang, timeoutMs: 20 }), /longer than/);
});

test('sub-session links: saved, replaced per child, survive a re-read', () => {
  const f = path.join(tmp(), 'handoff-settings.json');
  assert.deepEqual(h.readLinks(f), []);
  h.addLink(f, 'c1', 'p1');
  h.addLink(f, 'c2', 'p1');
  h.addLink(f, 'c1', 'p2');
  assert.deepEqual(h.readLinks(f), [{ child: 'c2', parent: 'p1' }, { child: 'c1', parent: 'p2' }]);
  assert.throws(() => h.addLink(f, 'x', 'x'), /different parent/);
});

test('buildPtyCommand: fork adds --fork-session after --resume; fork without an id is refused', () => {
  const home = tmp(); const cwd = tmp();
  const o = { sessionId: SID, cwd, accountDir: path.join(home, '.claude'), homeDir: home, env: {}, platform: 'linux', claudePath: '/usr/bin/claude' };
  assert.deepEqual(buildPtyCommand({ ...o, fork: true }).args, ['--resume', SID, '--fork-session']);
  assert.deepEqual(buildPtyCommand(o).args, ['--resume', SID]);
  assert.throws(() => buildPtyCommand({ ...o, sessionId: null, fork: true }), /needs the id/);
});
