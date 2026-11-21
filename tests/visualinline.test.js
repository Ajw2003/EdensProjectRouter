import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inlineNote, NOTE_CLOUD } from '../site/js/visualinline.js';

test('inline note: a file we cannot place is cloud, otherwise none', () => {
  assert.equal(inlineNote(null), NOTE_CLOUD);
  assert.equal(inlineNote({ kind: 'html' }), '');
});
