import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionForPage, textToType, waitQuiet, confirmation } from '../site/js/sendreply.js';

const sessions = [{ accountId: 'a', id: 's1', title: 'One' }, { accountId: 'b', id: 's2', title: 'Two' }];

test('sessionForPage: the session that wrote the page, matched by account too', () => {
  assert.equal(sessionForPage({ sessionId: 's2', accountId: 'b' }, sessions).title, 'Two');
  assert.equal(sessionForPage({ sessionId: 's2', accountId: 'a' }, sessions), null);
});
test('sessionForPage: newest of several, skipping ones not in the list; none known gives null', () => {
  const c = [{ sessionId: 's1', accountId: 'a', at: 5 }, { sessionId: 's2', accountId: 'b', at: 9 }, { sessionId: 'gone', at: 20 }];
  assert.equal(sessionForPage(c, sessions).id, 's2');
  assert.equal(sessionForPage({ sessionId: '' }, sessions), null);
  assert.equal(sessionForPage(null, sessions), null);
});
test('textToType: no trailing newline or Enter, inner newlines kept, control characters dropped', () => {
  assert.equal(textToType('Use option B.\n'), 'Use option B.');
  assert.equal(textToType('a\r\nb\r\n\r\n'), 'a\nb');
  assert.equal(textToType('x\r'), 'x');
  assert.equal(textToType('ok\x1b[31m\x03'), 'ok[31m');
  assert.equal(textToType('   '), '');
  assert.equal(textToType(null), '');
  assert.ok(!/[\r\n]$/.test(textToType('line\n\n')));
});
test('confirmation text', () => {
  assert.equal(confirmation('Fix bug'), 'Typed into Fix bug. Press Enter there to send.');
});

function fake() {
  let t = 1000;
  return { env: { now: () => t, sleep: async (ms) => { t += ms; } }, at: () => t };
}
test('waitQuiet: output that never came counts from the start (1.5 s)', async () => {
  const f = fake();
  assert.equal(await waitQuiet(() => null, f.env), 'quiet');
  assert.equal(f.at() - 1000, 1500);
});
test('waitQuiet: new output restarts the quiet time', async () => {
  const f = fake();
  let last = 1000;
  const env = { now: f.env.now, sleep: async (ms) => { await f.env.sleep(ms); if (f.at() === 2000 || f.at() === 2500) last = f.at(); } };
  assert.equal(await waitQuiet(() => last, env), 'quiet');
  assert.equal(f.at(), 4000);
});
test('waitQuiet: gives up at the 20 s cap when output never stops', async () => {
  const f = fake();
  assert.equal(await waitQuiet(() => f.at(), f.env), 'cap');
  assert.equal(f.at() - 1000, 20000);
});
