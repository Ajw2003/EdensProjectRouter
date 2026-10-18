import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { validateQuestion, answerFileName, askArgs, readOnlyState, readOnlyLabel, pickerList } from '../site/js/ask.js';

const require = createRequire(import.meta.url);
const { buildAskCommand } = require('../desktop/launch.js');
const handoff = require('../desktop/handoff.js');

const SID = '0123abcd-4567-89ef-0123-456789abcdef';
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'router-ask-'));
const base = { sessionId: SID, cwd, accountDir: '/h/.claude-w', homeDir: '/h', env: { PATH: 'p' }, platform: 'linux', claudePath: '/bin/claude', question: 'Where is the login code?' };

test('Ask command: the question goes in on stdin, in the other session cwd and account folder', () => {
  const p = buildAskCommand(base);
  assert.equal(p.file, '/bin/claude');
  assert.deepEqual(p.args, ['-p', '--resume', SID, '--fork-session', '--no-session-persistence', '--tools', 'Read,Grep,Glob']);
  assert.deepEqual(p.args, askArgs(SID));
  assert.equal(p.input, 'Where is the login code?');
  assert.equal(p.cwd, cwd);
  assert.equal(p.env.CLAUDE_CONFIG_DIR, '/h/.claude-w');
  assert.equal(buildAskCommand({ ...base, accountDir: '/h/.claude' }).env.CLAUDE_CONFIG_DIR, undefined);
  assert.equal(buildAskCommand({ ...base, question: '  padded \n' }).input, 'padded');
  // a question full of shell characters goes in on stdin unchanged and never reaches the arguments
  const odd = 'say "hi" & echo %PATH% | x > y\nline two $(id) `id`';
  const q = buildAskCommand({ ...base, question: odd });
  assert.equal(q.args.length, 7);
  assert.equal(q.input, odd);
});

test('Ask command: refuses an empty question, a bad id and a missing folder', () => {
  for (const bad of ['', '   \n\t', null, undefined, 5]) assert.throws(() => buildAskCommand({ ...base, question: bad }), /question/);
  assert.throws(() => buildAskCommand({ ...base, sessionId: 'x; rm' }), /session id/);
  assert.throws(() => buildAskCommand({ ...base, cwd: path.join(cwd, 'nope') }), /no longer exists/);
  assert.throws(() => buildAskCommand({ ...base, question: 'x'.repeat(4001) }), /longer than/);
  assert.throws(() => validateQuestion('  '), /question/);
  assert.equal(validateQuestion('  hi  '), 'hi');
});

test('Ask command on Windows: a .cmd goes through cmd.exe /d /s /c and the question stays off the command line, unchanged', () => {
  const win = { ...base, platform: 'win32', claudePath: 'C:\\npm\\claude.cmd' };
  const p = buildAskCommand({ ...win, question: 'plain question' });
  assert.equal(p.file, 'cmd.exe');
  assert.deepEqual(p.args.slice(0, 4), ['/d', '/s', '/c', 'C:\\npm\\claude.cmd']);
  assert.deepEqual(p.args.slice(4), ['-p', '--resume', SID, '--fork-session', '--no-session-persistence', '--tools', 'Read,Grep,Glob']);
  const nasty = 'a "quoted" word & calc | type x > y < z ^ %USERPROFILE% %%\r\nsecond line\n\nthird';
  const n = buildAskCommand({ ...win, question: nasty });
  assert.equal(n.input, nasty.trim());
  assert.equal(n.question, nasty.trim());
  assert.deepEqual(n.args.slice(4), ['-p', '--resume', SID, '--fork-session', '--no-session-persistence', '--tools', 'Read,Grep,Glob']);
  // a plain .exe launcher is spawned directly, the question untouched
  const e = buildAskCommand({ ...win, claudePath: 'C:\\x\\claude.exe', question: nasty });
  assert.equal(e.file, 'C:\\x\\claude.exe');
  assert.equal(e.input, nasty.trim());
});

