import test from 'node:test';
import assert from 'node:assert/strict';
import { newVisualState, appendVisual, parseVisual } from '../site/js/visualevents.js';

const L = (o) => JSON.stringify(o) + '\n';
const asst = (...content) => L({ type: 'assistant', message: { content } });
const user = (content) => L({ type: 'user', message: { content } });
const use = (id, name, input) => ({ type: 'tool_use', id, name, input });
const kinds = (r) => r.events.map((e) => e.kind);

test('you, claude, bad lines and unknown shapes', () => {
  const r = parseVisual(user('hi there') + asst({ type: 'text', text: 'Hello' }) + 'not json\n' + L({ type: 'mystery' }) + L(5) + asst({ type: 'weird' }, null));
  assert.deepEqual(r.events, [{ kind: 'you', text: 'hi there' }, { kind: 'claude', text: 'Hello' }]);
  assert.equal(r.badLines, 2);
});

test('action: counts lines, path, and the reason given just before', () => {
  const t = asst({ type: 'text', text: '  Fixing the title.  ' }, use('a', 'Edit', { file_path: '/p/a.js', old_string: 'x\ny', new_string: 'z' }))
    + asst(use('b', 'Write', { file_path: '/p/b.js', content: 'l1\nl2\nl3' }))
    + asst(use('c', 'MultiEdit', { file_path: '/p/c.js', edits: [{ old_string: 'a', new_string: 'b\nc' }, { old_string: 'd\ne', new_string: '' }, null] }))
    + user('now stop') + asst(use('d', 'Bash', { command: 'ls' }));
  const a = parseVisual(t).events.filter((e) => e.kind === 'action');
  assert.deepEqual(a[0], { kind: 'action', id: 'a', name: 'Edit', summary: 'Edited a.js', path: '/p/a.js', added: 1, removed: 2, why: 'Fixing the title.' });
  assert.deepEqual([a[1].added, a[1].removed, a[1].why], [3, 0, 'Fixing the title.']);
  assert.deepEqual([a[2].added, a[2].removed], [2, 3]);
  assert.deepEqual([a[3].why, a[3].path], ['', undefined]);
});

test('why is trimmed to 300 chars', () => {
  const a = parseVisual(asst({ type: 'text', text: 'x'.repeat(500) }, use('a', 'Bash', {}))).events.find((e) => e.kind === 'action');
  assert.equal(a.why.length, 300);
});

test('result, pending, and answered for a question', () => {
  const q = { questions: [{ question: 'Which?', header: 'Pick', multiSelect: false, options: [{ label: 'A', description: 'first' }, { label: 'B' }] }] };
  const r = parseVisual(asst(use('q1', 'AskUserQuestion', q), use('r1', 'Read', { file_path: '/x/y.txt' }))
    + user([{ type: 'tool_result', tool_use_id: 'q1', content: 'User answered: B' }, { type: 'tool_result', tool_use_id: 'r1', content: [{ type: 'text', text: 'y'.repeat(5000) }] }]));
  assert.deepEqual(kinds(r), ['question', 'pending', 'action', 'pending', 'result', 'answered', 'result']);
  assert.deepEqual(r.events[0], { kind: 'question', id: 'q1', questions: [{ question: 'Which?', header: 'Pick', multiSelect: false, options: [{ label: 'A', description: 'first' }, { label: 'B', description: '' }] }] });
  assert.deepEqual(r.events[1], { kind: 'pending', id: 'q1' });
  assert.equal(r.events[4].text, 'User answered: B');
  assert.deepEqual(r.events[5], { kind: 'answered', id: 'q1' });
  assert.equal(r.events[6].text.length, 4096);
});

test('tasks: TodoWrite, TaskCreate/TaskUpdate, missing fields', () => {
  const todo = parseVisual(asst(use('t', 'TodoWrite', { todos: [{ content: 'one', status: 'completed' }, { content: 'two' }, null] }))).events[0];
  assert.deepEqual(todo, { kind: 'tasks', items: [{ text: 'one', status: 'completed' }, { text: 'two', status: 'pending' }] });
  const r = parseVisual(asst(use('a', 'TaskCreate', { subject: 'build' }), use('b', 'TaskCreate', { subject: 'ship' }), use('c', 'TaskUpdate', { taskId: '2', status: 'in_progress' }), use('d', 'TaskUpdate', {}), use('e', 'TodoWrite', {})));
  const t = r.events.filter((e) => e.kind === 'tasks');
  assert.deepEqual(t[2].items, [{ text: 'build', status: 'pending' }, { text: 'ship', status: 'in_progress' }]);
  assert.deepEqual(t[3].items, t[2].items);
  assert.deepEqual(t[4].items, []);
});

test('visual: pages and pictures written, other files not', () => {
  const t = asst(use('1', 'Write', { file_path: '/p/a.HTML', content: '<p>' }), use('2', 'Edit', { file_path: '/p/b.png', old_string: '', new_string: '' }),
    use('3', 'Write', { file_path: '/p/c.js', content: '' }), use('4', 'Read', { file_path: '/p/d.html' }), use('5', 'Write', { file_path: '/p/n.md', content: '#' }));
  const v = parseVisual(t).events.filter((e) => e.kind === 'visual');
  assert.deepEqual(v, [{ kind: 'visual', path: '/p/a.HTML', type: 'html' }, { kind: 'visual', path: '/p/b.png', type: 'png' }, { kind: 'visual', path: '/p/n.md', type: 'md' }]);
});

test('chunks split mid-line give the same events; each event comes once', () => {
  const t = user('hello') + asst({ type: 'text', text: 'why' }, use('a', 'Edit', { file_path: '/p/a.js', old_string: 'a', new_string: 'b' }));
  const st = newVisualState();
  const got = [];
  for (let i = 0; i < t.length; i += 7) got.push(...appendVisual(st, t.slice(i, i + 7)));
  assert.deepEqual(got, parseVisual(t).events);
  assert.equal(got.length, 4);
  assert.equal(st.rest, '');
  assert.deepEqual(appendVisual(st, ''), []);
});

test('a last line with no newline is read by parseVisual', () => {
  assert.deepEqual(parseVisual(user('tail').trim()).events, [{ kind: 'you', text: 'tail' }]);
});
