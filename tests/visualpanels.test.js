import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCards } from '../site/js/visualcards.js';
import { visualItem, filesFromEvents } from '../site/js/visualpanels.js';
import { parseVisual } from '../site/js/visualevents.js';

const asst = (...c) => JSON.stringify({ type: 'assistant', message: { content: c } }) + '\n';
const use = (id, name, input) => ({ type: 'tool_use', id, name, input });
const LINK = 'https://' + 'claude.ai' + '/artifact/test';

test('cards: a picture and a page become visual cards, a claude.ai link becomes an artifact card', () => {
  const t = asst({ type: 'text', text: 'See ' + LINK + ' too.' }, use('a', 'Write', { file_path: 'out/p.png', content: 'x' }), use('b', 'Write', { file_path: '/w/rules.html', content: '<p>' }));
  const c = buildCards(parseVisual(t).events);
  assert.deepEqual(c.map((x) => x.kind), ['claude', 'artifact', 'action', 'visual', 'action', 'visual']);
  assert.equal(c[1].url, LINK);
  assert.deepEqual([c[3].path, c[3].type, c[5].type], ['out/p.png', 'png', 'html']);
});

test('visualItem resolves against the folder and names the kind; unknown or unresolvable gives null', () => {
  const i = visualItem({ path: 'out/p.png' }, '/w');
  assert.deepEqual([i.path, i.kind, i.name], ['/w/out/p.png', 'image', 'p.png']);
  assert.equal(visualItem({ path: 'x.txt' }, '/w'), null);
  assert.equal(visualItem({ path: 'p.png' }, ''), null);
});

test('filesFromEvents: changes grouped per file, newest changed file first, reads ignored', () => {
  const t = asst(use('1', 'Edit', { file_path: '/w/a.js', old_string: 'x', new_string: 'y' }), use('2', 'Write', { file_path: '/w/b.md', content: 'hi' }),
    use('3', 'Read', { file_path: '/w/c.js' }), use('4', 'MultiEdit', { file_path: '/w/a.js', edits: [{ old_string: 'y', new_string: 'z' }] }));
  const f = filesFromEvents(parseVisual(t).events);
  assert.deepEqual(f.map((x) => [x.name, x.changes.length]), [['a.js', 2], ['b.md', 1]]);
  assert.deepEqual(f[0].changes[0].edits, [{ before: 'x', after: 'y' }]);
  assert.deepEqual(f[1].changes[0].edits, [{ before: '', after: 'hi' }]);
});
