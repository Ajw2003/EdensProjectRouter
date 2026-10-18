import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTitle } from '../site/js/titles.js';

test('system-inserted text gives empty title', () => {
  for (const t of ['<task-notification>x</task-notification>', '<local-command-caveat>c</local-command-caveat>',
    '<local-command-stdout>o', '<local-command-stderr>e', '<system-reminder>r', '<bash-stdout>o', '<bash-stderr>e',
    '<user-prompt-submit-hook>h', '<command-message>m', 'Stop hook feedback: x', 'Base directory for this skill: y',
    'Caveat: the messages below', '[Request interrupted by user]', 'This session is being continued from a previous conversation that']) {
    assert.equal(cleanTitle(t), '', t);
  }
});
test('slash command and bash input', () => {
  assert.equal(cleanTitle('<command-name>/model</command-name><command-args>opus</command-args>'), '/model opus');
  assert.equal(cleanTitle('<command-name>/clear</command-name>'), '/clear');
  assert.equal(cleanTitle('<bash-input>ls -la</bash-input>'), '! ls -la');
});
test('image markers, whitespace, length', () => {
  assert.equal(cleanTitle('look [Image #1]  at\n this'), 'look at this');
  assert.equal(cleanTitle('a'.repeat(100)).length, 60);
  assert.equal(cleanTitle('abcdef', 3), 'abc');
  assert.equal(cleanTitle(''), '');
  assert.equal(cleanTitle(null), '');
});
