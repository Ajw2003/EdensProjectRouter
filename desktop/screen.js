'use strict';
// Renders raw pty output the way a terminal would: Claude Code moves the cursor with escapes instead of typing spaces,
// so stripping ANSI from the raw text glues words together. @xterm/headless is a devDependency (tests and checks only, not in the installer).
const { Terminal } = require('@xterm/headless');

// -> Promise<string[]>: the visible rows, trailing blanks trimmed per row.
function renderScreen(raw, cols = 100, rows = 40) {
  const term = new Terminal({ cols, rows, allowProposedApi: true });
  return new Promise((resolve) => {
    term.write(String(raw || ''), () => {
      const buf = term.buffer.active;
      const lines = [];
      for (let y = 0; y < rows; y++) { const l = buf.getLine(buf.viewportY + y); lines.push(l ? l.translateToString(true) : ''); }
      term.dispose();
      resolve(lines);
    });
  });
}

// The rows a viewer needs: trailing blank rows dropped, at most the last `max`.
const tailRows = (rows, max = 60) => {
  let n = rows.length;
  while (n > 0 && !String(rows[n - 1]).trim()) n--;
  return rows.slice(Math.max(0, n - max), n);
};

module.exports = { renderScreen, tailRows };
