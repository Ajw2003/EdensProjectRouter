'use strict';
// Key presses for a Claude Code terminal, and a reader for its numbered selector.

// Same cleaning as site/js/sendreply.js textToType (that file is ESM; this one is CommonJS): line breaks stay as line feeds, other control characters go.
function cleanText(text) {
  const t = String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
  return t.replace(/\s+$/, '');
}
const keysForMessage = (text) => cleanText(text) + '\r';
// from = the option the cursor starts on (screenWaiting().selected); 0 = first.
const keysForOption = (index, from = 0) => {
  const n = (index | 0) - (from | 0);
  return (n >= 0 ? '\x1b[B' : '\x1b[A').repeat(Math.abs(n)) + '\r';
};
const keysEsc = () => '\x1b';

// labels (from screenWaiting) pick by name: first 'Yes...' to allow, first 'No...' to deny. Unknown labels: first / last.
function pick(labels, re, fallback, from) {
  const l = Array.isArray(labels) ? labels : [];
  const i = l.findIndex((x) => re.test(x));
  return keysForOption(i >= 0 ? i : fallback(l), from);
}
const keysForAllow = (labels, from) => pick(labels, /^yes\b/i, () => 0, from);
const keysForDeny = (labels, from) => pick(labels, /^no\b/i, (l) => Math.max(l.length - 1, 0), from);

const TAIL_LINES = 40;
// Reads the end of the pty buffer. -> { kind: 'permission'|'question'|null, options: [labels], selected: index of the cursor }
function screenWaiting(screenText) {
  const text = String(screenText || '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[()][A-Za-z0-9]/g, '').replace(/\r/g, '\n');
  const lines = text.split('\n').slice(-TAIL_LINES);
  let options = []; let found = false;
  for (let k = lines.length - 1; k >= 0; k--) {
    const m = /^[\s│|]*([❯>])?\s*(\d+)\.\s+(.+?)[\s│|]*$/.exec(lines[k]);
    if (m) { options.unshift({ n: Number(m[2]), label: m[3], cur: !!m[1] }); found = true; } else if (found && lines[k].trim()) break;
  }
  // Keep the run that counts 1, 2, 3...; a leftover higher block above it is dropped.
  const i1 = options.map((o) => o.n).lastIndexOf(1);
  options = i1 >= 0 ? options.slice(i1) : [];
  const run = [];
  for (const o of options) { if (o.n === run.length + 1) run.push(o); else break; }
  if (run.length < 2) return { kind: null, options: [], selected: 0 };
  const selected = Math.max(run.findIndex((o) => o.cur), 0);
  const labels = run.map((o) => o.label);
  const permission = labels.some((x) => /^yes\b/i.test(x)) && labels.some((x) => /^no\b/i.test(x));
  return { kind: permission ? 'permission' : 'question', options: labels, selected };
}

module.exports = { keysForMessage, keysForOption, keysForAllow, keysForDeny, keysEsc, screenWaiting };
