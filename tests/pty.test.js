import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildPtyCommand } = require('../desktop/launch.js');
const { createPtyManager } = require('../desktop/pty.js');
const fsSource = require('../desktop/fsSource.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'router-pty-'));
const mk = (...p) => fs.mkdirSync(path.join(...p), { recursive: true });
const SID = '0123abcd-4567-89ef-0123-456789abcdef';

test('buildPtyCommand: resume uses --resume id; new session has no args', () => {
  const home = tmp(); mk(home, '.claude'); const cwd = tmp();
  const r = buildPtyCommand({ sessionId: SID, cwd, accountDir: path.join(home, '.claude'), homeDir: home, env: {}, platform: 'linux', claudePath: '/usr/bin/claude' });
  assert.equal(r.file, '/usr/bin/claude');
  assert.deepEqual(r.args, ['--resume', SID]);
  assert.equal(r.cwd, cwd);
  assert.equal(r.env.TERM, 'xterm-256color');
  const n = buildPtyCommand({ sessionId: null, cwd, accountDir: path.join(home, '.claude'), homeDir: home, env: {}, platform: 'linux', claudePath: '/usr/bin/claude' });
  assert.deepEqual(n.args, []);
});

test('buildPtyCommand: CLAUDE_CONFIG_DIR unset for default account, set for others', () => {
  const home = tmp(); const cwd = tmp();
  const base = { CLAUDE_CONFIG_DIR: '/stale', PATH: 'x' };
  const d = buildPtyCommand({ sessionId: null, cwd, accountDir: path.join(home, '.claude'), homeDir: home, env: base, platform: 'linux', claudePath: 'claude' });
  assert.equal('CLAUDE_CONFIG_DIR' in d.env, false);
  assert.equal(d.env.PATH, 'x');
  const w = path.join(home, '.claude-work');
  const o = buildPtyCommand({ sessionId: null, cwd, accountDir: w, homeDir: home, env: base, platform: 'linux', claudePath: 'claude' });
  assert.equal(o.env.CLAUDE_CONFIG_DIR, w);
  assert.equal(base.CLAUDE_CONFIG_DIR, '/stale');
});

test('buildPtyCommand: win32 .exe direct, .cmd wrapped in cmd.exe', () => {
  const home = tmp(); const cwd = tmp();
  const common = { sessionId: SID, cwd, accountDir: path.join(home, '.claude'), homeDir: home, env: {}, platform: 'win32' };
  const e = buildPtyCommand({ ...common, claudePath: 'C:\\bin\\claude.exe' });
  assert.equal(e.file, 'C:\\bin\\claude.exe');
  assert.deepEqual(e.args, ['--resume', SID]);
  const c = buildPtyCommand({ ...common, claudePath: 'C:\\npm\\claude.cmd' });
  assert.equal(c.file, 'cmd.exe');
  assert.deepEqual(c.args, ['/d', '/s', '/c', 'C:\\npm\\claude.cmd', '--resume', SID]);
});

test('buildPtyCommand: bad id and missing folder are rejected', () => {
  const home = tmp(); const cwd = tmp();
  const base = { cwd, accountDir: path.join(home, '.claude'), homeDir: home, env: {}, platform: 'linux', claudePath: 'claude' };
  assert.throws(() => buildPtyCommand({ ...base, sessionId: 'abc; whoami' }), /session id/);
  assert.throws(() => buildPtyCommand({ ...base, sessionId: 42 }), /session id/);
  assert.throws(() => buildPtyCommand({ ...base, sessionId: SID, cwd: path.join(cwd, 'nope') }), /no longer exists/);
});

test('readTranscript: reads from a byte, caps at 5 MB from the end, rejects escaping names', async () => {
  const dir = tmp(); mk(dir, 'projects', 'p');
  const f = path.join(dir, 'projects', 'p', 's.jsonl');
  fs.writeFileSync(f, 'aaa\nbbb\nccc\n');
  assert.deepEqual(await fsSource.readTranscript(dir, 'p', 's.jsonl', 0), { text: 'aaa\nbbb\nccc\n', size: 12 });
  assert.deepEqual(await fsSource.readTranscript(dir, 'p', 's.jsonl', 4), { text: 'bbb\nccc\n', size: 12 });
  assert.deepEqual(await fsSource.readTranscript(dir, 'p', 's.jsonl', 12), { text: '', size: 12 });
  fs.writeFileSync(f, ('x'.repeat(99) + '\n').repeat(60000)); // 6,000,000 bytes
  const big = await fsSource.readTranscript(dir, 'p', 's.jsonl', 0);
  assert.equal(big.size, 6000000);
  assert.ok(big.text.length <= 5 * 1024 * 1024 && big.text.length > 5 * 1024 * 1024 - 100);
  assert.ok(big.text.startsWith('x'.repeat(99) + '\n'));
  for (const [p, n] of [['..', 's.jsonl'], ['p', '../s.jsonl'], ['p/..', 's.jsonl'], ['p', '..\\s.jsonl'], ['', 's.jsonl']]) {
    await assert.rejects(fsSource.readTranscript(dir, p, n, 0), /Bad name/);
  }
});

test('pty manager: open/write/resize/list/close/killAll with a fake pty', () => {
  const events = [];
  const fakes = [];
  const spawnFn = (file, args, o) => {
    let dataCb; let exitCb; const calls = [];
    const t = {
      calls, file, args, o,
      onData: (cb) => { dataCb = cb; }, onExit: (cb) => { exitCb = cb; },
      write: (d) => calls.push(['write', d]), resize: (c, r) => calls.push(['resize', c, r]),
      kill: () => { calls.push(['kill']); exitCb({ exitCode: 0 }); },
      emit: (d) => dataCb(d),
    };
    fakes.push(t);
    return t;
  };
  const m = createPtyManager({ spawnFn, onData: (id, d) => events.push(['data', id, d]), onExit: (id, c) => events.push(['exit', id, c]) });
  const a = m.open({ file: 'claude', args: [], cwd: '/a', env: {} }, { sessionId: SID, title: 'A' }, 100, 30);
  const b = m.open({ file: 'claude', args: [], cwd: '/b', env: {} }, { title: 'B' }, 0, 0);
  assert.notEqual(a, b);
  assert.equal(fakes[1].o.cols, 80);
  m.write(a, 'hi'); m.resize(a, 120, 40);
  assert.deepEqual(fakes[0].calls, [['write', 'hi'], ['resize', 120, 40]]);
  fakes[0].emit('out');
  assert.deepEqual(events[0], ['data', a, 'out']);
  assert.deepEqual(m.list().map((p) => [p.ptyId, p.sessionId, p.cwd, p.title]), [[a, SID, '/a', 'A'], [b, null, '/b', 'B']]);
  m.close(a);
  assert.equal(m.list().length, 1);
  m.killAll();
  assert.equal(m.list().length, 0);
  assert.equal(m.write('nope', 'x'), false);
});
