import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parseVisual } from '../site/js/visualevents.js';
import * as vc from '../site/js/visualcards.js';
const keys = createRequire(import.meta.url)('../desktop/keys.js');

const L = (o) => JSON.stringify(o);
const a = (content) => L({ type: 'assistant', message: { content } });
const u = (content) => L({ type: 'user', message: { content } });
const events = (...lines) => parseVisual(lines.join('\n')).events;

test('key helpers agree with desktop/keys.js', () => {
  assert.equal(vc.keysForMessage('hi\r\nthere \u0001'), keys.keysForMessage('hi\r\nthere \u0001'));
  for (const [i, f] of [[0, 0], [2, 0], [0, 2], [1, 1]]) assert.equal(vc.keysForOption(i, f), keys.keysForOption(i, f));
  assert.equal(vc.keysEsc(), keys.keysEsc());
});

test('an action gets its Why from the text just before it, and its result', () => {
  const c = vc.buildCards(events(
    u('fix it'),
    a([{ type: 'text', text: 'I will read the config.' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/p/a.js' } }]),
    u([{ type: 'tool_result', tool_use_id: 't1', content: 'file text' }])));
  assert.deepEqual(c.map((x) => x.kind), ['you', 'claude', 'action']);
  assert.equal(c[2].why, 'I will read the config.');
  assert.equal(c[2].result, 'file text');
  assert.equal(c[2].done, true);
});

test('an action without a result is not done', () => {
  const c = vc.buildCards(events(a([{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }])));
  assert.equal(c[0].done, false);
});

const ask = a([{ type: 'tool_use', id: 'q1', name: 'AskUserQuestion', input: { questions: [{ question: 'Colour?', header: 'c', multiSelect: false, options: [{ label: 'Red (Recommended)', description: '' }, { label: 'Green', description: 'I suggest nothing' }, { label: 'Blue', description: '' }] }] } }]);

test('a question stays open until answered, then keeps the chosen answer', () => {
  let c = vc.buildCards(events(ask));
  assert.equal(c[0].kind, 'question');
  assert.equal(c[0].answered, false);
  assert.equal(vc.tappable(c[0]), true);
  c = vc.buildCards(events(ask, u([{ type: 'tool_result', tool_use_id: 'q1', content: 'User has answered your questions: "Colour?"="Green". You can now continue.' }])));
  assert.equal(c[0].answered, true);
  assert.equal(c[0].answer, 'Green');
});

test('suggested options', () => {
  const o = vc.buildCards(events(ask))[0].questions[0].options;
  assert.deepEqual(o.map(vc.isSuggested), [true, true, false]);
});

test('a multi-select or multi-question card is not tappable', () => {
  assert.equal(vc.tappable({ questions: [{ multiSelect: true, options: [{}] }] }), false);
  assert.equal(vc.tappable({ questions: [{ multiSelect: false, options: [{}] }, { multiSelect: false, options: [{}] }] }), false);
});

const perm = { kind: 'permission', options: ['Yes', "Yes, and don't ask again for npm test", 'No, and tell Claude what to do differently'], selected: 0 };

test('permission buttons map to the on-screen options by label', () => {
  assert.equal(vc.permissionKeys('allow', perm), '\r');
  assert.equal(vc.permissionKeys('always', perm), '\x1b[B\r');
  assert.equal(vc.permissionKeys('deny', perm), '\x1b[B\x1b[B\r');
  assert.equal(vc.permissionKeys('deny', { ...perm, selected: 2 }), '\r');
  assert.equal(vc.permissionKeys('always', { ...perm, options: ['Yes', 'No'] }), null);
  assert.equal(vc.permissionKeys('allow', { kind: 'question', options: ['Red'], selected: 0 }), null);
  assert.equal(vc.permissionKeys('allow', null), null);
});

test('option taps and my own answer', () => {
  const q = { kind: 'question', options: ['Red', 'Green', 'Type something.'], selected: 1 };
  assert.equal(vc.optionKeys(0, q), '\x1b[A\r');
  assert.equal(vc.optionKeys(0, { kind: null, options: [], selected: 0 }), null);
  assert.equal(vc.ownAnswerKeys('Teal', q), '\x1b[B\rTeal\r');
  assert.equal(vc.ownAnswerKeys('Teal', { ...q, options: ['Red', 'Green'] }), null);
  assert.equal(vc.ownAnswerKeys('  ', q), null);
});

test('permission text is the lines above the options; paths with spaces are quoted', () => {
  assert.equal(vc.permissionText(['', 'Bash command', '  npm test', 'Do you want to proceed?', '❯ 1. Yes', '  2. No']), 'Bash command\nnpm test\nDo you want to proceed?');
  assert.equal(vc.pathToType('/a b/c.png'), '"/a b/c.png"');
  assert.equal(vc.pathToType('/a/c.png'), '/a/c.png');
});
