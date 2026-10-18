'use strict';
const { execFileSync } = require('child_process');

let claudeCache; // undefined = not looked up yet; null = not found
function findClaude(platform) {
  if (claudeCache !== undefined) return claudeCache;
  const win = (platform || process.platform) === 'win32';
  let lines = [];
  try {
    const out = execFileSync(win ? 'where' : 'which', win ? ['claude'] : ['-a', 'claude'], { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch (e) {
    lines = []; // where/which exit non-zero when claude is not on PATH
  }
  let found = lines[0] || null;
  if (win && lines.length) found = lines.find((l) => /\.exe$/i.test(l)) || lines.find((l) => /\.cmd$/i.test(l)) || null;
  claudeCache = found;
  return found;
}
function resetClaudeCache() { claudeCache = undefined; }

// Keeps the last `max` characters of output. end is the total ever pushed, so a reader can tell which live chunks the
// snapshot already holds.
const BUFFER_MAX = 256 * 1024;
function createRingBuffer(max = BUFFER_MAX) {
  let chunks = [];
  let size = 0;
  let end = 0;
  return {
    push(s) {
      s = String(s);
      if (!s) return end;
      end += s.length;
      chunks.push(s);
      size += s.length;
      while (size > max) {
        const over = size - max;
        if (chunks[0].length <= over) { size -= chunks[0].length; chunks.shift(); } else { chunks[0] = chunks[0].slice(over); size -= over; }
      }
      return end;
    },
    snapshot() { return { data: chunks.join(''), end }; },
  };
}

// Owns node-pty processes keyed by ptyId. onData(ptyId, data), onExit(ptyId, exitCode).
function createPtyManager({ onData, onExit, spawnFn }) {
  const spawn = spawnFn || require('node-pty').spawn;
  const procs = new Map();
  let next = 1;
  return {
    open(plan, meta, cols, rows) {
      const term = spawn(plan.file, plan.args, {
        name: 'xterm-256color', cols: (cols | 0) || 80, rows: (rows | 0) || 24, cwd: plan.cwd, env: plan.env,
      });
      const ptyId = 'pty' + next++;
      const buf = createRingBuffer();
      procs.set(ptyId, { term, buf, sessionId: (meta && meta.sessionId) || null, cwd: plan.cwd, title: (meta && meta.title) || '' });
      term.onData((d) => { const end = buf.push(d); onData(ptyId, d, end); });
      term.onExit((e) => { procs.delete(ptyId); onExit(ptyId, e && e.exitCode); });
      return ptyId;
    },
    // { data, end } of the kept output, or null when there is no such pty.
    buffer(ptyId) { const p = procs.get(ptyId); return p ? p.buf.snapshot() : null; },
    write(ptyId, data) { const p = procs.get(ptyId); if (p) p.term.write(String(data)); return !!p; },
    resize(ptyId, cols, rows) { const p = procs.get(ptyId); if (p && cols > 0 && rows > 0) p.term.resize(cols | 0, rows | 0); return !!p; },
    close(ptyId) { const p = procs.get(ptyId); if (p) p.term.kill(); return !!p; },
    list() { return [...procs].map(([ptyId, p]) => ({ ptyId, sessionId: p.sessionId, cwd: p.cwd, title: p.title })); },
    killAll() { for (const p of procs.values()) { try { p.term.kill(); } catch (e) { console.error('pty kill failed:', e); } } },
  };
}

module.exports = { findClaude, resetClaudeCache, createPtyManager, createRingBuffer, BUFFER_MAX };
