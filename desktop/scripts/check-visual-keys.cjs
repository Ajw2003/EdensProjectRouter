'use strict';
// Real-Claude check, not part of npm test: node desktop/scripts/check-visual-keys.cjs
// Needs node-pty and a signed-in `claude`. Starts claude in a temp folder, asks it to use AskUserQuestion with two options,
// sends keysForOption(1), then looks in the transcript for the tool_result naming the second option. One short exchange.
// Prints only screen text and the result line; nothing is written outside the temp folder.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPtyManager, findClaude } = require('../pty');
const keys = require('../keys');
const { renderScreen } = require('../screen');

const claude = findClaude();
if (!claude) { console.error('check-visual-keys: claude not found on PATH'); process.exit(2); }
const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'router-vk-')));
const projDir = path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '');
let out = '';
let state = 'start';
// Run from inside a Claude session, the marker is inherited and turns transcript saving off.
const childEnv = { ...process.env, TERM: 'xterm-256color' };
delete childEnv.CLAUDE_CODE_CHILD_SESSION;
let setupTimer = null;
let lastLines = [];
let setups = 0;
const m = createPtyManager({
  onData: (id, d) => { out += d; step(id); },
  onExit: () => finish('claude exited'),
});
const id = m.open({ file: claude, args: [], cwd, env: childEnv }, {}, 100, 40);
const timer = setTimeout(() => finish('timeout (120 s) in state ' + state), 120000);
const prompt = 'Use the AskUserQuestion tool once, with a single question "Pick a colour" and exactly two options: "Red" and "Green". Then say which one I picked and stop.';

let busy = false;
let again = false;
async function step(ptyId) {
  if (busy) { again = true; return; } // rendering is async; data that arrives meanwhile gets one more look after
  busy = true;
  try { do { again = false; await look(ptyId); } while (again); } finally { busy = false; }
}
async function look(ptyId) {
  const lines = await renderScreen(out);
  const text = lines.join('\n');
  const w = keys.screenWaiting(lines);
  lastLines = lines;
  const tail = lines.filter((l) => l.trim()).slice(-3).join('\n');
  if (state === 'start' && w.kind && !setupTimer) {
    // First-run screens (theme, folder trust) are selectors: answer by name (Yes when offered), never a blind Enter,
    // because the folder-trust list highlights "No, exit".
    const yes = w.options.findIndex((o) => /^yes/i.test(o));
    setupTimer = setTimeout(() => { setupTimer = null; setups++; console.log('check-visual-keys: setup screen ' + setups + ', options ' + JSON.stringify(w.options) + (yes >= 0 ? ', picked ' + w.options[yes] : '')); m.write(ptyId, yes >= 0 ? keys.keysForAllow(w.options, w.selected) : keys.keysForOption(w.selected, w.selected)); }, 800);
  } else if (state === 'start' && !setupTimer && /Enter to continue/.test(tail)) {
    setupTimer = setTimeout(() => { setupTimer = null; setups++; console.log('check-visual-keys: setup screen ' + setups + ', Enter to continue'); m.write(ptyId, '\r'); }, 800);
  } else if (state === 'start' && /❯|>/.test(text) && !w.kind && /\?\s+for shortcuts|Try "/.test(text)) {
    state = 'asked'; m.write(ptyId, keys.keysForMessage(prompt));
  } else if (state === 'asked' && w.kind === 'question' && w.options.some((o) => /^red/i.test(o)) && w.options.some((o) => /^green/i.test(o))) {
    state = 'picked'; console.log('check-visual-keys: selector seen: ' + JSON.stringify(w)); setTimeout(() => m.write(ptyId, keys.keysForOption(1, w.selected)), 500);
  } else if (state === 'picked') {
    const t = latestTranscript();
    if (t && /tool_result/.test(t) && /Green/.test(t.slice(t.indexOf('tool_result')))) finish(null, t);
  }
}
function latestTranscript() {
  try {
    const fs2 = fs.readdirSync(projDir).filter((f) => f.endsWith('.jsonl'));
    return fs2.map((f) => fs.readFileSync(path.join(projDir, f), 'utf8')).join('\n');
  } catch (e) { return null; }
}
function finish(why, transcript) {
  clearTimeout(timer);
  const t = transcript || latestTranscript() || '';
  const line = t.split('\n').find((l) => l.includes('"tool_result"') && /Green/.test(l));
  m.killAll();
  if (line) { console.log('check-visual-keys: PASS, tool_result names Green: ' + (JSON.parse(line).message.content.map((b) => b.content).join(' ').slice(0, 200))); process.exit(0); }
  console.error('check-visual-keys: FAIL (' + why + '). Screen tail:\n' + lastLines.filter((l) => l.trim()).slice(-25).join('\n'));
  process.exit(1);
}
