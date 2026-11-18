'use strict';
// Fake Claude Code for tests. argv[2] = permission | question | chat.
// permission/question print a numbered selector; arrow keys move the cursor, Enter prints "chose: <label>", a lone Esc prints "cancelled".
// visual (needs FAKE_TRANSCRIPT = a .jsonl path): a long-lived chat that also writes the transcript as it goes. A word in the line picks the
// scene: act (text, a Read action, a reply), ask (a question selector), perm (a permission selector), slow (a reply Esc interrupts),
// a .png/.jpg path (says it saw an image). Anything else gets a plain reply.
// chat prints "got: <text>" for each line typed.
const mode = process.argv[2] || 'chat';
const sets = {
  permission: ['Yes', "Yes, and don't ask again for npm test", 'No, and tell Claude what to do differently'],
  question: ['Red', 'Green', 'Blue'],
};
if (mode === 'visual') return require('./fake-claude-visual.cjs')();
const labels = sets[mode];
let cur = 0;
const draw = () => {
  process.stdout.write('\x1b[2K' + (mode === 'permission' ? 'Do you want to proceed?\n' : 'Which colour?\n'));
  labels.forEach((l, i) => process.stdout.write((i === cur ? '\x1b[36m❯ ' : '  ') + (i + 1) + '. ' + l + '\x1b[0m\n'));
};
if (labels) draw(); else process.stdout.write('ready\n');
let line = '';
process.stdin.on('data', (d) => {
  const s = String(d);
  if (!labels) {
    for (const ch of s) { if (ch === '\r' || ch === '\n') { process.stdout.write('got: ' + line + '\n'); line = ''; } else line += ch; }
    return;
  }
  if (s === '\x1b') { process.stdout.write('cancelled\n'); process.exit(0); }
  for (let i = 0; i < s.length;) {
    if (s.startsWith('\x1b[B', i)) { cur = Math.min(cur + 1, labels.length - 1); i += 3; } else if (s.startsWith('\x1b[A', i)) { cur = Math.max(cur - 1, 0); i += 3; } else if (s[i] === '\r') { process.stdout.write('chose: ' + labels[cur] + '\n'); process.exit(0); } else i++;
  }
});
