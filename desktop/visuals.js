'use strict';
// Visuals for the main process: finds a project's viewable files, remembers which folders router-file:// may serve, and turns
// the Show tool on or off for an account. The finding itself is the pure site/js/visualsfind.js, loaded with import().
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');
const fsSource = require('./fsSource');
const { checkRequest, fileUrl } = require('./filesguard');

let sitePath = path.join(__dirname, '..', 'site');
let mods = null;
function setSitePath(p) { sitePath = p; mods = null; }
function loadMods() {
  if (!mods) {
    const url = (f) => pathToFileURL(path.join(sitePath, 'js', f)).href;
    mods = Promise.all([import(url('visualsfind.js')), import(url('transcript.js'))]).then(([find, tr]) => ({ find, tr }));
    mods.catch(() => { mods = null; });
  }
  return mods;
}

// Folders router-file:// may serve: the working folder of every session seen, and of every Show tool line.
const roots = new Set();
const knownRoots = () => [...roots];

// Parsed transcripts, kept while the file's size and time are the same: { size, mtimeMs, cwd, entries }.
const cache = new Map();

function cwdOf(text) {
  for (const line of text.split('\n')) {
    if (!line.includes('"cwd"')) continue;
    try { const o = JSON.parse(line); if (o && typeof o.cwd === 'string' && o.cwd) return o.cwd; } catch (e) { /* a bad line is skipped; the transcript view reports those */ }
  }
  return '';
}

async function sessionVisuals(dir, s, m) {
  const full = path.join(dir, 'projects', String(s.projectDir), String(s.file));
  const st = await fs.promises.stat(full);
  const key = full;
  let c = cache.get(key);
  if (!c || c.size !== st.size || c.mtimeMs !== st.mtimeMs) {
    const r = await fsSource.readTranscript(dir, s.projectDir, s.file, 0);
    const cwd = cwdOf(r.text);
    const entries = m.tr.parseTranscript(r.text).entries;
    c = { size: st.size, mtimeMs: st.mtimeMs, cwd, entries };
    cache.set(key, c);
  }
  return c;
}

async function exists(p) {
  try { return (await fs.promises.stat(p)).isFile(); } catch (e) { return false; }
}

// project: { name, sessions: [{ id, projectDir, file, cwd }] } (the sessions of this account). showsFile: path of shows.jsonl.
// Resolves { entries, cwds, problems } with entries newest first, only files that still exist (links are kept).
async function listVisuals(dir, project, showsFile) {
  const m = await loadMods();
  const sessions = project && Array.isArray(project.sessions) ? project.sessions : [];
  const lists = [];
  const cwds = new Set();
  const problems = [];
  for (const s of sessions) {
    if (!s || !s.projectDir || !s.file) continue;
    try {
      const c = await sessionVisuals(dir, s, m);
      const cwd = c.cwd || s.cwd || '';
      if (cwd) cwds.add(cwd);
      lists.push(m.find.findVisuals(c.entries, { cwd, sessionId: String(s.file).replace(/\.jsonl$/, '') }));
    } catch (e) {
      problems.push('Could not read ' + s.file + ': ' + ((e && e.message) || e));
    }
  }
  if (showsFile) {
    try {
      const text = await fs.promises.readFile(showsFile, 'utf8');
      const r = m.find.parseShows(text, [...cwds]);
      lists.push(r.entries);
      if (r.bad) problems.push(r.bad + ' line' + (r.bad === 1 ? '' : 's') + ' in shows.jsonl could not be read.');
    } catch (e) {
      if (e.code !== 'ENOENT') problems.push('Could not read shows.jsonl: ' + ((e && e.message) || e));
    }
  }
  for (const c of cwds) roots.add(c);
  const merged = m.find.mergeVisuals(...lists);
  const entries = [];
  for (const v of merged) {
    if (v.kind === 'artifact' || await exists(v.path)) {
      const ok = v.kind === 'artifact' || checkRequest(fileUrl(v.path), knownRoots()).ok;
      entries.push({ ...v, name: v.kind === 'artifact' ? 'Claude artifact' : path.basename(v.path.replace(/\\/g, '/')), inProject: ok });
    }
  }
  return { entries, cwds: [...cwds], problems };
}

// ---------- the Show tool for an account ----------
// The user-scope MCP servers of an account live in <config dir>/.claude.json (we always set CLAUDE_CONFIG_DIR).
async function showToolState(accountDir) {
  try {
    const o = JSON.parse(await fs.promises.readFile(path.join(accountDir, '.claude.json'), 'utf8'));
    return o && o.mcpServers && o.mcpServers['router-show'] ? 'on' : 'off';
  } catch (e) {
    if (e.code === 'ENOENT') return 'off';
    throw new Error('Could not read the Show tool setting: ' + ((e && e.message) || e));
  }
}

// The two command lines, as { args, env }; env is added to the process environment of the claude command.
function showToolCommand(on, accountDir, exe, serverPath) {
  const env = { CLAUDE_CONFIG_DIR: accountDir };
  const args = on
    ? ['mcp', 'add', '--scope', 'user', 'router-show', '-e', 'ELECTRON_RUN_AS_NODE=1', '--', exe, serverPath]
    : ['mcp', 'remove', '--scope', 'user', 'router-show'];
  return { args, env };
}

// Runs claude. Resolves with its output; rejects with a message that says what claude printed.
function setShowTool(on, accountDir, { claudePath, exe, serverPath }) {
  if (!claudePath) return Promise.reject(new Error("Claude Code wasn't found. Install it, then try again."));
  const cmd = showToolCommand(on, accountDir, exe, serverPath);
  return new Promise((resolve, reject) => {
    execFile(claudePath, cmd.args, { env: { ...process.env, ...cmd.env }, windowsHide: true, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error('claude ' + cmd.args.slice(0, 3).join(' ') + ' failed: ' + (String(stderr || stdout || '').trim() || err.message)));
      resolve(String(stdout || '').trim());
    });
  });
}

module.exports = { listVisuals, setSitePath, knownRoots, roots, showToolState, showToolCommand, setShowTool, cwdOf };
