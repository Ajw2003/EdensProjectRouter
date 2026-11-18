import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const keys = require('../desktop/keys.js');
const { createPtyManager } = require('../desktop/pty.js');
const FAKE = fileURLToPath(new URL('./fake-claude.cjs', import.meta.url));

test('key sequences', () => {
  assert.equal(keys.keysForMessage('hi\x07 there\r\nline2  \n'), 'hi there\nline2\r');
  assert.equal(keys.keysForOption(0), '\r');
  assert.equal(keys.keysForOption(2), '\x1b[B\x1b[B\r');
  assert.equal(keys.keysForOption(0, 2), '\x1b[A\x1b[A\r');
  assert.equal(keys.keysEsc(), '\x1b');
  assert.equal(keys.keysForAllow(), '\r');
  assert.equal(keys.keysForDeny(['Yes', 'Yes, always', 'No']), '\x1b[B\x1b[B\r');
  assert.equal(keys.keysForDeny(), '\r'); // labels unknown: last of none
  assert.equal(keys.keysForAllow(['No', 'Yes']), '\x1b[B\r');
});

test('screenWaiting reads the selector from a screen with ANSI', () => {
  const perm = 'old text\r\n\x1b[1mDo you want to proceed?\x1b[0m\r\n\x1b[36m❯ 1. Yes\x1b[0m\r\n  2. Yes, and don\'t ask again\r\n  3. No, and tell Claude what to do\r\n';
  assert.deepEqual(keys.screenWaiting(perm), { kind: 'permission', options: ['Yes', "Yes, and don't ask again", 'No, and tell Claude what to do'], selected: 0 });
  const q = '│ Which colour? │\n│ ❯ 1. Red │\n│   2. Green │\n│   3. Other │\n';
  assert.deepEqual(keys.screenWaiting(q), { kind: 'question', options: ['Red', 'Green', 'Other'], selected: 0 });
  assert.equal(keys.screenWaiting('1. only one\n').kind, null);
  assert.equal(keys.screenWaiting('just text\n> prompt').kind, null);
  assert.equal(keys.screenWaiting('').kind, null);
});

// A missing @xterm/headless makes this require throw, so these tests fail loudly instead of skipping.
const { renderScreen } = require('../desktop/screen.js');

test('screenWaiting reads a raw capture that moves the cursor instead of typing spaces', async () => {
  const w = (s) => s.split(' ').join('\x1b[1C');
  const raw = '\x1b[2J\x1b[H' + w('Do you want to proceed?') + '\r\n' + '\x1b[36m❯\x1b[1C1.\x1b[1CYes\x1b[0m\r\n' + '\x1b[2C' + w('2. No, and tell Claude what to do') + '\r\n';
  assert.match(String(raw).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, ''), /Doyouwant/); // the old strip-only path glues words
  const lines = await renderScreen(raw);
  assert.equal(lines[0], 'Do you want to proceed?');
  assert.deepEqual(keys.screenWaiting(lines), { kind: 'permission', options: ['Yes', 'No, and tell Claude what to do'], selected: 0 });
});

test('screenWaiting reads the unnumbered theme list', async () => {
  const theme = ['Let\'s get started.', '', 'Choose the text style that looks best with your terminal', '', '❯ ✔ Auto (match terminal)', '  Dark mode', '  Light mode', '', ' Enter to confirm'];
  assert.deepEqual(keys.screenWaiting(theme), { kind: 'question', options: ['Auto (match terminal)', 'Dark mode', 'Light mode'], selected: 0 });
  const lines = await renderScreen(theme.join('\r\n'));
  assert.deepEqual(keys.screenWaiting(lines).options, ['Auto (match terminal)', 'Dark mode', 'Light mode']);
  assert.equal(keys.screenWaiting(theme.join('\n')).selected, 0);
  assert.equal(keys.screenWaiting(['──────', '❯ ', '──────', '  ? for shortcuts']).kind, null); // the prompt box is not a selector
});

// Runs the fake through createPtyManager (child process wrapped as a pty); send(screenWaiting) gives the keys once a selector shows.
function run(mode, send) {
  return new Promise((resolve, reject) => {
    let out = '';
    let sent = false;
    const spawnFn = (file, args) => {
      const c = spawn(file, args, { stdio: 'pipe' });
      return {
        onData: (cb) => c.stdout.on('data', (d) => cb(String(d))),
        onExit: (cb) => c.on('exit', (code) => cb({ exitCode: code })),
        write: (d) => c.stdin.write(d), kill: () => c.kill(), resize() {},
      };
    };
    const m = createPtyManager({
      spawnFn,
      onData: (id, d) => { out += d; const w = keys.screenWaiting(out); if (!sent && w.kind) { sent = true; m.write(id, send(w)); } },
      onExit: () => resolve(out),
    });
    m.open({ file: process.execPath, args: [FAKE, mode], cwd: process.cwd(), env: process.env }, {}, 80, 24);
    setTimeout(() => { m.killAll(); reject(new Error('timeout, output: ' + JSON.stringify(out))); }, 5000).unref();
  });
}

test('question: an option tap reaches the fake', async () => {
  assert.match(await run('question', (s) => keys.keysForOption(1, s.selected)), /chose: Green/);
  assert.match(await run('question', () => keys.keysForOption(2)), /chose: Blue/);
});

test('permission: Allow, Deny by label and Esc reach the fake', async () => {
  assert.match(await run('permission', (s) => keys.keysForAllow(s.options)), /chose: Yes\n/);
  assert.match(await run('permission', (s) => keys.keysForDeny(s.options)), /chose: No, and tell/);
  assert.match(await run('permission', () => keys.keysEsc()), /cancelled/);
});

test('typed message reaches the fake', async () => {
  const out = await new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [FAKE, 'chat']);
    let o = '';
    c.stdout.on('data', (d) => { o += d; if (o.includes('ready')) c.stdin.write(keys.keysForMessage('hello\x07 world')); if (o.includes('got:')) { c.kill(); resolve(o); } });
    setTimeout(() => { c.kill(); reject(new Error('timeout')); }, 5000).unref();
  });
  assert.match(out, /got: hello world\n/);
});
