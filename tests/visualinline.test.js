import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inlineNote, NOTE_CLOUD, NOTE_REMOTE } from '../site/js/visualinline.js';

test('inline note: remote wins, a file we cannot place is cloud, otherwise none', () => {
  assert.equal(inlineNote({ kind: 'html' }, true), NOTE_REMOTE);
  assert.equal(inlineNote(null, true), NOTE_REMOTE);
  assert.equal(inlineNote(null, false), NOTE_CLOUD);
  assert.equal(inlineNote({ kind: 'html' }, false), '');
});
