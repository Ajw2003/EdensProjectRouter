import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTranscript, appendTranscript, newTranscriptState } from '../site/js/transcript.js';

const L = (o) => JSON.stringify(o);
const ts = (n) => '2026-10-18T10:00:0' + n + '.000Z';
const lines = [
  L({ type: 'mode', mode: 'default' }),
  L({ type: 'user', timestamp: ts(1), message: { content: 'Fix the bug' } }),
  L({ type: 'user', isMeta: true, timestamp: ts(1), message: { content: 'meta text' } }),
  L({ type: 'user', timestamp: ts(2), message: { content: [{ type: 'text', text: 'Look at this' }, { type: 'image', source: {} }] } }),
  L({ type: 'user', timestamp: ts(2), message: { content: '<local-command-caveat>x</local-command-caveat>' } }),
  L({ type: 'user', timestamp: ts(2), message: { content: '<command-name>/clear</command-name><command-message>clear</command-message>' } }),
  L({ type: 'assistant', timestamp: ts(3), message: { content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'On it.' },
    { type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: 'C:\\code\\app\\main.js' } },
    { type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'x'.repeat(100) } },
    { type: 'tool_use', id: 't3', name: 'Grep', input: { pattern: 'foo' } },
    { type: 'tool_use', id: 't4', name: 'Task', input: {} }] } }),
  L({ type: 'attachment', attachment: {} }),
  'not json {',
  L({ type: 'user', timestamp: ts(4), message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' },
    { type: 'tool_result', tool_use_id: 't2', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
    { type: 'tool_result', tool_use_id: 't3', content: 'z'.repeat(5000) }] } }),
];
const text = lines.join('\n') + '\n';

test('parses entries', () => {
  const { entries, badLines } = parseTranscript(text);
  assert.equal(badLines, 1);
  assert.deepEqual(entries.map((e) => e.kind), ['you', 'you', 'you', 'claude', 'tool', 'tool', 'tool', 'tool']);
  assert.equal(entries[0].text, 'Fix the bug');
  assert.equal(entries[1].text, 'Look at this');
  assert.equal(entries[2].text, '/clear');
  assert.equal(entries[4].summary, 'Edited main.js');
  assert.equal(entries[4].detail, 'ok');
  assert.equal(entries[5].summary, 'Ran ' + 'x'.repeat(80));
  assert.equal(entries[5].detail, 'a\nb');
  assert.equal(entries[6].summary, 'Searched foo');
  assert.equal(entries[6].detail.length, 4096);
  assert.equal(entries[7].summary, 'Task');
  assert.equal(entries[0].at, Date.parse(ts(1)));
});

test('split chunk gives the same result', () => {
  const st = newTranscriptState();
  appendTranscript(st, text.slice(0, 300));
  appendTranscript(st, text.slice(300));
  assert.deepEqual(st.entries, parseTranscript(text).entries);
  assert.equal(st.badLines, 1);
  assert.equal(st.rest, '');
});

test('unfinished line waits', () => {
  const st = appendTranscript(newTranscriptState(), lines[1].slice(0, 20));
  assert.equal(st.entries.length, 0);
  assert.equal(st.badLines, 0);
});