test('answer file name: <date>-answer-<slug>.md, counted up when taken', () => {
  const ms = new Date(2026, 9, 18, 12).getTime();
  assert.equal(answerFileName(ms, 'Where is the login code?', []), '2026-10-18-answer-where-is-the-login-code.md');
  assert.equal(answerFileName(ms, 'Where is the login code?', ['2026-10-18-answer-where-is-the-login-code.md']), '2026-10-18-answer-where-is-the-login-code-2.md');
  assert.equal(answerFileName(ms, '???', []), '2026-10-18-answer.md');
  assert.ok(answerFileName(ms, 'q'.repeat(300), []).length < 80);
});

test('read-only button: enabled with room, disabled at 5-hour 100%, disabled with no reading unless allowed', () => {
  assert.deepEqual(readOnlyState({ fiveHourPct: 40, weeklyPct: 12 }, false, 'work'), { enabled: true, reason: '', unknown: false });
  assert.equal(readOnlyState({ fiveHourPct: 99.4, weeklyPct: 100 }, false, 'work').enabled, true); // weekly alone does not block
  const full = readOnlyState({ fiveHourPct: 100, weeklyPct: 3 }, false, 'work');
  assert.equal(full.enabled, false);
  assert.match(full.reason, /5-hour.*work.*100%/);
  assert.equal(readOnlyState({ fiveHourPct: 100, weeklyPct: 3 }, true, 'work').enabled, false); // the checkbox never overrides a full limit
  for (const none of [undefined, null, { fiveHourPct: null, weeklyPct: null }]) {
    const s = readOnlyState(none, false, 'work');
    assert.equal(s.enabled, false);
    assert.equal(s.unknown, true);
    assert.match(s.reason, /No limit reading for work.*Ask without a limit reading/);
    assert.equal(readOnlyState(none, true, 'work').enabled, true);
  }
});

test('read-only label uses the Summary wording', () => {
  assert.equal(readOnlyLabel('work', { fiveHourPct: 40, weeklyPct: 12 }), 'Ask a read-only copy (uses usage on work: 5-hour 40%, weekly 12%)');
  assert.equal(readOnlyLabel('work', undefined), 'Ask a read-only copy (uses usage on work: no reading)');
});

test('picker: all accounts, newest first, not the asking session, searchable', () => {
  const s = (id, accountId, title, project, t) => ({ id, accountId, title, project, lastActiveMs: t });
  const all = [s('a', 'x', 'Old thing', 'alpha', 1), s('b', 'y', 'Newest', 'beta', 9), s('c', 'x', 'Me', 'alpha', 5), s('a', 'y', 'Same id other account', 'beta', 4)];
  assert.deepEqual(pickerList(all, { accountId: 'x', id: 'c' }, '').map((v) => v.title), ['Newest', 'Same id other account', 'Old thing']);
  assert.deepEqual(pickerList(all, { accountId: 'x', id: 'c' }, 'BETA new').map((v) => v.title), ['Newest']);
  assert.equal(pickerList(all, null, '').length, 4);
});

test('handoff.ask: runs in the other cwd, returns stdout; a failure carries the first line of stderr only', async () => {
  const calls = [];
  const fake = (code, out, err) => (file, args, o) => {
    calls.push({ file, args, o });
    const c = new EventEmitter();
    c.stdout = new EventEmitter();
    c.stderr = new EventEmitter();
    c.kill = () => {};
    c.stdin = new EventEmitter();
    c.stdin.end = (d) => { c.stdin.got = d; };
    c.got = () => c.stdin.got;
    calls[calls.length - 1].child = c;
    setImmediate(() => { if (out) c.stdout.emit('data', out); if (err) c.stderr.emit('data', err); c.emit('close', code); });
    return c;
  };
  assert.equal(await handoff.ask({ ...base, spawnFn: fake(0, 'It is in auth.js\n') }), 'It is in auth.js\n');
  assert.equal(calls[0].o.cwd, cwd);
  assert.equal(calls[0].child.got(), base.question);
  assert.ok(!calls[0].args.includes(base.question));
  await assert.rejects(handoff.ask({ ...base, spawnFn: fake(1, '', 'Error: Input must be provided\nstack line 2') }), (e) => /code 1/.test(e.message) && /Input must be provided/.test(e.message) && !/stack line 2/.test(e.message));
  await assert.rejects(handoff.ask({ ...base, spawnFn: fake(0, ' \n') }), /no answer/);
  await assert.rejects(handoff.ask({ ...base, question: ' ', spawnFn: fake(0, 'x') }), /question/);
  assert.equal(calls.length, 3);
});
