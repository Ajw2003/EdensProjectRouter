import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVisual } from '../site/js/visualevents.js';
import * as c from '../site/js/calm.js';

const L = (o) => JSON.stringify(o);
const a = (content) => L({ type: 'assistant', message: { content } });
const u = (content) => L({ type: 'user', message: { content } });
const events = (...lines) => parseVisual(lines.join('\n')).events;
const ask = a([{ type: 'tool_use', id: 'q1', name: 'AskUserQuestion', input: { questions: [{ question: 'Which colour?', header: 'c', multiSelect: false, options: [{ label: 'Red', description: '' }] }] } }]);
const answer = u([{ type: 'tool_result', tool_use_id: 'q1', content: 'User has answered your questions: "Which colour?"="Red".' }]);

test('Needs you: newest first, one row per session, question and permission wording, notification text', () => {
  const list = c.needsYouList([
    { key: 'a|1', project: 'shop', accountId: 'a', kind: 'question', text: 'Which colour?', atMs: 100 },
    { key: 'b|2', project: 'blog', accountId: 'b', kind: 'permission', text: 'Bash command\nnpm test\nDo you want to proceed?', atMs: 300 },
    { key: 'a|1', project: 'shop', accountId: 'a', kind: 'question', text: 'dup', atMs: 999 },
  ]);
  assert.deepEqual(list.map((i) => i.key), ['b|2', 'a|1']);
  assert.equal(list[0].what, 'Wants to run npm test');
  assert.equal(list[1].what, 'Asks: Which colour?');
  assert.equal(c.notificationText(list[1]), 'shop needs you: Asks: Which colour?');
  assert.deepEqual(c.addedKeys(new Set(['a|1']), list).map((i) => i.key), ['b|2']);
  assert.deepEqual(c.needsYouList([]), []);
});

test('Needs you: a closed session waits only on its last unanswered question', () => {
  assert.equal(c.questionText(c.openQuestionOf([u('hi'), ask].join('\n'))), 'Which colour?');
  assert.equal(c.openQuestionOf([ask, answer].join('\n')), null);
  assert.equal(c.openQuestionOf(u('hi')), null);
});

test('presets: Calm, Balanced and Everything switch the kinds as the issue says', () => {
  const on = (n) => Object.entries(c.PRESETS[n]).filter(([, v]) => v).map(([k]) => k).sort();
  assert.deepEqual(on('calm'), ['notify', 'pictures', 'tasks', 'where', 'why']);
  assert.equal(c.PRESETS.calm.results, false);
  assert.equal(on('everything').length, c.KINDS.length);
  assert.deepEqual(on('balanced'), ['actions', 'artifacts', 'notify', 'pictures', 'tasks', 'where', 'why']);
  for (const n of Object.keys(c.PRESETS)) assert.equal(c.presetOf(c.setPreset(c.defaultSettings(), n)), n);
  assert.equal(c.presetOf(c.defaultSettings()), 'calm');
});

test('each switch flips on its own and the preset becomes custom', () => {
  for (const [k] of c.KINDS) {
    const s = c.setSwitch(c.setPreset(c.defaultSettings(), 'calm'), k, !c.PRESETS.calm[k]);
    assert.equal(s.switches[k], !c.PRESETS.calm[k], k);
    assert.equal(c.presetOf(s), 'custom', k);
    assert.equal(c.KINDS.filter(([o]) => o !== k).every(([o]) => s.switches[o] === c.PRESETS.calm[o]), true);
  }
  assert.deepEqual(c.setSwitch(c.defaultSettings(), 'nope', true), c.defaultSettings());
});

test('saved settings: junk falls back to Calm, reduce motion is kept', () => {
  assert.deepEqual(c.parseSettings(null), c.defaultSettings());
  assert.deepEqual(c.parseSettings('x'), c.defaultSettings());
  const s = c.parseSettings({ switches: { why: false, tasks: 'yes' }, reduceMotion: true });
  assert.equal(s.switches.why, false);
  assert.equal(s.switches.tasks, true);
  assert.equal(s.reduceMotion, true);
});

let n = 0;
const todo = (todos) => a([{ type: 'tool_use', id: 't' + (++n), name: 'TodoWrite', input: { todos } }]);
test('Now strip: steps move from next to now to done as tasks finish', () => {
  assert.equal(c.taskSteps(events(u('hi'))), null);
  const first = c.taskSteps(events(todo([{ content: 'Plan', status: 'in_progress' }, { content: 'Build', status: 'pending' }])));
  assert.deepEqual(first.steps.map((s) => s.state), ['now', 'next']);
  const later = c.taskSteps(events(todo([{ content: 'Plan', status: 'in_progress' }, { content: 'Build', status: 'pending' }]), todo([{ content: 'Plan', status: 'completed' }, { content: 'Build', status: 'in_progress' }])));
  assert.deepEqual(later.steps.map((s) => s.state), ['done', 'now']);
  assert.equal(later.done, 1);
});

test('Where you were: goal from the first message, last thing from the last action or words, both cut to 140', () => {
  const ev = events(u('<system-reminder>x</system-reminder>'), u('Make the checkout page faster'), a([{ type: 'text', text: 'On it.' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/p/a.js' } }]));
  const w = c.whereYouWere(ev, 'Untitled');
  assert.equal(w.goal, 'Make the checkout page faster');
  assert.match(w.last, /a\.js/);
  assert.equal(c.whereYouWere(events(u('x'.repeat(300)), a([{ type: 'text', text: 'y'.repeat(300) }])), '').last.length, 140);
  assert.equal(c.whereYouWere([], 'My title').goal, 'My title');
  assert.equal(c.whereYouWere([], ''), null);
  assert.equal(c.showWhere(0, c.IDLE_MS + 1), true);
  assert.equal(c.showWhere(1000, 1000 + c.IDLE_MS), false);
});
