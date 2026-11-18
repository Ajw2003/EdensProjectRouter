'use strict';
// The long-lived chat behind `fake-claude.cjs visual`; it also writes the transcript (FAKE_TRANSCRIPT, a .jsonl path) as it goes.
module.exports = function visual() {
  const fs = require('fs');
  const file = process.env.FAKE_TRANSCRIPT;
  const w = (o) => fs.appendFileSync(file, JSON.stringify(o) + '\n');
  const say = (text) => w({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
  const tool = (id, name, input) => w({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } });
  const result = (id, content) => w({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content }] } });
  const clear = () => process.stdout.write('\x1b[2J\x1b[H');
  const prompt = () => { clear(); process.stdout.write('ready >\n'); };
  let sel = null; let typing = null; let line = ''; let slow = null; let n = 0;
  const select = (title, opts, done) => {
    let cur = 0;
    const draw = () => { clear(); process.stdout.write(title + '\n'); opts.forEach((l, i) => process.stdout.write((i === cur ? '\x1b[36m❯ ' : '  ') + (i + 1) + '. ' + l + '\x1b[0m\n')); };
    draw();
    sel = {
      move(d) { cur = Math.max(0, Math.min(opts.length - 1, cur + d)); draw(); },
      enter() {
        const i = cur; sel = null;
        if (opts[i] === 'Type something.') { typing = (t) => { typing = null; done(t); }; clear(); process.stdout.write('Type your answer:\n'); } else done(opts[i]);
      },
    };
  };
  // A word in the line picks the scene: act, ask, perm, slow, or an image path; anything else gets a plain reply.
  const handle = (text) => {
    w({ type: 'user', message: { content: text } });
    const id = 'toolu_' + (++n);
    if (/\bact\b/.test(text)) {
      say('I will read the config first, to see which port it uses.');
      tool(id, 'Read', { file_path: '/tmp/demo/config.json' });
      result(id, '{\n  "port": 8080,\n  "host": "localhost"\n}');
      say('The port is 8080.'); prompt();
    } else if (/\bask\b/.test(text)) {
      say('Which colour should I use?');
      tool(id, 'AskUserQuestion', { questions: [{ question: 'Which colour?', header: 'Colour', multiSelect: false, options: [{ label: 'Red (Recommended)', description: 'Matches the logo' }, { label: 'Green', description: 'Calmer' }, { label: 'Blue', description: 'Neutral' }] }] });
      select('Which colour?', ['Red (Recommended)', 'Green', 'Blue', 'Type something.', 'Chat about this'], (a) => {
        result(id, 'User has answered your questions: "Which colour?"="' + a + '". You can now continue with the answers in mind.'); say('Using ' + a + '.'); prompt();
      });
    } else if (/\bperm\b/.test(text)) {
      say('I need to run the tests.');
      tool(id, 'Bash', { command: 'npm test', description: 'Run the tests' });
      select('Bash command: npm test\nDo you want to proceed?', ['Yes', "Yes, and don't ask again for npm test in /tmp/demo", 'No, and tell Claude what to do differently (esc)'], (a) => {
        if (/^yes/i.test(a)) { result(id, 'tests passed'); say('The tests passed.'); } else { result(id, "The user doesn't want to proceed with this tool use."); say('Understood, I did not run the tests.'); }
        prompt();
      });
    } else if (/\bslow\b/.test(text)) {
      process.stdout.write('thinking... (esc to interrupt)\n');
      slow = setTimeout(() => { slow = null; say('That took a while.'); prompt(); }, 60000);
    } else if (/\.(png|jpe?g)/i.test(text)) { say('I can see the image you attached.'); process.stdout.write('image attached\n'); } else say('You said: ' + text);
  };
  prompt();
  // Raw mode, like Claude Code: otherwise the terminal holds a lone Esc until Enter.
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on('data', (d) => {
    const s = String(d);
    if (s === '\x1b' && slow) { clearTimeout(slow); slow = null; w({ type: 'user', message: { content: '[Request interrupted by user]' } }); say('Stopped.'); clear(); process.stdout.write('interrupted\n'); return; }
    for (let i = 0; i < s.length;) {
      if (s.startsWith('\x1b[B', i)) { if (sel) sel.move(1); i += 3; } else if (s.startsWith('\x1b[A', i)) { if (sel) sel.move(-1); i += 3; } else if (s[i] === '\r' || s[i] === '\n') {
        if (sel) sel.enter(); else if (typing) { const t = line; line = ''; typing(t); } else if (line.trim()) { const t = line; line = ''; handle(t); }
        i++;
      } else { if (!sel) line += s[i]; i++; }
    }
  });
};
