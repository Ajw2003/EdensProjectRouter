import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HELP_TASKS, tasksFor } from '../site/js/help.js';

const SITE = fileURLToPath(new URL('../site/', import.meta.url));

test('every help task has a title, a picture that exists, alt text and one to three steps', () => {
  const ids = new Set();
  for (const t of HELP_TASKS) {
    assert.ok(!ids.has(t.id), 'duplicate id ' + t.id);
    ids.add(t.id);
    assert.ok(t.title, t.id + ' has no title');
    assert.ok(t.alt, t.id + ' has no alt text');
    assert.ok(existsSync(SITE + t.picture), t.id + ' picture missing: site/' + t.picture);
    assert.ok(t.steps.length >= 1 && t.steps.length <= 3, t.id + ' has ' + t.steps.length + ' steps');
    assert.ok(['app', 'web', 'both'].includes(t.where), t.id + ' where=' + t.where);
  }
});

test('the desktop app gets app and both tasks; the website gets web and both', () => {
  const app = tasksFor('desktop').map((t) => t.where);
  const web = tasksFor('browser').map((t) => t.where);
  assert.ok(app.length > 0 && app.every((w) => w === 'app' || w === 'both'));
  assert.ok(web.length > 0 && web.every((w) => w === 'web' || w === 'both'));
  assert.equal(new Set([...tasksFor('desktop'), ...tasksFor('browser')]).size, HELP_TASKS.length);
});
