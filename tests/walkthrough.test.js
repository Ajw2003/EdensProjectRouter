import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampStep, stepLabel, sessionCountText, addResultInfo, reporterResultText, NO_PROJECTS_TEXT } from '../site/js/walkthrough.js';

test('step labels and clamping', () => {
  assert.equal(stepLabel(0), 'Step 1 of 3');
  assert.equal(stepLabel(2), 'Step 3 of 3');
  assert.equal(stepLabel(9), 'Step 3 of 3');
  assert.equal(clampStep(-1), 0);
});
test('session count wording', () => {
  assert.equal(sessionCountText(0), '0 sessions');
  assert.equal(sessionCountText(1), '1 session');
  assert.equal(sessionCountText(7), '7 sessions');
});
test('addResultInfo', () => {
  assert.equal(addResultInfo(null).kind, 'cancelled');
  assert.deepEqual(addResultInfo({ error: 'no-projects', message: 'x' }), { kind: 'error', text: NO_PROJECTS_TEXT });
  assert.match(NO_PROJECTS_TEXT, /Pick the folder named \.claude$/);
  assert.equal(addResultInfo({ error: 'unsupported', message: 'Use Edge' }).text, 'Use Edge');
  assert.equal(addResultInfo({ id: 'a', name: '.claude' }).kind, 'added');
});
test('reporterResultText', () => {
  assert.equal(reporterResultText(null, 'on'), 'On');
  assert.equal(reporterResultText(null, 'off'), 'Not on yet');
  assert.equal(reporterResultText(new Error('denied'), 'off'), "Couldn't turn it on: denied");
});
