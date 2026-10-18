import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parseTranscript } from '../site/js/transcript.js';
import {
  cleanedCopy, slugify, handoffFileName, dateStamp, mentionText, relativeInside, summaryArgs, SUMMARY_PROMPT, nestSessions, matchFork,
} from '../site/js/handoff.js';

const require = createRequire(import.meta.url);
const { buildSummaryCommand } = require('../desktop/launch.js');

const line = (o) => JSON.stringify(o);
const transcript = [
  line({ type: 'user', timestamp: '2026-10-01T10:00:00Z', message: { content: 'Fix the login bug' } }),
  line({ type: 'assistant', timestamp: '2026-10-01T10:00:05Z', message: { content: [
    { type: 'text', text: 'Looking at it now.' },
    { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/p/src/login.js' } },
    { type: 'tool_use', id: 't2', name: 'Edit', input: { file_path: '/p/src/login.js' } },
  ] } }),
  line({ type: 'user', timestamp: '2026-10-01T10:00:06Z', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'SECRET FILE CONTENTS' }] } }),
  line({ type: 'assistant', timestamp: '2026-10-01T10:00:09Z', message: { content: [{ type: 'text', text: 'Fixed.' }] } }),
].join('\n');

test('cleanedCopy: heading, You/Claude blocks, one line per tool, no tool results', () => {
  const md = cleanedCopy(parseTranscript(transcript).entries, { title: 'Fix login', project: 'webapp', ms: new Date(2026, 9, 1, 12).getTime(), id: 'abc' });
  assert.match(md, /^# Fix login\n\nProject: webapp · Date: 2026-10-01 · Session: abc\n/);
  assert.ok(md.indexOf('**You:**\n\nFix the login bug') < md.indexOf('**Claude:**\n\nLooking at it now.'));
  assert.ok(md.includes('- Read login.js\n- Edited login.js\n'));
  assert.ok(md.includes('**Claude:**\n\nFixed.'));
  assert.equal(md.includes('SECRET FILE CONTENTS'), false);
  assert.equal(md.split('\n').filter((l) => l.startsWith('- ')).length, 2);
});

test('slugify: lowercase ascii, dashes, 50 characters at most, never empty', () => {
  assert.equal(slugify('Fix the  Login Bug!'), 'fix-the-login-bug');
  assert.equal(slugify('Café déjà vu'), 'cafe-deja-vu');
  assert.equal(slugify('日本語'), 'session');
  assert.equal(slugify(''), 'session');
  const long = slugify('word '.repeat(40));
  assert.ok(long.length <= 50 && !long.endsWith('-'));
});

test('handoffFileName: date, slug, -2 and -3 when taken', () => {
  const ms = new Date(2026, 9, 18, 12).getTime();
  assert.equal(dateStamp(ms), '2026-10-18');
  assert.equal(handoffFileName(ms, 'Fix login', []), '2026-10-18-fix-login.md');
  assert.equal(handoffFileName(ms, 'Fix login', ['2026-10-18-fix-login.md']), '2026-10-18-fix-login-2.md');
  assert.equal(handoffFileName(ms, 'Fix login', ['2026-10-18-fix-login.md', '2026-10-18-fix-login-2.md']), '2026-10-18-fix-login-3.md');
  assert.equal(handoffFileName(ms, 'Fix login', ['2026-10-18-FIX-LOGIN.md']), '2026-10-18-fix-login-2.md');
});

test('mentionText: relative forward-slash path, quoted when it has spaces, null outside', () => {
  assert.equal(mentionText('/home/a/proj', '/home/a/proj/src/x.js'), '@src/x.js ');
  assert.equal(mentionText('C:\\Users\\Aj\\proj', 'C:\\Users\\Aj\\proj\\.router-handoff\\2026-10-18-x.md'), '@.router-handoff/2026-10-18-x.md ');
  assert.equal(mentionText('c:\\users\\aj\\proj\\', 'C:\\Users\\Aj\\proj\\docs\\a.md'), '@docs/a.md ');
  assert.equal(mentionText('/p', '/p/my docs/a b.md'), '@"my docs/a b.md" ');
  assert.equal(mentionText('/p', '/other/a.md'), null);
  assert.equal(mentionText('/p', '/pp/a.md'), null);
  assert.equal(relativeInside('/p', '/p'), null);
});

test('summaryArgs: the fixed read-only fork run, equal to the desktop one', () => {
  const id = '0123abcd-4567-89ef-0123-456789abcdef';
  const a = summaryArgs(id);
  // The prompt must come straight after -p: --tools takes a list, so a prompt after it is read as a tool name (checked with Claude Code 2.1.302).
  assert.deepEqual(a, ['-p', SUMMARY_PROMPT, '--resume', id, '--fork-session', '--no-session-persistence', '--tools', 'Read,Grep,Glob']);
  assert.match(SUMMARY_PROMPT, /goals.*decisions.*current state.*open problems.*key files/);
  const plan = buildSummaryCommand({ sessionId: id, cwd: process.cwd(), accountDir: '/h/.claude-w', homeDir: '/h', env: {}, platform: 'linux', claudePath: '/bin/claude' });
  assert.deepEqual(plan.args, a);
  assert.equal(plan.env.CLAUDE_CONFIG_DIR, '/h/.claude-w');
  assert.throws(() => buildSummaryCommand({ sessionId: 'x; rm', cwd: process.cwd(), accountDir: '/h', homeDir: '/h' }), /session id/);
});

test('nestSessions: a child follows its parent, indented; orphans and loops stay visible', () => {
  const s = (id) => ({ id });
  const out = nestSessions([s('a'), s('c'), s('b'), s('d')], { c: 'a', d: 'zzz' });
  assert.deepEqual(out.map((x) => x.s.id + ':' + x.depth), ['a:0', 'c:1', 'b:0', 'd:0']);
  const loop = nestSessions([s('x'), s('y')], { x: 'y', y: 'x' });
  assert.deepEqual(loop.map((x) => x.s.id).sort(), ['x', 'y']);
});

test('matchFork: the next new transcript of that account and project, or expiry after 60 s', () => {
  const p = { parent: 'p', accountId: 'a', project: 'proj', knownIds: ['p', 'q'], startedMs: 1000 };
  const ss = [{ id: 'p', accountId: 'a', project: 'proj' }, { id: 'o', accountId: 'b', project: 'proj' }, { id: 'z', accountId: 'a', project: 'other' }];
  assert.equal(matchFork(p, ss, 2000), null);
  assert.deepEqual(matchFork(p, ss, 62000), { expired: true });
  assert.deepEqual(matchFork(p, [...ss, { id: 'n', accountId: 'a', project: 'proj' }], 2000), { child: 'n' });
});
