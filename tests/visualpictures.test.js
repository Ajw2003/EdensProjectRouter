import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVisual } from '../site/js/visualevents.js';
import { buildCards } from '../site/js/visualcards.js';
import { lineDiff } from '../site/js/visualpanels.js';

const PNG = 'iVBORw0KGgo='; // any base64 will do; the parser does not decode it
const lines = (...o) => o.map((x) => JSON.stringify(x)).join('\n') + '\n';

test('a picture Claude reads, and one the person pastes, become picture cards with data addresses', () => {
  const t = lines(
    { type: 'user', message: { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } }, { type: 'text', text: 'look at this' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'C:\\Users\\aj\\shot.png' } }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: PNG } }] }] } },
  );
  const cards = buildCards(parseVisual(t).events).filter((c) => c.kind === 'picture');
  assert.deepEqual(cards.map((c) => [c.from, c.src]), [['you', 'data:image/png;base64,' + PNG], ['claude', 'data:image/jpeg;base64,' + PNG]]);
});

test('an image block of another type, or one that is not base64, is left out', () => {
  const t = lines({ type: 'user', message: { role: 'user', content: [
    { type: 'image', source: { type: 'base64', media_type: 'image/svg+xml', data: PNG } },
    { type: 'image', source: { type: 'url', url: 'https://example.com/x.png' } }] } });
  assert.equal(parseVisual(t).events.filter((e) => e.kind === 'picture').length, 0);
});

test("Claude Code's own notices in the person's turn are not shown as typed by them", () => {
  const t = lines(
    { type: 'user', message: { role: 'user', content: '<task-notification>\n<status>completed</status>\n</task-notification>' } },
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'Stop hook feedback: fix it' }] } },
    { type: 'user', message: { role: 'user', content: 'a real question' } },
  );
  assert.deepEqual(parseVisual(t).events.filter((e) => e.kind === 'you').map((e) => e.text), ['a real question']);
});

test('lineDiff marks removed and added lines and keeps the unchanged ones', () => {
  assert.deepEqual(lineDiff('a\nb\nc', 'a\nB\nc'), [{ op: ' ', text: 'a' }, { op: '-', text: 'b' }, { op: '+', text: 'B' }, { op: ' ', text: 'c' }]);
  assert.deepEqual(lineDiff('', 'new'), [{ op: '+', text: 'new' }]);
  assert.deepEqual(lineDiff('old', ''), [{ op: '-', text: 'old' }]);
  const big = Array.from({ length: 700 }, (_, i) => 'l' + i).join('\n');
  assert.equal(lineDiff(big, big + '\nx').filter((l) => l.op === '+').length, 701, 'past the limit every line is listed as removed or added');
});
