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
        result(id, 'User has answered your questions: "Which colour?"="' + a + '". You can now continue with the answers in mind.'); say('Using ' + a + '.'); prompt(); process.stdout.write('chose: ' + a + '\n');
      });
    } else if (/\bperm\b/.test(text)) {
      say('I need to run the tests.');
      tool(id, 'Bash', { command: 'npm test', description: 'Run the tests' });
      select('Bash command: npm test\nDo you want to proceed?', ['Yes', "Yes, and don't ask again for npm test in /tmp/demo", 'No, and tell Claude what to do differently (esc)'], (a) => {
        if (/^yes/i.test(a)) { result(id, 'tests passed'); say('The tests passed.'); } else { result(id, "The user doesn't want to proceed with this tool use."); say('Understood, I did not run the tests.'); }
        prompt();
      });
    } else if (/\bmake\b/.test(text)) {
      // Writes real files in the working folder: a PNG, a house-rules page with a copy box, a Markdown file, an edit, and a claude.ai link.
      const path = require('path'); const zlib = require('zlib');
      const dir = process.cwd(); const f = (n) => path.join(dir, n);
      const crcT = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
      const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
      const chunk = (t, d) => { const b = Buffer.concat([Buffer.from(t), d]); const o = Buffer.alloc(4); o.writeUInt32BE(d.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(b)); return Buffer.concat([o, b, c]); };
      const W = 160; const H = 100; const raw = Buffer.alloc((W * 3 + 1) * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = y * (W * 3 + 1); raw[o + 1 + x * 3] = 40 + x; raw[o + 2 + x * 3] = 120; raw[o + 3 + x * 3] = 200 - y; }
      const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
      fs.writeFileSync(f('diagram.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
      fs.writeFileSync(f('house-rules.html'), '<!doctype html><meta charset="utf-8"><title>House rules</title><h1>House rules</h1><label><input type="checkbox" id="q" checked> Quiet after 10pm</label><br><button id="c" onclick="navigator.clipboard.writeText(\'House rules: quiet after 10pm = yes\')">Copy my choices</button>');
      fs.writeFileSync(f('notes.md'), '# Notes\n\n- **bold** point\n- second point\n');
      fs.writeFileSync(f('config.txt'), 'port=8080\n');
      say('Here is the diagram, the house rules page and some notes. Draft: ' + 'https://' + 'claude.ai' + '/artifact/test');
      tool(id + 'a', 'Write', { file_path: f('diagram.png'), content: 'png' }); result(id + 'a', 'ok');
      tool(id + 'b', 'Write', { file_path: f('house-rules.html'), content: '<h1>House rules</h1>' }); result(id + 'b', 'ok');
      tool(id + 'c', 'Write', { file_path: f('notes.md'), content: '# Notes\n\n- **bold** point\n- second point\n' }); result(id + 'c', 'ok');
      tool(id + 'd', 'Edit', { file_path: f('config.txt'), old_string: 'port=80', new_string: 'port=8080' }); result(id + 'd', 'ok');
      say('Done.'); prompt();
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
