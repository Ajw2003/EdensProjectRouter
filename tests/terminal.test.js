import test from 'node:test';
import assert from 'node:assert/strict';
import { panelKey, newPanelKey, panelToShow } from '../site/js/terminal.js';

test('panelKey matches the list key', () => assert.equal(panelKey('a1', 's9'), 'a1|s9'));
test('newPanelKey is distinct per number', () => assert.notEqual(newPanelKey(1), newPanelKey(2)));
test('panelToShow: only a selected key that has a panel', () => {
  assert.equal(panelToShow('a|1', ['a|1', 'new:1']), 'a|1');
  assert.equal(panelToShow('a|2', ['a|1']), null);
  assert.equal(panelToShow(null, ['a|1']), null);
});
